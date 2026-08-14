import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { hashearToken } from '../lib/enlaces-magicos';
import { firmarCodigoBoleta } from '../lib/firma-boletas';
import { ErrorAforo, confirmarSillas, liberarSillas } from '../services/aforo';
import { emitirBoletas } from '../services/boleteria';
import { CanalCorreoSes } from '../services/notificaciones';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';

const canalNotificacion = new CanalCorreoSes();

// El enlace de aprobación es compartido por todos los productores del
// evento (mismo criterio que aviso_comprobante, que ya les llega a todos) —
// no identifica a un productor específico, así que "quién resolvió" queda
// como una marca genérica, no un nombre real (decisión de alcance explícita,
// TODO.md Tarea 2: CU-10 exige distinguir un "ya resuelta", no exige que el
// agente invente una identidad que no puede verificar). Reformulado (hotfix
// pre-producción, 14/08/2026): el paréntesis original ("un productor del
// equipo (enlace de aprobación)") describía el mecanismo, no agregaba
// información útil para quien lee el mensaje, y no hay ningún destino real
// al que enlazarlo — se prefirió texto plano y simple sobre inventar un
// enlace sin propósito claro.
const RESUELTO_POR_ENLACE = 'otro miembro del equipo';

interface ClienteCompra {
  nombre: string;
  telefono: string;
  correo: string;
}

interface CompraParaAprobacion {
  compraId: string;
  eventoId: string;
  etapaId: string;
  cantidad: number;
  cliente?: ClienteCompra;
  montoTotal: number;
  estado: string;
  comprobanteKey?: string;
  tokenAprobacionExpiraEn?: number;
  resueltoPor?: string;
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

async function buscarCompraPorTokenAprobacion(token: string): Promise<CompraParaAprobacion | null> {
  const resultado = await documentoDynamoDB.send(
    new QueryCommand({
      TableName: process.env['TABLA_COMPRAS'],
      IndexName: 'tokenAprobacionHash-index',
      KeyConditionExpression: 'tokenAprobacionHash = :hash',
      ExpressionAttributeValues: { ':hash': hashearToken(token) },
      Limit: 1,
    }),
  );
  const item = resultado.Items?.[0];
  return item ? (item as CompraParaAprobacion) : null;
}

type ResultadoValidacionToken =
  | { valido: true; compra: CompraParaAprobacion }
  | { valido: false; respuesta: APIGatewayProxyResultV2 };

/**
 * Mismo criterio que `comprobantes.ts` (`CLAUDE.md` §5, A07): distingue
 * enlace inexistente, vencido y ya usado. El caso "ya usado" (CU-10,
 * bloqueo entre productores) reporta quién lo resolvió si el estado ya
 * transicionó a `aprobada`/`rechazada`.
 */
async function validarTokenAprobacion(token: string | undefined): Promise<ResultadoValidacionToken> {
  if (!token) {
    return { valido: false, respuesta: respuestaJson(400, { mensaje: 'Falta el token en la ruta' }) };
  }

  const compra = await buscarCompraPorTokenAprobacion(token);
  if (!compra) {
    return { valido: false, respuesta: respuestaJson(404, { mensaje: 'Enlace inválido o inexistente' }) };
  }

  const yaVencio =
    typeof compra.tokenAprobacionExpiraEn === 'number' &&
    compra.tokenAprobacionExpiraEn <= Math.floor(Date.now() / 1000);
  if (yaVencio) {
    return {
      valido: false,
      respuesta: respuestaJson(410, { mensaje: 'Este enlace de aprobación ya venció.' }),
    };
  }

  if (compra.estado !== 'en_revision') {
    const mensaje = compra.resueltoPor
      ? `Esta compra ya fue resuelta por ${compra.resueltoPor}.`
      : 'Esta compra ya no está pendiente de revisión.';
    return { valido: false, respuesta: respuestaJson(409, { mensaje }) };
  }

  return { valido: true, compra };
}

/**
 * `GET /api/aprobaciones` (`exigirRol('productor')`) — solo lectura: lista
 * las compras `en_revision` de los eventos donde el correo autenticado está
 * en `productores` (`tieneAccesoAlEvento`, `lib/autorizacion.ts` — misma
 * función que usa `handlers/reportes.ts`, `TODO.md` Tarea 2), nunca por rol
 * a secas (`CLAUDE.md` §5, A01). No expone un token de acción por fila — el
 * token de cada compra nunca se guarda en claro (A07), así que la
 * revisión/resolución sigue pasando por el enlace que el productor ya
 * recibió por correo (`aviso_comprobante`); esta lista es un panorama, no un
 * punto de acción directo (decisión de alcance explícita, `TODO.md` Tarea 2).
 */
async function listarPendientes(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'productor');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  const eventosResultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_EVENTOS'] }),
  );
  const eventosPropios = (eventosResultado.Items ?? []).filter((item) =>
    tieneAccesoAlEvento(item, autorizacion.permisos),
  );

  const listas = await Promise.all(
    eventosPropios.map(async (eventoItem) => {
      const resultado = await documentoDynamoDB.send(
        new QueryCommand({
          TableName: process.env['TABLA_COMPRAS'],
          IndexName: 'eventoId-creadaEn-index',
          KeyConditionExpression: 'eventoId = :eventoId',
          FilterExpression: 'estado = :enRevision',
          ExpressionAttributeValues: {
            ':eventoId': eventoItem['eventoId'],
            ':enRevision': 'en_revision',
          },
        }),
      );
      return (resultado.Items ?? []).map((compra) => ({
        compraId: compra['compraId'],
        nombreEvento: eventoItem['nombre'],
        cantidad: compra['cantidad'],
        montoTotal: compra['montoTotal'],
        creadaEn: compra['creadaEn'],
      }));
    }),
  );

  return respuestaJson(200, listas.flat());
}

/**
 * `GET /api/aprobaciones/:token` — a diferencia de `GET /api/compras/:id/estado`,
 * acá sí se expone `cliente`: es lo que el productor necesita para
 * verificar que el comprobante corresponde a esa persona. Incluye una URL
 * prefirmada del comprobante para mostrarlo/descargarlo.
 */
async function obtenerDetalleAprobacion(token: string | undefined): Promise<APIGatewayProxyResultV2> {
  const validacion = await validarTokenAprobacion(token);
  if (!validacion.valido) {
    return validacion.respuesta;
  }
  const { compra } = validacion;

  let urlComprobante: string | undefined;
  if (compra.comprobanteKey) {
    urlComprobante = await getSignedUrl(
      clienteS3,
      new GetObjectCommand({ Bucket: process.env['BUCKET_COMPROBANTES'], Key: compra.comprobanteKey }),
      { expiresIn: 900 },
    );
  }

  return respuestaJson(200, {
    compraId: compra.compraId,
    cantidad: compra.cantidad,
    montoTotal: compra.montoTotal,
    cliente: compra.cliente,
    urlComprobante,
  });
}

/**
 * `POST /api/aprobaciones/:token/aprobar` — escritura condicional de un
 * solo uso (`estado = 'en_revision'`, CU-10: el primero que aprueba bloquea
 * a los demás), confirma el aforo con `aforo.ts` y emite las boletas con
 * `boleteria.ts` (ninguna reimplementa esa lógica). El correo con los
 * enlaces a cada boleta (`boletas_emitidas`) es, a propósito, la única
 * notificación de "compra aprobada" que recibe el cliente — no hay un
 * correo intermedio separado (decisión explícita, `TODO.md` Tarea 2).
 */
async function aprobarCompra(token: string | undefined): Promise<APIGatewayProxyResultV2> {
  const validacion = await validarTokenAprobacion(token);
  if (!validacion.valido) {
    return validacion.respuesta;
  }
  const { compra } = validacion;

  try {
    // REMOVE expiraEn: defensa adicional, mismo criterio que
    // comprobantes.ts — comprobantes.ts ya lo quita al pasar a en_revision,
    // pero un REMOVE sobre un atributo inexistente es un no-op, así que no
    // hay riesgo de romper el camino feliz (MEMORY.md §7).
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression: 'SET estado = :aprobada, resueltoPor = :resueltoPor, resueltoEn = :ahora REMOVE expiraEn',
        ConditionExpression: 'estado = :enRevision',
        ExpressionAttributeValues: {
          ':aprobada': 'aprobada',
          ':enRevision': 'en_revision',
          ':resueltoPor': RESUELTO_POR_ENLACE,
          ':ahora': new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Esta compra ya fue resuelta.' });
    }
    throw error;
  }

  try {
    await confirmarSillas(compra.eventoId, compra.cantidad);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    // No debería ocurrir en el camino feliz (el aforo ya estaba reservado
    // desde la compra), pero si pasa, la compra queda aprobada sin aforo
    // confirmado — se registra para diagnóstico, nunca datos del cliente.
    console.error('confirmarSillas falló tras aprobar la compra', { compraId: compra.compraId });
  }

  try {
    const boletas = await emitirBoletas({
      compraId: compra.compraId,
      eventoId: compra.eventoId,
      etapaId: compra.etapaId,
      montoTotal: compra.montoTotal,
      cantidad: compra.cantidad,
    });

    if (compra.cliente) {
      const resultadoEvento = await documentoDynamoDB.send(
        new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: compra.eventoId } }),
      );
      const nombreEvento = resultadoEvento.Item?.['nombre'];
      if (typeof nombreEvento === 'string') {
        const urlBase = process.env['URL_BASE_APP'] ?? '';
        const urlsBoletas = boletas.map(
          (boleta) => `${urlBase}/boleta/${boleta.boletaId}.${firmarCodigoBoleta(boleta.boletaId)}`,
        );
        await canalNotificacion.enviar(
          { correo: compra.cliente.correo, nombre: compra.cliente.nombre },
          'boletas_emitidas',
          { nombreEvento, urlsBoletas },
        );
      }
    }
  } catch (error) {
    // Best-effort, mismo criterio que confirmarSillas arriba: la aprobación
    // ya es válida y las boletas (si llegaron a crearse) también, aunque la
    // emisión o el aviso al cliente fallen — nunca se revierte por esto.
    const nombreError = error instanceof Error ? error.name : 'error desconocido';
    console.error('La emisión de boletas o su notificación falló tras aprobar', {
      compraId: compra.compraId,
      nombreError,
    });
  }

  return respuestaJson(200, { estado: 'aprobada' });
}

/**
 * `POST /api/aprobaciones/:token/rechazar` (`{ motivo? }`) — mismo patrón
 * condicional que aprobar, libera el aforo con `aforo.ts` y notifica al
 * cliente, best-effort.
 */
async function rechazarCompra(
  token: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const validacion = await validarTokenAprobacion(token);
  if (!validacion.valido) {
    return validacion.respuesta;
  }
  const { compra } = validacion;

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const motivoBruto = datos['motivo'];
  const motivo =
    typeof motivoBruto === 'string' && motivoBruto.trim().length > 0 && motivoBruto.length <= 500
      ? motivoBruto
      : undefined;

  try {
    // REMOVE expiraEn: misma defensa adicional que aprobarCompra arriba.
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression: 'SET estado = :rechazada, resueltoPor = :resueltoPor, resueltoEn = :ahora REMOVE expiraEn',
        ConditionExpression: 'estado = :enRevision',
        ExpressionAttributeValues: {
          ':rechazada': 'rechazada',
          ':enRevision': 'en_revision',
          ':resueltoPor': RESUELTO_POR_ENLACE,
          ':ahora': new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Esta compra ya fue resuelta.' });
    }
    throw error;
  }

  try {
    await liberarSillas(compra.eventoId, compra.cantidad);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    console.error('liberarSillas falló tras rechazar la compra', { compraId: compra.compraId });
  }

  if (compra.cliente) {
    try {
      const resultadoEvento = await documentoDynamoDB.send(
        new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: compra.eventoId } }),
      );
      const nombreEvento = resultadoEvento.Item?.['nombre'];
      if (typeof nombreEvento === 'string') {
        await canalNotificacion.enviar(
          { correo: compra.cliente.correo, nombre: compra.cliente.nombre },
          'compra_rechazada',
          { nombreEvento, cantidad: compra.cantidad, motivo },
        );
      }
    } catch (error) {
      const nombreError = error instanceof Error ? error.name : 'error desconocido';
      console.error('No se pudo notificar el rechazo al cliente', {
        compraId: compra.compraId,
        nombreError,
      });
    }
  }

  return respuestaJson(200, { estado: 'rechazada' });
}

/**
 * `GET /api/aprobaciones` (autenticado, `exigirRol('productor')`),
 * `GET /api/aprobaciones/:token`, `POST /api/aprobaciones/:token/aprobar`,
 * `POST /api/aprobaciones/:token/rechazar` (los tres últimos por enlace
 * mágico, sin `exigirRol`) — `TODO.md` Tarea 2.
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const token = evento.pathParameters?.['token'];
  const metodo = evento.requestContext.http.method;
  const rawPath = evento.rawPath ?? '';

  try {
    if (metodo === 'GET' && !token) {
      return await listarPendientes(evento);
    }
    if (metodo === 'GET' && token) {
      return await obtenerDetalleAprobacion(token);
    }
    if (metodo === 'POST' && rawPath.endsWith('/aprobar')) {
      return await aprobarCompra(token);
    }
    if (metodo === 'POST' && rawPath.endsWith('/rechazar')) {
      return await rechazarCompra(token, evento);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
