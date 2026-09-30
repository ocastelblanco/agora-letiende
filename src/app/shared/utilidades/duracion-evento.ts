/** Duración por defecto de un evento nuevo: 3 horas (roadmap #26). */
export const DURACION_POR_DEFECTO_MINUTOS = 180;
export const DURACION_MINIMA_MINUTOS = 15;
export const DURACION_MAXIMA_MINUTOS = 24 * 60;

export interface DuracionHorasMinutos {
  horas: number;
  minutos: number;
}

/** 135 → { horas: 2, minutos: 15 }. */
export function minutosAHorasMinutos(totalMinutos: number): DuracionHorasMinutos {
  return { horas: Math.floor(totalMinutos / 60), minutos: totalMinutos % 60 };
}

/** { horas: 2, minutos: 15 } → 135. */
export function horasMinutosAMinutos(duracion: DuracionHorasMinutos): number {
  return duracion.horas * 60 + duracion.minutos;
}

/** Texto legible en español: 180 → "3 h", 135 → "2 h 15 min", 45 → "45 min". */
export function duracionLegible(totalMinutos: number): string {
  const { horas, minutos } = minutosAHorasMinutos(totalMinutos);
  return [horas > 0 ? `${horas} h` : '', minutos > 0 ? `${minutos} min` : ''].filter(Boolean).join(' ');
}
