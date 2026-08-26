import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { verificarFirmaWebhook, type NotificacionBold } from '../services/bold';
import { ErrorAforo, confirmarSillas, liberarSillas } from '../services/aforo';
import { emitirBoletas } from '../services/boleteria';
import { firmarCodigoBoleta } from '../lib/firma-boletas';
import { CanalCorreoSes } from '../services/notificaciones';
import { respuestaJson } from '../lib/http';

const canalNotificacion = new CanalCorreoSes();

// Actor responsable (CLAUDE.md §5, A09) de una transición que Bold resuelve
// automáticamente — mismo criterio que RESUELTO_POR_SISTEMA (compras.ts,
// adquisición sin etapas) y RESUELTO_POR_ENLACE (aprobaciones.ts, enlace
// compartido): una marca fija y honesta sobre el mecanismo, no una
// identidad inventada.
const RESUELTO_POR_BOLD = 'sistema (pago Bold confirmado)';

interface ClienteCompra {
  nombre: string;
  telefono: string;
  correo: string;
}

interface CompraParaWebhookBold {
  compraId: string;
  eventoId: string;
  etapaId?: string;
  cantidad: number;
  cliente?: ClienteCompra;
  montoTotal: number;
  estado: string;
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * `evento.body` de API Gateway HTTP API puede venir codificado en Base64
 * (`isBase64Encoded`) — la firma de Bold se calcula sobre el cuerpo crudo
 * exacto que Bold envió, nunca sobre un objeto re-serializado con
 * `JSON.stringify` (que no reproduce byte a byte lo firmado: distinto
 * espaciado, distinto orden de claves).
 */
function leerCuerpoCrudo(evento: APIGatewayProxyEventV2): string {
  if (!evento.body) {
    return '';
  }
  return evento.isBase64Encoded ? Buffer.from(evento.body, 'base64').toString('utf8') : evento.body;
}

function leerFirmaRecibida(evento: APIGatewayProxyEventV2): string | undefined {
  const encabezados = evento.headers ?? {};
  return encabezados['x-bold-signature'] ?? encabezados['X-Bold-Signature'];
}

/**
 * Transiciona una compra `esperando_pago_bold` a `aprobada` (mismo patrón
 * condicional que `aprobarCompra()` en `handlers/aprobaciones.ts`: idempotente
 * por diseño, `ConditionExpression` sobre el estado actual — un reintento de
 * Bold sobre el mismo evento ya procesado nunca vuelve a emitir boletas).
 * Confirma el aforo y emite las boletas reutilizando exactamente las mismas
 * primitivas que el resto de flujos de aprobación (`aforo.ts`/`boleteria.ts`,
 * `CLAUDE.md` §5 A08) — ninguna se reimplementa.
 */
async function procesarPagoAprobado(compra: CompraParaWebhookBold): Promise<APIGatewayProxyResultV2> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression:
          'SET estado = :aprobada, resueltoPor = :resueltoPor, resueltoEn = :ahora REMOVE expiraEn',
        ConditionExpression: 'estado = :esperandoPago',
        ExpressionAttributeValues: {
          ':aprobada': 'aprobada',
          ':esperandoPago': 'esperando_pago_bold',
          ':resueltoPor': RESUELTO_POR_BOLD,
          ':ahora': new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      // Evento duplicado (reintento de Bold, hasta 5 veces) o la compra ya
      // se resolvió por otro camino — 200 igual, NUNCA un código de error
      // para "ya lo procesé antes": Bold reintenta hasta 5 veces si no
      // recibe 200.
      return respuestaJson(200, { recibido: true });
    }
    throw error;
  }

  try {
    await confirmarSillas(compra.eventoId, compra.cantidad);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    console.error('confirmarSillas falló tras aprobar un pago Bold', { compraId: compra.compraId });
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
    // Best-effort, mismo criterio que aprobarCompra() en aprobaciones.ts: la
    // aprobación ya es válida y las boletas (si llegaron a crearse) también,
    // aunque la emisión o el aviso al cliente fallen.
    const nombreError = error instanceof Error ? error.name : 'error desconocido';
    console.error('La emisión de boletas o su notificación falló tras un pago Bold aprobado', {
      compraId: compra.compraId,
      nombreError,
    });
  }

  return respuestaJson(200, { recibido: true });
}

/**
 * Transiciona una compra `esperando_pago_bold` a `rechazada` y libera el
 * aforo — mismo patrón condicional idempotente que arriba.
 */
async function procesarPagoRechazado(compra: CompraParaWebhookBold): Promise<APIGatewayProxyResultV2> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression: 'SET estado = :rechazada, resueltoPor = :resueltoPor, resueltoEn = :ahora REMOVE expiraEn',
        ConditionExpression: 'estado = :esperandoPago',
        ExpressionAttributeValues: {
          ':rechazada': 'rechazada',
          ':esperandoPago': 'esperando_pago_bold',
          ':resueltoPor': RESUELTO_POR_BOLD,
          ':ahora': new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(200, { recibido: true });
    }
    throw error;
  }

  try {
    await liberarSillas(compra.eventoId, compra.cantidad);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    console.error('liberarSillas falló tras rechazar un pago Bold', { compraId: compra.compraId });
  }

  return respuestaJson(200, { recibido: true });
}

/**
 * `POST /api/pagos/bold/webhook` — sin autenticación de usuario (Bold no
 * manda un ID Token de Firebase): la única credencial es la firma HMAC
 * verificada por `verificarFirmaWebhook()` (`CLAUDE.md` §5, A08 — nunca
 * marcar una compra como pagada por el solo hecho de recibir una petición
 * en el endpoint de webhook).
 */
async function procesarWebhook(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cuerpoCrudo = leerCuerpoCrudo(evento);
  const firmaRecibida = leerFirmaRecibida(evento);
  const modoPruebas = process.env['BOLD_MODO_PRUEBAS'] === 'true';

  if (!firmaRecibida || !verificarFirmaWebhook(cuerpoCrudo, firmaRecibida, modoPruebas)) {
    // Nunca se loguea el cuerpo ni la firma recibida (CLAUDE.md §5, A09) —
    // solo que la verificación falló. Rechazada sin tocar DynamoDB.
    console.error('Firma de webhook de Bold inválida o ausente');
    return respuestaJson(401, { mensaje: 'Firma inválida' });
  }

  let payload: NotificacionBold;
  try {
    payload = JSON.parse(cuerpoCrudo) as NotificacionBold;
  } catch {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }

  const compraId = payload?.data?.metadata?.reference;
  if (typeof compraId !== 'string' || compraId.length === 0) {
    return respuestaJson(404, { mensaje: 'No existe una compra con ese identificador' });
  }

  const resultado = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_COMPRAS'], Key: { compraId } }),
  );
  const compra = resultado.Item as CompraParaWebhookBold | undefined;
  if (!compra) {
    return respuestaJson(404, { mensaje: 'No existe una compra con ese identificador' });
  }

  if (payload.type === 'SALE_APPROVED') {
    return await procesarPagoAprobado(compra);
  }
  if (payload.type === 'SALE_REJECTED') {
    return await procesarPagoRechazado(compra);
  }

  // VOID_APPROVED/VOID_REJECTED (anulación) u otro tipo — fuera de alcance
  // de esta tarea (solo cobro inicial, sin reembolsos todavía). 200 igual:
  // Bold no debe reintentar por un tipo que Ágora reconoce pero no procesa.
  return respuestaJson(200, { recibido: true });
}

export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (evento.requestContext.http.method !== 'POST') {
      return respuestaJson(405, { mensaje: 'Método no soportado' });
    }
    return await procesarWebhook(evento);
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
