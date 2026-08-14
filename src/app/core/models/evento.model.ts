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
  /** Análogo a `productores`, pero opcional: puede quedar vacío (`TODO.md` Tarea 1, T7). */
  porteros: string[];
  estado: EstadoEvento;
  creadoEn: string;
  actualizadoEn: string;
}

/**
 * Etapa tal como la envía el formulario. El backend genera un `etapaId`
 * nuevo para una etapa genuinamente nueva (`etapaId` ausente/vacío), pero
 * si `etapaId` viene y pertenece a una etapa ya existente del evento
 * (`PUT /api/eventos/:eventoId`), lo preserva tal cual — así una edición no
 * huerfaniza el `etapaId` que ya referencian `compras`/`boletas` (TODO.md
 * Tarea 2).
 */
export interface DatosEtapaBoleteria {
  etapaId?: string;
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
  /** Opcional al crear — puede quedar vacío (`TODO.md` Tarea 1, T7). */
  porteros?: string[];
  plazoComprobanteMinutos?: number;
}

/**
 * Datos editables de un evento existente (`PUT /api/eventos/:eventoId`).
 * `sillasTotales` es editable por `administrador` (hotfixes pre-producción)
 * — el backend ajusta `sillasDisponibles` por la diferencia, nunca acepta
 * ese campo directo. Nunca incluye `sillasDisponibles`/`sillasReservadas`:
 * el aforo consumido solo lo escribe `aforo.ts` (`CLAUDE.md` §5, A08).
 */
export interface DatosEditarEvento {
  nombre?: string;
  descripcion?: string;
  fechaHora?: string;
  sillasTotales?: number;
  maxBoletasPorCompra?: number;
  plazoComprobanteMinutos?: number;
  etapas?: DatosEtapaBoleteria[];
  mediosPago?: MedioPago[];
  productores?: string[];
  porteros?: string[];
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
