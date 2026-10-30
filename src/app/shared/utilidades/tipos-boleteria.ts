import type { EtapaBoleteria, TipoBoleteria } from '../../core/models/evento.model';

/** Id del tipo implícito de un evento anterior a los tipos de boletería (ADR-020). */
export const TIPO_DEFECTO_ID = 'defecto';

const NOMBRE_TIPO_DEFECTO = 'Por defecto';

/**
 * Tipos de boleta de un evento **solo para mostrar en pantalla**. El backend
 * ya normaliza (`normalizarTipos()`), pero la plantilla no depende de eso: si
 * `tiposBoleta` falta o llega vacío, se trata como un único tipo «Por
 * defecto» — retrocompatible con cualquier respuesta anterior a los tipos.
 */
export function tiposDelEvento(evento: { tiposBoleta?: TipoBoleteria[] }): TipoBoleteria[] {
  const tipos = evento.tiposBoleta;
  if (!tipos || tipos.length === 0) {
    return [{ tipoId: TIPO_DEFECTO_ID, nombre: NOMBRE_TIPO_DEFECTO, personas: 1, orden: 0 }];
  }
  return [...tipos].sort((a, b) => a.orden - b.orden);
}

/**
 * `true` cuando el evento tiene un único tipo y es el «Por defecto»: la
 * página no muestra encabezados de columna ni botones por tipo, y se ve como
 * antes de los tipos de boletería (`PRD.md` §5.14).
 */
export function soloTipoPorDefecto(tipos: TipoBoleteria[]): boolean {
  return tipos.length === 1 && tipos[0].nombre.trim().toLowerCase() === NOMBRE_TIPO_DEFECTO.toLowerCase();
}

/**
 * Precio de un tipo en una etapa, o `null` si la etapa no lo ofrece. Solo
 * presentación: el precio real de una compra lo calcula siempre el backend
 * (`CLAUDE.md` §5 A08). Una etapa sin `precios` (respuesta anterior a los
 * tipos) solo ofrece el tipo `defecto`, con su `precio` plano.
 */
export function precioDelTipoEnEtapa(etapa: EtapaBoleteria, tipoId: string): number | null {
  if (!etapa.precios || etapa.precios.length === 0) {
    return tipoId === TIPO_DEFECTO_ID ? etapa.precio : null;
  }
  return etapa.precios.find((precio) => precio.tipoId === tipoId)?.precio ?? null;
}
