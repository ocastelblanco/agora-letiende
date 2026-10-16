import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import {
  ErrorConsultaBold,
  consultarPagoBold,
  montoCoincide,
  verificarFirmaWebhook,
  type ComprobantePagoBold,
  type NotificacionBold,
} from '../services/bold';
import { ErrorAforo, confirmarSillas, liberarSillas, reservarSillas } from '../services/aforo';
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
  medioPago?: string;
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
 * Timeout de la consulta de conciliación. Bold exige que el webhook responda
 * en máximo 2 s (https://developers.bold.co/webhook); si se pasa, reintenta a
 * los 15 min y la escritura condicional responde 200 sin emitir dos veces.
 */
const TIMEOUT_CONCILIACION_MS = 1500;

/** La venta todavía no aparece en la consulta: Bold advierte hasta 10 min de demora. */
const ESTADOS_BOLD_AUN_NO_VISIBLE = new Set(['NO_TRANSACTION_FOUND', 'PROCESSING', 'PENDING']);

type ResultadoVerificacionPago = 'ok' | 'ok_sin_conciliar' | 'monto_no_coincide' | 'no_conciliado' | 'bold_no_disponible';

/**
 * Verificaciones previas a aprobar un pago (`CLAUDE.md` §5, A08, ADR-018): una
 * firma válida prueba que la notificación viene de Bold, no que el monto sea el
 * de la compra ni que el pago exista.
 *
 * 1. El monto y la moneda del payload deben coincidir con `montoTotal` de la
 *    compra (estricto en producción; omitido en modo pruebas porque el sandbox
 *    informa `total: 0`).
 * 2. Conciliación con la consulta del Botón de pagos (`consultarPagoBold`):
 *    - `APPROVED` con la misma referencia y el mismo total → se aprueba.
 *    - `REJECTED`, `FAILED`, `VOIDED`, un estado desconocido, o `APPROVED` con
 *      otro total o referencia → Bold contradice el webhook: no se aprueba (409).
 *    - `NO_TRANSACTION_FOUND`, `PROCESSING`, `PENDING` → la venta aún no es
 *      visible (hasta 10 min según Bold). Bloquear dejaría al cliente que pagó
 *      sin boletas hasta el reintento de los 15 min, con la reserva vencida en
 *      pantalla; se aprueba con firma y monto y queda un error en el log.
 *    - 401/403 → las llaves no sirven para consultar: igual que el caso anterior.
 *    - Red, tiempo o 5xx → falla cerrado (503) y Bold reintenta.
 */
async function verificarPagoAprobado(
  compra: CompraParaWebhookBold,
  payload: NotificacionBold,
  modoPruebas: boolean,
): Promise<ResultadoVerificacionPago> {
  // El sandbox de Bold informa `amount.total: 0` en sus webhooks aunque la
  // compra sea de 30.000 (observado con el webhook real en staging el
  // 10/10/2026: `{ currency: 'COP', total: 0, taxes: [], tip: 0 }`, no
  // documentado). Solo en modo pruebas se omite la comparación de monto. En
  // producción (`BOLD_MODO_PRUEBAS=false`) la comparación es estricta.
  const comparaMonto = !modoPruebas;
  if (comparaMonto && !montoCoincide(payload.data?.amount, compra.montoTotal)) {
    return 'monto_no_coincide';
  }

  let comprobante: ComprobantePagoBold;
  try {
    comprobante = await consultarPagoBold(compra.compraId, TIMEOUT_CONCILIACION_MS);
  } catch (error) {
    if (error instanceof ErrorConsultaBold) {
      // El mensaje solo lleva el código HTTP o el tipo de error: sin llaves ni datos del cliente.
      console.error('Webhook de Bold: falló la consulta de conciliación', { compraId: compra.compraId, motivo: error.message });
      return error.esDeAutorizacion ? 'ok_sin_conciliar' : 'bold_no_disponible';
    }
    throw error;
  }

  // Nunca se registra el comprobante completo: trae `payer_email`.
  const estado = comprobante.payment_status;
  if (estado === 'APPROVED') {
    const referenciaCoincide = comprobante.reference_id === undefined || comprobante.reference_id === compra.compraId;
    const totalCoincide = !comparaMonto || montoCoincide({ total: comprobante.total }, compra.montoTotal);
    if (referenciaCoincide && totalCoincide) {
      return 'ok';
    }
    console.error('Webhook de Bold: la consulta de Bold no coincide con la compra', {
      compraId: compra.compraId,
      referenciaConsultada: comprobante.reference_id,
      totalConsultado: comprobante.total,
      montoEsperado: compra.montoTotal,
    });
    return 'no_conciliado';
  }
  if (ESTADOS_BOLD_AUN_NO_VISIBLE.has(estado)) {
    console.error('Webhook de Bold: la venta aún no aparece en la consulta; se aprueba sin conciliar', {
      compraId: compra.compraId,
      estadoConsultado: estado,
    });
    return 'ok_sin_conciliar';
  }
  console.error('Webhook de Bold: la consulta de Bold contradice el pago aprobado', {
    compraId: compra.compraId,
    estadoConsultado: estado,
  });
  return 'no_conciliado';
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
 * Aviso tardío de Bold (incidente del 16/10/2026): la compra ya expiró y
 * devolvió su aforo, pero el pago está aprobado y verificado. Se vuelve a
 * tomar el aforo con la misma escritura condicional de una compra nueva y la
 * compra vuelve a `esperando_pago_bold` para aprobarse por el camino normal.
 * Si ya no hay sillas, el cliente pagó y no hay boletas que emitir: queda un
 * error en el log para atenderlo a mano (devolución o cupo extra), y 200 para
 * que Bold no reintente algo que no se resuelve solo.
 */
async function recuperarCompraExpirada(compra: CompraParaWebhookBold): Promise<APIGatewayProxyResultV2> {
  try {
    await reservarSillas(compra.eventoId, compra.cantidad);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    console.error('Webhook de Bold: pago aprobado de una compra expirada sin aforo para recuperarla; requiere atención manual', {
      compraId: compra.compraId,
      eventoId: compra.eventoId,
      motivo: error.message,
    });
    return respuestaJson(200, { recibido: true });
  }

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId: compra.compraId },
        UpdateExpression: 'SET estado = :esperandoPago, recuperadaEn = :ahora',
        ConditionExpression: 'estado = :expirada',
        ExpressionAttributeValues: {
          ':esperandoPago': 'esperando_pago_bold',
          ':expirada': 'expirada',
          ':ahora': new Date().toISOString(),
        },
      }),
    );
  } catch (error) {
    // Otro aviso de Bold ganó la carrera: se devuelve el aforo recién tomado.
    await liberarSillas(compra.eventoId, compra.cantidad).catch(() => undefined);
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(200, { recibido: true });
    }
    throw error;
  }

  console.error('Webhook de Bold: aviso tardío sobre una compra expirada; se recupera y aprueba', {
    compraId: compra.compraId,
  });
  return procesarPagoAprobado({ ...compra, estado: 'esperando_pago_bold' });
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
    console.error('Webhook de Bold: notificación sin referencia de compra', { tipo: payload?.type });
    return respuestaJson(404, { mensaje: 'No existe una compra con ese identificador' });
  }

  const resultado = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_COMPRAS'], Key: { compraId } }),
  );
  const compra = resultado.Item as CompraParaWebhookBold | undefined;
  if (!compra) {
    // Antes era un 404 silencioso: así pasaron inadvertidos dos semanas de
    // avisos rechazados (incidente del 16/10/2026).
    console.error('Webhook de Bold: no existe la compra de la notificación', { compraId, tipo: payload.type });
    return respuestaJson(404, { mensaje: 'No existe una compra con ese identificador' });
  }

  if (payload.type === 'SALE_APPROVED') {
    const esExpiradaDeBold = compra.estado === 'expirada' && compra.medioPago === 'bold';
    // Reintento de Bold sobre una compra ya resuelta: 200 sin gastar una
    // consulta a Bold (la escritura condicional de más abajo sigue siendo la
    // autoridad contra la doble emisión).
    if (compra.estado !== 'esperando_pago_bold' && !esExpiradaDeBold) {
      if (compra.estado !== 'aprobada') {
        console.error('Webhook de Bold: pago aprobado sobre una compra que no lo esperaba', {
          compraId: compra.compraId,
          estado: compra.estado,
        });
      }
      return respuestaJson(200, { recibido: true });
    }

    const verificacion = await verificarPagoAprobado(compra, payload, modoPruebas);
    // Solo el compraId en los logs, nunca datos del cliente (CLAUDE.md §5, A09).
    if (verificacion === 'monto_no_coincide') {
      // `amount` (total, moneda, impuestos, propina) y el monto esperado son
      // datos monetarios, no personales: sirven para diagnosticar sin exponer al cliente.
      console.error('Webhook de Bold: el monto o la moneda no coinciden con la compra', {
        compraId: compra.compraId,
        montoRecibido: payload.data?.amount,
        montoEsperado: compra.montoTotal,
      });
      return respuestaJson(422, { mensaje: 'El monto no coincide con la compra' });
    }
    if (verificacion === 'no_conciliado') {
      console.error('Webhook de Bold: el pago no aparece aprobado en la conciliación', { compraId: compra.compraId });
      return respuestaJson(409, { mensaje: 'El pago no pudo conciliarse' });
    }
    if (verificacion === 'bold_no_disponible') {
      console.error('Webhook de Bold: no se pudo consultar a Bold para conciliar', { compraId: compra.compraId });
      return respuestaJson(503, { mensaje: 'No se pudo conciliar el pago, reintenta' });
    }
    if (esExpiradaDeBold) {
      return await recuperarCompraExpirada(compra);
    }
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
