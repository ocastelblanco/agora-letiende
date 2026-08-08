import { createHmac, randomBytes } from 'node:crypto';

/**
 * Enlaces mágicos (`tech-specs.md` §8.2, `CLAUDE.md` §5 A07): otorgan una
 * capacidad real a alguien sin sesión (cargar un comprobante, aprobar una
 * compra). El token en sí **nunca** se guarda — solo su derivación con
 * `SECRETO_ENLACES_MAGICOS`, así que una fuga de la tabla no permite
 * reconstruir enlaces válidos.
 *
 * Este archivo nace en `TODO.md` Tarea 2 (Compra y reserva de sillas)
 * porque esa tarea ya necesita *generar* el token del enlace de
 * comprobante — el roadmap técnico lo asigna nominalmente a la tarea de
 * carga de comprobante (roadmap #10), que lo *consume* reutilizando
 * `hashearToken`, no recreándolo.
 */

function hmacToken(token: string): string {
  const secreto = process.env['SECRETO_ENLACES_MAGICOS'] ?? '';
  return createHmac('sha256', secreto).update(token).digest('hex');
}

/**
 * Genera un token de ≥128 bits de entropía (`randomBytes(32)`) y su
 * derivación hasheada. El token en claro se entrega una sola vez (por
 * ejemplo, en el enlace de un correo); el hash es lo único que se
 * persiste, para poder buscarlo cuando el enlace se visite.
 */
export function generarTokenEnlace(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hmacToken(token) };
}

/** Deriva el mismo hash a partir de un token recibido, para buscarlo por su GSI. */
export function hashearToken(token: string): string {
  return hmacToken(token);
}
