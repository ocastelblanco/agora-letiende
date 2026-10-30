/**
 * Datos de prueba del flujo de compra. Todas las fechas son relativas a "ahora"
 * (nunca fijas): un evento "futuro" con fecha fija se vuelve pasado con el
 * tiempo y rompe la suite — la misma bomba de tiempo que ya rompió el CI el
 * 16/09/2026 (`docs/tracking.csv`).
 */
const DIA_MS = 24 * 60 * 60 * 1000;

export const SLUG_EVENTO = 'show-magico-e2e';
export const PRECIO_BOLETA = 45_000;

export interface EventoPublicoSimulado {
  eventoId: string;
  slug: string;
  nombre: string;
  descripcion: string;
  fechaHora: string;
  administradoPorLeTiende: boolean;
  sillasTotales: number;
  sillasDisponibles: number;
  sillasReservadas: number;
  /** Roadmap #33 — ausente en un evento anterior a los tipos (se lee como un único tipo «Por defecto»). */
  tiposBoleta?: { tipoId: string; nombre: string; personas: number; orden: number }[];
  etapas: {
    etapaId: string;
    nombre: string;
    precio: number;
    precios?: { tipoId: string; precio: number }[];
    cierraEn: string;
    orden: number;
  }[];
  maxBoletasPorCompra: number;
  mediosPago: string[];
  plazoComprobanteMinutos: number;
  estado: string;
  creadoEn: string;
  actualizadoEn: string;
}

/** Evento publicado que cobra solo con Bold (un único medio de pago público: no hay selector). */
export function crearEventoBold(cambios: Partial<EventoPublicoSimulado> = {}): EventoPublicoSimulado {
  const ahora = Date.now();
  return {
    eventoId: 'evento-e2e-1',
    slug: SLUG_EVENTO,
    nombre: 'Show mágico (E2E)',
    descripcion: 'Evento de prueba de las pruebas automáticas.',
    fechaHora: new Date(ahora + 30 * DIA_MS).toISOString(),
    administradoPorLeTiende: true,
    sillasTotales: 100,
    sillasDisponibles: 10,
    sillasReservadas: 0,
    etapas: [
      {
        etapaId: 'etapa-e2e-1',
        nombre: 'Preventa',
        precio: PRECIO_BOLETA,
        cierraEn: new Date(ahora + 20 * DIA_MS).toISOString(),
        orden: 1,
      },
    ],
    maxBoletasPorCompra: 4,
    mediosPago: ['bold'],
    plazoComprobanteMinutos: 10,
    estado: 'publicado',
    creadoEn: new Date(ahora - 5 * DIA_MS).toISOString(),
    actualizadoEn: new Date(ahora - 5 * DIA_MS).toISOString(),
    ...cambios,
  };
}

export const PRECIO_INDIVIDUAL = 30_000;
export const PRECIO_PAREJA = 40_000;

/** Evento con dos tipos de boleta (Individual y Pareja de 2 personas) y una sola etapa vigente. */
export function crearEventoConTipos(cambios: Partial<EventoPublicoSimulado> = {}): EventoPublicoSimulado {
  const base = crearEventoBold();
  return {
    ...base,
    tiposBoleta: [
      { tipoId: 'tipo-individual', nombre: 'Individual', personas: 1, orden: 0 },
      { tipoId: 'tipo-pareja', nombre: 'Pareja', personas: 2, orden: 1 },
    ],
    etapas: [
      {
        ...base.etapas[0],
        precio: PRECIO_INDIVIDUAL,
        precios: [
          { tipoId: 'tipo-individual', precio: PRECIO_INDIVIDUAL },
          { tipoId: 'tipo-pareja', precio: PRECIO_PAREJA },
        ],
      },
    ],
    ...cambios,
  };
}

export const CLIENTE_PRUEBA = {
  nombre: 'Ana Prueba',
  telefono: '3001234567',
  // Dominio reservado para pruebas (RFC 2606): nunca llega a una persona real.
  correo: 'ana.prueba@example.com',
};
