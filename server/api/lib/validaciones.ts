/**
 * Validadores de los campos de cliente que llegan en texto libre desde un
 * formulario público o desde el equipo (`TODO.md` Tarea 2) — única copia,
 * compartida por `handlers/compras.ts` y `handlers/ventas-efectivo.ts`, para
 * que ningún handler nuevo reimplemente su propia versión con reglas
 * ligeramente distintas.
 */

export function esTextoValido(valor: unknown, longitudMaxima: number): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= longitudMaxima;
}

export function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

export function esEmailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function esTelefonoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9+()\-\s]{7,20}$/.test(valor);
}

/**
 * El nombre del cliente es entrada hostil por definición (`CLAUDE.md` §5,
 * A03: texto libre escrito por un desconocido en un formulario público, o
 * transcrito por el equipo en la puerta) — más estricto que `esTextoValido`:
 * además de longitud máxima, rechaza caracteres de control.
 */
export function esNombreClienteValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.length <= 200 &&
    // eslint-disable-next-line no-control-regex
    !/[\x00-\x1f\x7f]/.test(valor)
  );
}
