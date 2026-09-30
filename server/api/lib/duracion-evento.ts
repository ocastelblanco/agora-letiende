/**
 * Duración de un evento (roadmap #26, `docs/plan-ajustes-eventos.md` Tarea 1).
 * Define la hora de fin en Google Calendar: `fechaHora + duracionMinutos`.
 * Vive en `lib/` (y no en `google-calendar.ts`) para que `eventos.ts` la
 * comparta sin depender de un módulo que sus pruebas reemplazan por completo.
 */
export const DURACION_POR_DEFECTO_MINUTOS = 180;
export const DURACION_MINIMA_MINUTOS = 15;
export const DURACION_MAXIMA_MINUTOS = 24 * 60;

export function esDuracionMinutosValida(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= DURACION_MINIMA_MINUTOS &&
    valor <= DURACION_MAXIMA_MINUTOS
  );
}

/** Un evento anterior al roadmap #26 no tiene el atributo: se asume la duración por defecto. */
export function duracionMinutosDe(valor: unknown): number {
  return esDuracionMinutosValida(valor) ? valor : DURACION_POR_DEFECTO_MINUTOS;
}
