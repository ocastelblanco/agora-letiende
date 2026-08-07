/**
 * Conversión entre UTC ISO 8601 (formato de almacenamiento obligatorio,
 * `CLAUDE.md` §4) y la hora de pared de `America/Bogota` que usan los
 * formularios (`<input type="datetime-local">`). Colombia no observa
 * horario de verano desde 1993 — el offset `-05:00` es constante, no una
 * cifra que dependa de una fuente externa a verificar (a diferencia de los
 * precios de AWS).
 */
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** `fechaHora` (UTC ISO) → valor para `<input type="datetime-local">` en hora de Bogotá. */
export function paraInputBogota(fechaIso: string): string {
  const instante = new Date(Date.parse(fechaIso) - OFFSET_BOGOTA_MS);
  const año = instante.getUTCFullYear();
  const mes = String(instante.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(instante.getUTCDate()).padStart(2, '0');
  const horas = String(instante.getUTCHours()).padStart(2, '0');
  const minutos = String(instante.getUTCMinutes()).padStart(2, '0');
  return `${año}-${mes}-${dia}T${horas}:${minutos}`;
}

/** Valor de `<input type="datetime-local">` (hora de Bogotá) → UTC ISO 8601 para almacenar. */
export function desdeInputBogota(valorLocal: string): string {
  const [fecha, hora] = valorLocal.split('T');
  const [año, mes, dia] = fecha.split('-').map(Number);
  const [horas, minutos] = hora.split(':').map(Number);
  const instanteUtc = Date.UTC(año, mes - 1, dia, horas, minutos) + OFFSET_BOGOTA_MS;
  return new Date(instanteUtc).toISOString();
}
