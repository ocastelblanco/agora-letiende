import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { leerSecreto } from '../lib/secretos';

/**
 * Pago con Bold (roadmap #19, Sub-tarea 1 — `.omc/plans/bold-pagos.md`) —
 * solo la lógica de firma, pura y testeable en aislamiento (mismo criterio
 * de separación que `lib/firma-boletas.ts`/`lib/enlaces-magicos.ts`). Sin
 * llamadas a AWS ni a DynamoDB aquí: `handlers/compras.ts` la usa para
 * firmar el botón, `handlers/bold-webhook.ts` para verificar la firma
 * entrante. La consulta HTTP de conciliación (`consultarPagoBold`)
 * es la única función de este archivo con I/O de red (ninguna toca AWS ni
 * DynamoDB); la usan `handlers/bold-webhook.ts` y `services/aforo.ts`.
 *
 * Verificado hoy (25/08/2026) contra la documentación oficial de Bold —
 * https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
 * y https://developers.bold.co/webhook — antes de escribir este archivo, no
 * de memoria:
 * - El monto va en unidades enteras de la moneda (pesos, no centavos) —
 *   confirmado con el ejemplo oficial (`39400` COP, no `3940000`).
 * - Los 4 tipos de evento del webhook son exactamente `SALE_APPROVED`,
 *   `SALE_REJECTED`, `VOID_APPROVED`, `VOID_REJECTED` (anulación) — los dos
 *   últimos no se manejan todavía (fuera de alcance, `handlers/bold-webhook.ts`).
 */

/**
 * Firma saliente del botón de pagos (la calcula Ágora para que el frontend
 * la use al renderizar el widget, Sub-tarea 2) — SHA256 de la concatenación
 * directa `{compraId}{monto}{moneda}{BOLD_LLAVE_SECRETA}`, sin separadores
 * (fórmula exacta de la documentación oficial de Bold). `compraId` hace de
 * `data-order-id`: ya es un UUID v4, dentro del límite de 60 caracteres
 * alfanuméricos que exige Bold.
 */
export function firmarBoton(compraId: string, monto: number, moneda: string): string {
  const secreto = leerSecreto('BOLD_LLAVE_SECRETA');
  return createHash('sha256').update(`${compraId}${monto}${moneda}${secreto}`).digest('hex');
}

/**
 * Verifica la firma entrante del webhook (`x-bold-signature`) — HMAC-SHA256
 * sobre el cuerpo crudo de la petición codificado en Base64 (nunca sobre el
 * objeto re-serializado: un cuerpo re-serializado no reproduce byte a byte
 * lo que Bold firmó). En **modo pruebas**, Bold firma con una llave vacía en
 * vez de la llave secreta real (hallazgo verificado, no documentado en la
 * página del botón) — `modoPruebas` selecciona esa rama explícitamente, en
 * vez de intentar adivinarlo.
 *
 * Comparación en tiempo constante (mismo criterio que
 * `lib/firma-boletas.ts`): longitudes distintas se rechazan antes de
 * comparar, para no filtrar información por temporización ni disparar el
 * `RangeError` de `timingSafeEqual` con buffers de tamaño distinto.
 */
export function verificarFirmaWebhook(
  cuerpoCrudo: string,
  firmaRecibida: string,
  modoPruebas: boolean,
): boolean {
  const secreto = modoPruebas ? '' : leerSecreto('BOLD_LLAVE_SECRETA');
  const cuerpoBase64 = Buffer.from(cuerpoCrudo, 'utf8').toString('base64');
  const firmaEsperada = createHmac('sha256', secreto).update(cuerpoBase64).digest('hex');

  if (firmaRecibida.length !== firmaEsperada.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(firmaRecibida, 'utf8'), Buffer.from(firmaEsperada, 'utf8'));
}

/** Los 4 tipos de evento reales del webhook (verificados contra la documentación, no asumidos). */
export type TipoEventoBold = 'SALE_APPROVED' | 'SALE_REJECTED' | 'VOID_APPROVED' | 'VOID_REJECTED';

export interface NotificacionBold {
  id: string;
  type: TipoEventoBold;
  subject: string;
  source: string;
  spec_version: string;
  time: number;
  datacontenttype: string;
  data: {
    payment_id: string;
    merchant_id?: string;
    // `reference` es el compraId que Ágora envió como data-order-id al
    // renderizar el botón (handlers/compras.ts) — el vínculo entre la
    // notificación de Bold y la compra real en agora-compras.
    metadata: { reference: string };
    // `currency` es opcional a propósito: la documentación de Bold lo lista en
    // la tabla de campos pero el ejemplo de la respuesta de consulta no lo
    // incluye (https://developers.bold.co/webhook) — solo se exige cuando viene.
    amount: { total: number; currency?: string };
    payment_method?: string;
  };
}

const BASE_URL_PAGOS_BOLD = 'https://payments.api.bold.co';

/** La consulta de conciliación no se pudo completar (red, timeout, credenciales o respuesta no válida). */
export class ErrorConsultaBold extends Error {
  constructor(
    mensaje: string,
    /** Código HTTP de Bold si respondió; ausente en errores de red o de tiempo. */
    readonly estadoHttp?: number,
  ) {
    super(mensaje);
  }

  /** Bold rechazó las credenciales (401/403): es un problema de configuración, no una caída de Bold. */
  get esDeAutorizacion(): boolean {
    return this.estadoHttp === 401 || this.estadoHttp === 403;
  }
}

/** Valores de `payment_status` documentados por Bold para la consulta del Botón de pagos. */
export type EstadoPagoBold =
  | 'NO_TRANSACTION_FOUND'
  | 'PROCESSING'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED'
  | 'VOIDED';

/**
 * Lo que Ágora lee de la consulta. Bold devuelve más campos (`payer_email`,
 * `description`…) que no se usan ni se registran nunca.
 */
export interface ComprobantePagoBold {
  payment_status: string;
  total?: unknown;
  reference_id?: unknown;
  transaction_id?: unknown;
}

/**
 * Consulta de transacciones del Botón de pagos
 * (https://developers.bold.co/pagos-en-linea/consulta-de-transacciones, verificado
 * el 11/10/2026): `GET /v2/payment-voucher/{identificador único de la venta}`,
 * que es el `data-order-id` que Ágora envía al renderizar el botón (el
 * `compraId`). Usa la llave de identidad del Botón de pagos. Reemplaza al
 * «servicio de fallback» del webhook (`integrations.api.bold.co`), que es de
 * API Integrations (datáfono) y respondía 403 con las llaves del botón.
 *
 * Bold advierte que una venta «aparecerá disponible para consulta en hasta 10
 * minutos»: un `NO_TRANSACTION_FOUND` justo después del pago no prueba que no
 * hubo pago. Host fijo en código (`CLAUDE.md` §5, A10). Falla cerrado: sin llave,
 * con una respuesta no `ok`, un cuerpo sin `payment_status` o cualquier error de
 * red lanza `ErrorConsultaBold`.
 */
export async function consultarPagoBold(identificadorVenta: string, timeoutMs: number): Promise<ComprobantePagoBold> {
  const llaveIdentidad = process.env['BOLD_LLAVE_IDENTIDAD'] ?? '';
  if (!llaveIdentidad) {
    throw new ErrorConsultaBold('Falta BOLD_LLAVE_IDENTIDAD');
  }
  try {
    const url = `${BASE_URL_PAGOS_BOLD}/v2/payment-voucher/${encodeURIComponent(identificadorVenta)}`;
    const respuesta = await fetch(url, {
      headers: { Authorization: `x-api-key ${llaveIdentidad}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!respuesta.ok) {
      throw new ErrorConsultaBold(`Bold respondió ${respuesta.status}`, respuesta.status);
    }
    const cuerpo = (await respuesta.json()) as unknown;
    if (typeof cuerpo !== 'object' || cuerpo === null || typeof (cuerpo as { payment_status?: unknown }).payment_status !== 'string') {
      throw new ErrorConsultaBold('Respuesta de Bold sin payment_status');
    }
    const datos = cuerpo as Record<string, unknown>;
    return {
      payment_status: datos['payment_status'] as string,
      total: datos['total'],
      reference_id: datos['reference_id'],
      transaction_id: datos['transaction_id'],
    };
  } catch (error) {
    // Solo el tipo de error (TimeoutError, TypeError…), nunca su mensaje: podría incluir la URL.
    throw error instanceof ErrorConsultaBold
      ? error
      : new ErrorConsultaBold(`No se pudo consultar a Bold (${error instanceof Error ? error.name : 'desconocido'})`);
  }
}

const MONEDA_ESPERADA = 'COP';

/** Monto en pesos enteros y, si Bold informa la moneda, que sea COP. Nunca coerciona tipos. */
export function montoCoincide(amount: { total?: unknown; currency?: unknown } | undefined, montoEsperado: number): boolean {
  if (!amount || typeof amount.total !== 'number' || amount.total !== montoEsperado) {
    return false;
  }
  return amount.currency === undefined || amount.currency === MONEDA_ESPERADA;
}
