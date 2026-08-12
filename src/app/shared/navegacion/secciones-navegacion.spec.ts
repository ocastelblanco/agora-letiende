import { rutaDestinoParaRol, SECCIONES_NAVEGACION } from './secciones-navegacion';

describe('SECCIONES_NAVEGACION', () => {
  it('ya no incluye "Cartelera" — el logo del header ya enlaza a / siempre (TODO.md Tarea 1)', () => {
    expect(SECCIONES_NAVEGACION.some((seccion) => seccion.etiqueta === 'Cartelera')).toBe(false);
  });
});

describe('rutaDestinoParaRol', () => {
  it('devuelve / si no hay rol', () => {
    expect(rutaDestinoParaRol(null)).toBe('/');
  });

  it('sin "Cartelera" en el arreglo, rutaDestinoParaRol no cambia para portero/productor/administrador (TODO.md Tarea 1)', () => {
    expect(rutaDestinoParaRol('portero')).toBe('/puerta');
    expect(rutaDestinoParaRol('productor')).toBe('/admin/aprobaciones');
    expect(rutaDestinoParaRol('administrador')).toBe('/admin/usuarios');
  });

  it('devuelve /puerta para portero (sección más específica que cumple, no la primera "Cartelera")', () => {
    expect(rutaDestinoParaRol('portero')).toBe('/puerta');
  });

  it('sigue devolviendo /puerta y no /efectivo, pese a que ambas comparten rolMinimo "portero" (orden intencional, TODO.md Tarea 2)', () => {
    expect(rutaDestinoParaRol('portero')).not.toBe('/efectivo');
  });

  it('devuelve /admin/aprobaciones para productor', () => {
    expect(rutaDestinoParaRol('productor')).toBe('/admin/aprobaciones');
  });

  it('devuelve /admin/usuarios para administrador (última sección, no /admin/eventos)', () => {
    expect(rutaDestinoParaRol('administrador')).toBe('/admin/usuarios');
  });
});
