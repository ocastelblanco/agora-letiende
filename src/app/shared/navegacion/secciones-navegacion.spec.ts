import { rutaDestinoParaRol } from './secciones-navegacion';

describe('rutaDestinoParaRol', () => {
  it('devuelve / si no hay rol', () => {
    expect(rutaDestinoParaRol(null)).toBe('/');
  });

  it('devuelve /puerta para portero (sección más específica que cumple, no la primera "Cartelera")', () => {
    expect(rutaDestinoParaRol('portero')).toBe('/puerta');
  });

  it('devuelve /admin/aprobaciones para productor', () => {
    expect(rutaDestinoParaRol('productor')).toBe('/admin/aprobaciones');
  });

  it('devuelve /admin/usuarios para administrador (última sección, no /admin/eventos)', () => {
    expect(rutaDestinoParaRol('administrador')).toBe('/admin/usuarios');
  });
});
