/**
 * Periodos (mes / semana) y orden para las listas de eventos de administración
 * (roadmap #27 `/mis-eventos/eventos` y #29 `/mis-eventos/panel`,
 * `docs/plan-ajustes-eventos.md`). Todo se calcula en hora de Bogotá
 * (UTC−5 fijo, sin horario de verano — `fecha-bogota.ts`): un evento a las
 * 21:00 del 31 de octubre en Bogotá es del mes de octubre aunque en UTC ya
 * sea 1 de noviembre. Funciones puras: no leen el reloj ni el DOM.
 */
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

export type TipoPeriodo = 'todos' | 'mes' | 'semana';

/**
 * `ancla` es una fecha de Bogotá `YYYY-MM-DD`: el día 1 si es un mes, el lunes
 * si es una semana. En `todos` guarda "hoy", para que al cambiar a mes o
 * semana se muestre el periodo actual.
 */
export interface Periodo {
  tipo: TipoPeriodo;
  ancla: string;
}

export type CampoOrden = 'nombre' | 'fecha';
export type SentidoOrden = 'asc' | 'desc';

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function aFechaUtc(ancla: string): Date {
  const [año, mes, dia] = ancla.split('-').map(Number);
  return new Date(Date.UTC(año, mes - 1, dia));
}

function aAncla(fecha: Date): string {
  const año = fecha.getUTCFullYear();
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

/** Fecha `YYYY-MM-DD` en Bogotá de un instante (milisegundos UTC). */
export function fechaBogotaDe(instanteMs: number): string {
  return aAncla(new Date(instanteMs - OFFSET_BOGOTA_MS));
}

export function esAnclaValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }
  return aAncla(aFechaUtc(valor)) === valor;
}

/** Lleva cualquier fecha al inicio de su periodo: día 1 del mes o lunes de la semana. */
export function normalizarAncla(tipo: TipoPeriodo, ancla: string): string {
  const fecha = aFechaUtc(ancla);
  if (tipo === 'mes') {
    return aAncla(new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1)));
  }
  if (tipo === 'semana') {
    const diasDesdeLunes = (fecha.getUTCDay() + 6) % 7;
    return aAncla(new Date(fecha.getTime() - diasDesdeLunes * DIA_MS));
  }
  return ancla;
}

/** Periodo de un tipo que contiene el instante dado (p. ej. "este mes"). */
export function periodoDe(tipo: TipoPeriodo, instanteMs: number): Periodo {
  return { tipo, ancla: normalizarAncla(tipo, fechaBogotaDe(instanteMs)) };
}

/** Cambia de tipo conservando la fecha de referencia (mes ↔ semana ↔ todos). */
export function cambiarTipoPeriodo(periodo: Periodo, tipo: TipoPeriodo): Periodo {
  return { tipo, ancla: normalizarAncla(tipo, periodo.ancla) };
}

/** Avanza (`+1`) o retrocede (`-1`) un mes o una semana. En `todos` no hace nada. */
export function moverPeriodo(periodo: Periodo, delta: number): Periodo {
  const fecha = aFechaUtc(periodo.ancla);
  if (periodo.tipo === 'mes') {
    return { ...periodo, ancla: aAncla(new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + delta, 1))) };
  }
  if (periodo.tipo === 'semana') {
    return { ...periodo, ancla: aAncla(new Date(fecha.getTime() + delta * 7 * DIA_MS)) };
  }
  return periodo;
}

/** Rango `[desde, hasta)` en milisegundos UTC, o `null` para `todos`. */
export function rangoDelPeriodo(periodo: Periodo): { desde: number; hasta: number } | null {
  if (periodo.tipo === 'todos') {
    return null;
  }
  const desde = aFechaUtc(periodo.ancla).getTime() + OFFSET_BOGOTA_MS;
  const siguiente = moverPeriodo(periodo, 1);
  return { desde, hasta: aFechaUtc(siguiente.ancla).getTime() + OFFSET_BOGOTA_MS };
}

export function estaEnPeriodo(fechaHoraIso: string, periodo: Periodo): boolean {
  const rango = rangoDelPeriodo(periodo);
  if (!rango) {
    return true;
  }
  const instante = Date.parse(fechaHoraIso);
  return instante >= rango.desde && instante < rango.hasta;
}

/** "Octubre 2026", "5 – 11 oct 2026", "28 sep – 4 oct 2026" o "28 dic 2026 – 3 ene 2027". */
export function etiquetaPeriodo(periodo: Periodo): string {
  const inicio = aFechaUtc(periodo.ancla);
  if (periodo.tipo === 'mes') {
    const nombre = MESES[inicio.getUTCMonth()];
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${inicio.getUTCFullYear()}`;
  }
  if (periodo.tipo === 'semana') {
    const fin = new Date(inicio.getTime() + 6 * DIA_MS);
    const abreviado = (fecha: Date) => MESES[fecha.getUTCMonth()].slice(0, 3);
    if (inicio.getUTCFullYear() !== fin.getUTCFullYear()) {
      return `${inicio.getUTCDate()} ${abreviado(inicio)} ${inicio.getUTCFullYear()} – ${fin.getUTCDate()} ${abreviado(fin)} ${fin.getUTCFullYear()}`;
    }
    if (inicio.getUTCMonth() !== fin.getUTCMonth()) {
      return `${inicio.getUTCDate()} ${abreviado(inicio)} – ${fin.getUTCDate()} ${abreviado(fin)} ${fin.getUTCFullYear()}`;
    }
    return `${inicio.getUTCDate()} – ${fin.getUTCDate()} ${abreviado(fin)} ${fin.getUTCFullYear()}`;
  }
  return 'Todos los eventos';
}

const comparadorTexto = new Intl.Collator('es', { sensitivity: 'base' });

/**
 * Copia ordenada por nombre (sin distinguir tildes ni mayúsculas) o por fecha.
 * El empate se desempata por el otro campo, siempre en el mismo sentido.
 */
export function ordenarEventos<T extends { nombre: string; fechaHora: string }>(
  eventos: readonly T[],
  campo: CampoOrden,
  sentido: SentidoOrden,
): T[] {
  const porNombre = (a: T, b: T) => comparadorTexto.compare(a.nombre, b.nombre);
  const porFecha = (a: T, b: T) => Date.parse(a.fechaHora) - Date.parse(b.fechaHora);
  const factor = sentido === 'asc' ? 1 : -1;
  return [...eventos].sort((a, b) => {
    const principal = campo === 'nombre' ? porNombre(a, b) : porFecha(a, b);
    const desempate = campo === 'nombre' ? porFecha(a, b) : porNombre(a, b);
    return factor * (principal !== 0 ? principal : desempate);
  });
}
