import { randomUUID } from 'node:crypto';

/**
 * Tipos de boletería (roadmap #33, ADR-020) — única copia de la
 * normalización y de la validación, compartida por todos los handlers para
 * que ninguno lea `etapa.precio` directamente ni reimplemente sus propias
 * reglas.
 *
 * Un evento define `tiposBoleta` y cada etapa el precio de cada tipo que
 * ofrece (`precios`). Los eventos, compras y boletas anteriores a esta
 * funcionalidad no tienen ninguno de esos campos: se leen como un único tipo
 * implícito `defecto` («Por defecto», 1 persona) con el precio plano de cada
 * etapa — sin migración de datos.
 */

export const TIPO_DEFECTO_ID = 'defecto';
export const TIPO_DEFECTO_NOMBRE = 'Por defecto';
export const PERSONAS_MAXIMAS_POR_TIPO = 10;
const LONGITUD_MAXIMA_NOMBRE_TIPO = 60;

export interface TipoBoleteria {
  tipoId: string;
  nombre: string;
  personas: number;
  orden: number;
}

export interface PrecioEtapa {
  tipoId: string;
  precio: number;
}

/**
 * Etapa ya normalizada. `precio` es el del primer tipo de `precios` y se
 * conserva solo por compatibilidad con lectores anteriores a #33
 * (formulario de administración, Google Calendar); la fuente de verdad es
 * `precios`.
 */
export interface EtapaConPrecios {
  etapaId: string;
  nombre: string;
  cierraEn: string;
  orden: number;
  precio: number;
  precios: PrecioEtapa[];
}

export interface TiposNormalizados {
  tiposBoleta: TipoBoleteria[];
  etapas: EtapaConPrecios[];
}

export function tipoPorDefecto(): TipoBoleteria {
  return { tipoId: TIPO_DEFECTO_ID, nombre: TIPO_DEFECTO_NOMBRE, personas: 1, orden: 0 };
}

function esEnteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

function esPersonasValido(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= 1 &&
    valor <= PERSONAS_MAXIMAS_POR_TIPO
  );
}

/** El nombre de un tipo es texto libre del administrador: longitud acotada y sin caracteres de control (A03). */
function esNombreTipoValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.length <= LONGITUD_MAXIMA_NOMBRE_TIPO &&
    // eslint-disable-next-line no-control-regex
    !/[\x00-\x1f\x7f]/.test(valor)
  );
}

function leerTipos(valor: unknown): TipoBoleteria[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  const tipos: TipoBoleteria[] = [];
  for (const item of valor) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const registro = item as Record<string, unknown>;
    if (typeof registro['tipoId'] !== 'string' || registro['tipoId'].length === 0) {
      continue;
    }
    tipos.push({
      tipoId: registro['tipoId'],
      nombre: typeof registro['nombre'] === 'string' ? registro['nombre'] : TIPO_DEFECTO_NOMBRE,
      personas: esPersonasValido(registro['personas']) ? registro['personas'] : 1,
      orden: typeof registro['orden'] === 'number' ? registro['orden'] : tipos.length,
    });
  }
  return tipos;
}

function leerPrecios(valor: unknown): PrecioEtapa[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  const precios: PrecioEtapa[] = [];
  for (const item of valor) {
    const registro = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null;
    if (registro && typeof registro['tipoId'] === 'string' && esEnteroNoNegativo(registro['precio'])) {
      precios.push({ tipoId: registro['tipoId'], precio: registro['precio'] });
    }
  }
  return precios;
}

/**
 * Lee los tipos y las etapas de un evento persistido (o de un payload ya
 * validado) y devuelve siempre el formato nuevo:
 *
 * - Sin `tiposBoleta` (evento legado) → un único tipo `defecto`.
 * - Etapa sin `precios` (etapa legada) → un único precio, el `precio` plano
 *   de la etapa, asignado al primer tipo del evento.
 *
 * Tolera datos malformados (descarta lo ilegible) en vez de lanzar: se usa en
 * rutas de lectura pública donde un ítem viejo no puede romper la respuesta.
 */
export function normalizarTipos(evento: { tiposBoleta?: unknown; etapas?: unknown }): TiposNormalizados {
  const leidos = leerTipos(evento.tiposBoleta);
  const tiposBoleta = leidos.length > 0 ? [...leidos].sort((a, b) => a.orden - b.orden) : [tipoPorDefecto()];
  const primerTipoId = tiposBoleta[0].tipoId;

  const etapas: EtapaConPrecios[] = [];
  for (const item of Array.isArray(evento.etapas) ? evento.etapas : []) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const registro = item as Record<string, unknown>;
    let precios = leerPrecios(registro['precios']);
    if (precios.length === 0) {
      const precioPlano = esEnteroNoNegativo(registro['precio']) ? registro['precio'] : 0;
      precios = [{ tipoId: primerTipoId, precio: precioPlano }];
    }
    etapas.push({
      etapaId: String(registro['etapaId']),
      nombre: String(registro['nombre']),
      cierraEn: String(registro['cierraEn']),
      orden: typeof registro['orden'] === 'number' ? registro['orden'] : 0,
      precio: precios[0].precio,
      precios,
    });
  }
  return { tiposBoleta, etapas };
}

export type ResultadoTipoDeCompra =
  | { tipo: TipoBoleteria }
  | { error: 'requerido' | 'invalido' };

/**
 * Resuelve el tipo que pide el cliente. `tipoId` ausente solo es válido si el
 * evento tiene un único tipo (clientes anteriores a #33); con varios tipos es
 * obligatorio. Un `tipoId` que no pertenece al evento (inventado, de otro
 * evento u obsoleto) es inválido — del payload del cliente solo se acepta
 * este identificador, nunca el precio, el total ni `personas` (A08).
 */
export function resolverTipoDeCompra(tipos: TipoBoleteria[], tipoId: unknown): ResultadoTipoDeCompra {
  if (tipoId === undefined) {
    return tipos.length === 1 ? { tipo: tipos[0] } : { error: 'requerido' };
  }
  const tipo = typeof tipoId === 'string' ? tipos.find((candidato) => candidato.tipoId === tipoId) : undefined;
  return tipo ? { tipo } : { error: 'invalido' };
}

/** Precio del tipo en la etapa, o `null` si la etapa no lo ofrece. */
export function precioDelTipo(etapa: { precios: PrecioEtapa[] }, tipoId: string): number | null {
  return etapa.precios.find((precio) => precio.tipoId === tipoId)?.precio ?? null;
}

/**
 * Sillas que una compra reserva o devuelve en el aforo: `cantidad × personas`,
 * guardado en `sillas` al crearla. Una compra anterior a #33 no lo tiene: una
 * boleta es una silla.
 */
export function sillasDeCompra(compra: { cantidad: number; sillas?: unknown }): number {
  return typeof compra.sillas === 'number' && Number.isInteger(compra.sillas) && compra.sillas > 0
    ? compra.sillas
    : compra.cantidad;
}

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida el arreglo `tiposBoleta` de un payload. Un `tipoId` recibido se
 * conserva si no se repitió antes en el mismo payload y, o bien pertenece a
 * `idsExistentes` (los tipos que el evento ya tiene), o bien tiene forma de
 * UUID: el formulario de administración genera el id de un tipo nuevo para
 * poder referenciarlo en los `precios` de las etapas del mismo PUT. Un id no
 * es un secreto ni da acceso a nada (solo tiene sentido dentro del evento);
 * cualquier otro caso recibe un UUID nuevo. Devuelve
 * `null` si es inválido: vacío, nombre inválido o repetido (sin distinguir
 * mayúsculas), o `personas` fuera de 1–10 (ausente = 1).
 */
export function validarTiposBoleta(
  valor: unknown,
  idsExistentes: ReadonlySet<string> = new Set(),
): TipoBoleteria[] | null {
  if (!Array.isArray(valor) || valor.length === 0) {
    return null;
  }
  const tipos: TipoBoleteria[] = [];
  const idsAsignados = new Set<string>();
  const nombresVistos = new Set<string>();
  for (const item of valor) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const registro = item as Record<string, unknown>;
    if (!esNombreTipoValido(registro['nombre'])) {
      return null;
    }
    const personas = registro['personas'] === undefined ? 1 : registro['personas'];
    if (!esPersonasValido(personas)) {
      return null;
    }
    const nombreClave = registro['nombre'].trim().toLowerCase();
    if (nombresVistos.has(nombreClave)) {
      return null;
    }
    nombresVistos.add(nombreClave);

    const idRecibido = registro['tipoId'];
    const tipoId =
      typeof idRecibido === 'string' &&
      (idsExistentes.has(idRecibido) || PATRON_UUID.test(idRecibido)) &&
      !idsAsignados.has(idRecibido)
        ? idRecibido
        : randomUUID();
    idsAsignados.add(tipoId);
    tipos.push({ tipoId, nombre: registro['nombre'].trim(), personas, orden: tipos.length });
  }
  return tipos;
}

/**
 * Valida los precios de una etapa contra los tipos del evento: al menos uno,
 * sin `tipoId` repetido, todo `tipoId` existente y precio entero ≥ 0. Acepta
 * el `precio` plano de los clientes anteriores a #33 como el precio del
 * primer tipo. Devuelve `null` si es inválido.
 */
export function validarPreciosEtapa(
  registro: Record<string, unknown>,
  tipos: TipoBoleteria[],
): PrecioEtapa[] | null {
  if (registro['precios'] === undefined) {
    return esEnteroNoNegativo(registro['precio']) ? [{ tipoId: tipos[0].tipoId, precio: registro['precio'] }] : null;
  }
  if (!Array.isArray(registro['precios']) || registro['precios'].length === 0) {
    return null;
  }
  const idsDelEvento = new Set(tipos.map((tipo) => tipo.tipoId));
  const idsVistos = new Set<string>();
  const precios: PrecioEtapa[] = [];
  for (const item of registro['precios']) {
    const entrada = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null;
    if (
      !entrada ||
      typeof entrada['tipoId'] !== 'string' ||
      !idsDelEvento.has(entrada['tipoId']) ||
      idsVistos.has(entrada['tipoId']) ||
      !esEnteroNoNegativo(entrada['precio'])
    ) {
      return null;
    }
    idsVistos.add(entrada['tipoId']);
    precios.push({ tipoId: entrada['tipoId'], precio: entrada['precio'] });
  }
  return precios;
}

/** `tipoId` que alguna etapa todavía usa — un tipo en uso no se puede eliminar. */
export function tiposEnUso(etapas: { precios: PrecioEtapa[] }[]): Set<string> {
  return new Set(etapas.flatMap((etapa) => etapa.precios.map((precio) => precio.tipoId)));
}
