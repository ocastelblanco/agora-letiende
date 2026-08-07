export type EstadoEvento = 'borrador' | 'publicado' | 'agotado' | 'finalizado' | 'cancelado';
export type MedioPago = 'bold' | 'efectivo' | 'transferencia';

export interface EtapaBoleteria {
  etapaId: string;
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

/** Registro completo de `agora-eventos` (server/api/handlers/eventos.ts). */
export interface Evento {
  eventoId: string;
  slug: string;
  nombre: string;
  descripcion: string;
  imagenKey?: string;
  logotipoKey?: string;
  fechaHora: string;
  sillasTotales: number;
  sillasDisponibles: number;
  sillasReservadas: number;
  etapas: EtapaBoleteria[];
  maxBoletasPorCompra: number;
  mediosPago: MedioPago[];
  plazoComprobanteMinutos: number;
  productores: string[];
  estado: EstadoEvento;
  creadoEn: string;
  actualizadoEn: string;
}

/** Etapa tal como la envía el formulario — sin `etapaId`, que el backend genera. */
export interface DatosEtapaBoleteria {
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

/** Datos para crear un evento nuevo (`POST /api/eventos`). */
export interface DatosNuevoEvento {
  slug: string;
  nombre: string;
  descripcion: string;
  fechaHora: string;
  sillasTotales: number;
  maxBoletasPorCompra: number;
  etapas: DatosEtapaBoleteria[];
  mediosPago: MedioPago[];
  productores: string[];
  plazoComprobanteMinutos?: number;
}

/**
 * Datos editables de un evento existente (`PUT /api/eventos/:eventoId`).
 * Nunca incluye `sillasTotales`/`sillasDisponibles`/`sillasReservadas` — el
 * backend los rechaza si llegan (`CLAUDE.md` §5, A08; `TODO.md` Tarea 1, el
 * motor de aforo todavía no existe).
 */
export interface DatosEditarEvento {
  nombre?: string;
  descripcion?: string;
  fechaHora?: string;
  maxBoletasPorCompra?: number;
  plazoComprobanteMinutos?: number;
  etapas?: DatosEtapaBoleteria[];
  mediosPago?: MedioPago[];
  productores?: string[];
  estado?: EstadoEvento;
  imagenKey?: string;
  logotipoKey?: string;
}

/**
 * Registro público de `agora-eventos` tal como lo devuelve
 * `GET /api/eventos-publicos` y `GET /api/eventos-publicos/:slug`
 * (server/api/handlers/eventos-publicos.ts, función `aVistaPublica`) —
 * **sin `productores`** (correos de personal interno, nunca dato público,
 * CLAUDE.md §5 A01) y con `imagenUrl`/`logotipoUrl` calculadas en el
 * backend. Deliberadamente no reutiliza `Evento` completo: ese tipo
 * mentiría sobre los campos realmente disponibles en el frontend público.
 */
export interface EventoPublico {
  eventoId: string;
  slug: string;
  nombre: string;
  descripcion: string;
  imagenKey?: string;
  logotipoKey?: string;
  imagenUrl?: string;
  logotipoUrl?: string;
  fechaHora: string;
  sillasTotales: number;
  sillasDisponibles: number;
  sillasReservadas: number;
  etapas: EtapaBoleteria[];
  maxBoletasPorCompra: number;
  mediosPago: MedioPago[];
  plazoComprobanteMinutos: number;
  estado: EstadoEvento;
  creadoEn: string;
  actualizadoEn: string;
}
