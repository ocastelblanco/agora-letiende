import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { hashearToken } from '../lib/enlaces-magicos';
import { CanalCorreoSes } from '../services/notificaciones';
import { respuestaJson } from '../lib/http';

const canalNotificacion = new CanalCorreoSes();

// Mismo criterio que las imágenes de evento (eventos.ts), más
// application/pdf — SVG nunca está permitido como comprobante, es vector
// de XSS (CLAUDE.md §5, A08).
const TIPOS_MIME_COMPROBANTE_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAMANO_MAXIMO_COMPROBANTE_BYTES = 10 * 1024 * 1024;

interface CompraParaComprobante {
  compraId: string;
  eventoId: string;
  cantidad: number;
  estado: string;
  expiraEn: number;
  comprobanteKey?: string;
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

function leerCuerpo(evento: APIGatewayProxyEventV2): unknown {
  if (!evento.body) {
    return null;
  }
  try {
    return JSON.parse(evento.body);
  } catch {
    return undefined;
  }
}

function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

async function buscarCompraPorToken(token: string): Promise<CompraParaComprobante | null> {
  const resultado = await documentoDynamoDB.send(
    new QueryCommand({
      TableName: process.env['TABLA_COMPRAS'],
      IndexName: 'tokenComprobanteHash-index',
      KeyConditionExpression: 'tokenComprobanteHash = :hash',
      ExpressionAttributeValues: { ':hash': hashearToken(token) },
      Limit: 1,
    }),
  );
  const item = resultado.Items?.[0];
  return item ? (item as CompraParaComprobante) : null;
}

type ResultadoValidacionToken =
  | { valido: true; compra: CompraParaComprobante }
  | { valido: false; respuesta: APIGatewayProxyResultV2 };

/**
 * Valida el token del enlace mágico antes de cualquier operación
 * (`CLAUDE.md` §5, A07) — distingue explícitamente enlace inexistente,
 * vencido y ya usado, nunca un 404 genérico que deje al cliente sin saber
 * qué le pasó a su compra (`TODO.md` Tarea 2). Trata como vencida una
 * compra cuyo `expiraEn` ya pasó aunque el TTL de DynamoDB todavía no haya
 * borrado el ítem (mismo criterio que `compras.ts`).
 */
async function validarToken(token: string | undefined): Promise<ResultadoValidacionToken> {
  if (!token) {
    return { valido: false, respuesta: respuestaJson(400, { mensaje: 'Falta el token en la ruta' }) };
  }

  const compra = await buscarCompraPorToken(token);
  if (!compra) {
    return { valido: false, respuesta: respuestaJson(404, { mensaje: 'Enlace inválido o inexistente' }) };
  }

  const yaVencio = compra.expiraEn <= Math.floor(Date.now() / 1000);
  if (yaVencio) {
    return {
      valido: false,
      respuesta: respuestaJson(410, {
        mensaje: 'Este enlace ya venció y la reserva se canceló. Puedes volver a intentar la compra.',
      }),
    };
  }

  if (compra.estado !== 'esperando_comprobante') {
    return { valido: false, respuesta: respuestaJson(409, { mensaje: 'Este enlace ya fue usado' }) };
  }

  return { valido: true, compra };
}

/**
 * `POST /api/comprobantes/:token/url-carga` — URL prefirmada de S3 para
 * subir el comprobante. La `key` se persiste en la compra (nunca se acepta
 * del cliente en `confirmar`) para que la verificación de tipo de archivo
 * lea exactamente lo que esta función autorizó a subir, no una key
 * arbitraria.
 */
async function generarUrlCargaComprobante(
  token: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const validacion = await validarToken(token);
  if (!validacion.valido) {
    return validacion.respuesta;
  }

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const tipoMime = datos['tipoMime'];
  if (typeof tipoMime !== 'string' || !TIPOS_MIME_COMPROBANTE_VALIDOS.has(tipoMime)) {
    return respuestaJson(400, {
      mensaje: 'tipoMime debe ser image/jpeg, image/png, image/webp o application/pdf — SVG no está permitido',
    });
  }

  const tamano = datos['tamano'];
  if (!esEnteroPositivo(tamano) || tamano > TAMANO_MAXIMO_COMPROBANTE_BYTES) {
    return respuestaJson(400, {
      mensaje: `tamano debe ser un entero positivo de máximo ${TAMANO_MAXIMO_COMPROBANTE_BYTES} bytes`,
    });
  }

  const extension = tipoMime.split('/')[1];
  const key = `compras/${validacion.compra.compraId}/comprobante-${randomUUID()}.${extension}`;

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: validacion.compra.compraId },
        UpdateExpression: 'SET comprobanteKey = :key',
        ConditionExpression: 'estado = :esperando',
        ExpressionAttributeValues: { ':key': key, ':esperando': 'esperando_comprobante' },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Este enlace ya fue usado' });
    }
    throw error;
  }

  const url = await getSignedUrl(
    clienteS3,
    new PutObjectCommand({
      Bucket: process.env['BUCKET_COMPROBANTES'],
      Key: key,
      ContentType: tipoMime,
      ContentLength: tamano,
    }),
    { expiresIn: 900 },
  );

  return respuestaJson(200, { url, key });
}

/**
 * Firmas de los primeros bytes de cada formato aceptado — la única fuente
 * de verdad sobre el tipo real del archivo (`CLAUDE.md` §5, A08: nunca el
 * `Content-Type` declarado ni la extensión). WEBP se identifica por
 * `RIFF....WEBP`, no solo por el prefijo `RIFF` (que también usan otros
 * contenedores).
 */
function esTipoArchivoValido(cabecera: Uint8Array): boolean {
  const empiezaCon = (offset: number, firma: number[]): boolean =>
    firma.every((byte, indice) => cabecera[offset + indice] === byte);

  if (empiezaCon(0, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (empiezaCon(0, [0x89, 0x50, 0x4e, 0x47])) return true; // PNG
  if (empiezaCon(0, [0x25, 0x50, 0x44, 0x46])) return true; // %PDF
  if (empiezaCon(0, [0x52, 0x49, 0x46, 0x46]) && empiezaCon(8, [0x57, 0x45, 0x42, 0x50])) return true; // RIFF....WEBP

  return false;
}

/**
 * `POST /api/comprobantes/:token/confirmar` — lee los primeros bytes del
 * objeto ya subido a S3 para verificar su tipo real (nunca confía en lo
 * que el cliente declaró en `url-carga`); si es válido, consume el enlace
 * con una única escritura condicional y notifica a los productores del
 * evento, best-effort.
 */
async function confirmarComprobante(token: string | undefined): Promise<APIGatewayProxyResultV2> {
  const validacion = await validarToken(token);
  if (!validacion.valido) {
    return validacion.respuesta;
  }
  const { compra } = validacion;

  if (!compra.comprobanteKey) {
    return respuestaJson(400, { mensaje: 'Primero debes subir tu comprobante' });
  }

  const objeto = await clienteS3.send(
    new GetObjectCommand({
      Bucket: process.env['BUCKET_COMPROBANTES'],
      Key: compra.comprobanteKey,
      Range: 'bytes=0-11',
    }),
  );
  const cabecera = (await objeto.Body?.transformToByteArray()) ?? new Uint8Array();

  if (!esTipoArchivoValido(cabecera)) {
    await clienteS3
      .send(new DeleteObjectCommand({ Bucket: process.env['BUCKET_COMPROBANTES'], Key: compra.comprobanteKey }))
      .catch(() => {
        // Best-effort: el objeto inválido queda huérfano en el peor caso,
        // no bloquea la respuesta al cliente.
      });
    return respuestaJson(400, {
      mensaje: 'El archivo subido no es una imagen o PDF válido. Intenta de nuevo.',
    });
  }

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression: 'SET estado = :enRevision',
        ConditionExpression: 'estado = :esperando',
        ExpressionAttributeValues: { ':enRevision': 'en_revision', ':esperando': 'esperando_comprobante' },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Este enlace ya fue usado' });
    }
    throw error;
  }

  try {
    const resultadoEvento = await documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: compra.eventoId } }),
    );
    const nombreEvento = resultadoEvento.Item?.['nombre'];
    const productores = resultadoEvento.Item?.['productores'];
    if (typeof nombreEvento === 'string' && Array.isArray(productores)) {
      await Promise.all(
        productores
          .filter((correo): correo is string => typeof correo === 'string')
          .map((correo) =>
            canalNotificacion.enviar({ correo, nombre: correo }, 'aviso_comprobante', {
              nombreEvento,
              cantidad: compra.cantidad,
            }),
          ),
      );
    }
  } catch {
    // Best-effort (mismo criterio que compras.ts): la compra ya pasó a
    // en_revision aunque la notificación falle. Nunca se registran datos
    // personales del cliente en logs (CLAUDE.md §5, A09).
  }

  return respuestaJson(200, { estado: 'en_revision' });
}

/**
 * `POST /api/comprobantes/:token/url-carga`, `POST /api/comprobantes/:token/confirmar`
 * — sin `exigirRol`: el token del enlace mágico es la única credencial
 * (`TODO.md` Tarea 2, `tech-specs.md` §8.3).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const token = evento.pathParameters?.['token'];
  const esUrlCarga = (evento.rawPath ?? '').endsWith('/url-carga');
  const esConfirmar = (evento.rawPath ?? '').endsWith('/confirmar');

  try {
    if (esUrlCarga && evento.requestContext.http.method === 'POST') {
      return await generarUrlCargaComprobante(token, evento);
    }
    if (esConfirmar && evento.requestContext.http.method === 'POST') {
      return await confirmarComprobante(token);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
