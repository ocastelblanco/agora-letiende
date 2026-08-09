import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Firma del código de boleta (`tech-specs.md` §5.5, `TODO.md` Tarea 2) — a
 * diferencia de `enlaces-magicos.ts`, esta no es una capacidad de un solo
 * uso que se persiste hasheada: es una firma **determinística y
 * reverificable cualquier cantidad de veces**, para que el QR (`
 * {boletaId}.{firma}`) se pueda validar sin ninguna escritura ni consumo.
 * Rechazar una firma inválida no debe tocar DynamoDB (`CLAUDE.md` §5, A02).
 *
 * Truncada a 16 caracteres hex (64 bits) del HMAC-SHA256 completo: mantiene
 * el código corto (más rápido de escanear e imprimir en un QR) sin
 * facilitar la adivinanza — 64 bits de espacio de búsqueda es
 * computacionalmente inviable de fuerza bruta sin la llave.
 */
const LONGITUD_FIRMA = 16;

function hmacCompleto(boletaId: string): string {
  const secreto = process.env['SECRETO_FIRMA_BOLETAS'] ?? '';
  return createHmac('sha256', secreto).update(boletaId).digest('hex');
}

/** Firma un `boletaId` para componer el código del QR (`{boletaId}.{firma}`). */
export function firmarCodigoBoleta(boletaId: string): string {
  return hmacCompleto(boletaId).slice(0, LONGITUD_FIRMA);
}

/**
 * Verifica una firma recibida contra la que se derivaría del `boletaId` —
 * en tiempo constante para no filtrar por temporización cuánto de la firma
 * coincide. Longitudes distintas se rechazan antes de comparar (evita el
 * `RangeError` de `timingSafeEqual` con buffers de tamaño distinto).
 */
export function verificarFirmaBoleta(boletaId: string, firma: string): boolean {
  const esperada = firmarCodigoBoleta(boletaId);
  if (firma.length !== esperada.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(firma, 'utf8'), Buffer.from(esperada, 'utf8'));
}
