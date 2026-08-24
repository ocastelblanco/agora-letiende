export type EstadoEvento = 'borrador' | 'publicado' | 'agotado' | 'finalizado' | 'cancelado';
export type MedioPago = 'bold' | 'efectivo' | 'transferencia';

export interface EtapaBoleteria {
  etapaId: string;
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

/**
 * v2 (roadmap #25) — vínculo hacia el canal real de venta de un evento con
 * boletería externa (`administradoPorLeTiende === false`). `valor` guarda
 * solo la parte variable, sin el prefijo fijo de cada tipo; la URL completa
 * se construye anteponiendo ese prefijo: whatsapp → `https://wa.me/57`,
 * instagram → `https://www.instagram.com/`, web → `https://` (tech-specs.md §4.3).
 */
export type TipoVinculo = 'whatsapp' | 'instagram' | 'web';

export interface VinculoExterno {
  tipo: TipoVinculo;
  valor: string;
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
  // v2 (roadmap #25) — `true` por defecto, retrocompatible con todo evento
  // existente. En `false`, Ágora no vende ni controla el aforo del evento:
  // los campos de boletería de abajo se normalizan a valores neutros en el
  // backend y en su lugar aplica `vinculoExterno`.
  administradoPorLeTiende: boolean;
  vinculoExterno?: VinculoExterno;
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
  // v2 (roadmap #25) — el backend normaliza los campos de boletería a
  // valores neutros cuando esto es `false`, sin importar lo que se envíe
  // para ellos (CLAUDE.md §5, A04/A08); en ese caso `vinculoExterno` es
  // obligatorio.
  administradoPorLeTiende: boolean;
  sillasTotales: number;
  maxBoletasPorCompra: number;
  etapas: DatosEtapaBoleteria[];
  mediosPago: MedioPago[];
  productores: string[];
  /** Opcional al crear — puede quedar vacío (`TODO.md` Tarea 1, T7). */
  porteros?: string[];
  plazoComprobanteMinutos?: number;
  vinculoExterno?: VinculoExterno;
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
  /** v2 (roadmap #25) — al enviarse en `false`, el backend exige `vinculoExterno` en el mismo PUT. */
  administradoPorLeTiende?: boolean;
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
  vinculoExterno?: VinculoExterno;
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
  // v2 (roadmap #25) — `true` por defecto (normalizado en el backend,
  // `eventos-publicos.ts`, `aVistaPublica`). En `false`, el detalle público
  // no muestra el flujo de compra sino `vinculoExterno`/`vinculoExternoUrl`.
  administradoPorLeTiende: boolean;
  vinculoExterno?: VinculoExterno;
  /** URL completa ya construida por el backend (prefijo fijo + `vinculoExterno.valor`). */
  vinculoExternoUrl?: string;
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
