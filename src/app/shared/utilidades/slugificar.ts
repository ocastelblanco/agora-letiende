// Rango Unicode de marcas diacriticas que normalize("NFD") separa de la
// letra base -- quitarlo despues de NFD es el metodo estandar para eliminar
// acentos sin depender de una tabla de reemplazos manual.
const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

/** Convierte texto libre en un slug de URL: minusculas, sin acentos, con guiones. */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
