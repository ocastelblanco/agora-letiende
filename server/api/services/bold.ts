import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pago con Bold (roadmap #19, Sub-tarea 1 — `.omc/plans/bold-pagos.md`) —
 * solo la lógica de firma, pura y testeable en aislamiento (mismo criterio
 * de separación que `lib/firma-boletas.ts`/`lib/enlaces-magicos.ts`). Sin
 * llamadas a AWS ni a DynamoDB aquí: `handlers/compras.ts` la usa para
 * firmar el botón, `handlers/bold-webhook.ts` para verificar la firma
 * entrante. La consulta HTTP de reconciliación (decisión 4 del plan) vive en
 * `services/aforo.ts`, su único consumidor — no aquí, para mantener este
 * archivo libre de I/O de red además de AWS/DynamoDB.
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
  const secreto = process.env['BOLD_LLAVE_SECRETA'] ?? '';
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
  const secreto = modoPruebas ? '' : (process.env['BOLD_LLAVE_SECRETA'] ?? '');
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
    amount: { total: number; currency: string };
    payment_method?: string;
  };
}
