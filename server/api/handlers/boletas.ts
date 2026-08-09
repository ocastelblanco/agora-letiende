import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { verificarFirmaBoleta } from '../lib/firma-boletas';
import { generarQrPng } from '../services/qr';
import { respuestaJson } from '../lib/http';

// Placeholder honesto: mismo texto ya usado en el JSON-LD de
// DetalleEventoComponent, no una dirección real verificada (TODO.md
// Tarea 2 no incluye levantar/confirmar la dirección exacta de Le Tiende).
const DIRECCION_LE_TIENDE = 'Bogotá, Colombia';

// Mensaje único para "firma inválida" y "boleta inexistente" — nunca
// distinguir los dos casos, o la respuesta se vuelve un oráculo que permite
// enumerar boletaId reales probando firmas (CLAUDE.md §5, A02).
const MENSAJE_BOLETA_INVALIDA = 'Boleta inválida o inexistente';

interface BoletaAlmacenada {
  boletaId: string;
  eventoId: string;
  compraId: string;
  numeroEnCompra: number;
  etapaId: string;
  valorUnitario: number;
  estado: string;
  ingresoEn?: string;
  ingresoPor?: string;
  emitidaEn: string;
}

/** Construye la URL pública de un objeto bajo `eventos/*` de `BucketActivos` — mismo criterio que `eventos-publicos.ts`. */
function urlPublicaActivo(key: string): string {
  const bucket = process.env['BUCKET_ACTIVOS'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Separa `{boletaId}.{firma}` por el último punto — el UUID no contiene puntos, la firma tampoco. */
function separarCodigo(codigo: string): { boletaId: string; firma: string } | null {
  const indice = codigo.lastIndexOf('.');
  if (indice <= 0 || indice === codigo.length - 1) {
    return null;
  }
  return { boletaId: codigo.slice(0, indice), firma: codigo.slice(indice + 1) };
}

/**
 * `GET /api/boletas/:codigo` — público, firma HMAC obligatoria (`tech-specs.md`
 * §5.5, `TODO.md` Tarea 2). La firma se verifica **antes** de cualquier
 * lectura a DynamoDB (rechazo barato), y la respuesta es idéntica tanto si
 * la firma es inválida como si el `boletaId` no existe — nunca se distingue,
 * para no dar pie a enumerar boletas reales probando firmas.
 *
 * Deliberadamente no valida el ingreso — eso es `POST /api/boletas/:codigo/validar`
 * (roadmap #13, Validación en puerta), todavía sin implementar.
 */
async function obtenerBoletaDigital(codigo: string | undefined): Promise<APIGatewayProxyResultV2> {
  if (!codigo) {
    return respuestaJson(400, { mensaje: 'Falta el código de la boleta en la ruta' });
  }

  const separado = separarCodigo(codigo);
  if (!separado || !verificarFirmaBoleta(separado.boletaId, separado.firma)) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }
  const { boletaId } = separado;

  const resultadoBoleta = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_BOLETAS'], Key: { boletaId } }),
  );
  const boleta = resultadoBoleta.Item as BoletaAlmacenada | undefined;
  if (!boleta) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }

  const [resultadoEvento, resultadoCompra] = await Promise.all([
    documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: boleta.eventoId } }),
    ),
    documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_COMPRAS'], Key: { compraId: boleta.compraId } }),
    ),
  ]);
  const evento = resultadoEvento.Item;
  const compra = resultadoCompra.Item;
  if (!evento) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }

  const etapas = Array.isArray(evento['etapas']) ? evento['etapas'] : [];
  const etapa = etapas.find((e: Record<string, unknown>) => e['etapaId'] === boleta.etapaId) as
    | Record<string, unknown>
    | undefined;

  const urlBase = process.env['URL_BASE_APP'] ?? '';
  const urlBoleta = `${urlBase}/boleta/${codigo}`;
  const qrPng = (await generarQrPng(urlBoleta)).toString('base64');

  return respuestaJson(200, {
    boletaId: boleta.boletaId,
    numeroEnCompra: boleta.numeroEnCompra,
    estado: boleta.estado,
    nombreEvento: evento['nombre'],
    descripcionEvento: evento['descripcion'],
    fechaHora: evento['fechaHora'],
    direccion: DIRECCION_LE_TIENDE,
    logotipoUrl: typeof evento['logotipoKey'] === 'string' ? urlPublicaActivo(evento['logotipoKey']) : undefined,
    etapaNombre: etapa?.['nombre'],
    nombreCliente: compra?.['cliente']?.['nombre'],
    qrPng,
  });
}

/** `GET /api/boletas/:codigo` — único endpoint de esta tarea (`TODO.md` Tarea 2). */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const codigo = evento.pathParameters?.['codigo'];

  try {
    if (evento.requestContext.http.method === 'GET') {
      return await obtenerBoletaDigital(codigo);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
