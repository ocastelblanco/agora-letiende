import { cumpleRolMinimo } from '../../core/models/usuario.model';
import { GRUPOS_NAVEGACION, rutaDestinoParaRol } from './secciones-navegacion';

const TABS_NAVEGACION_PLANOS = GRUPOS_NAVEGACION.flatMap((grupo) => grupo.tabs);

describe('GRUPOS_NAVEGACION', () => {
  it('ya no incluye "Cartelera" — el logo del header ya enlaza a / siempre (TODO.md Tarea 1)', () => {
    expect(TABS_NAVEGACION_PLANOS.some((tab) => tab.etiqueta === 'Cartelera')).toBe(false);
  });

  it('el tab "Eventos" del grupo "Mis Eventos" sigue exigiendo administrador, pese a estar agrupado junto a tabs de productor', () => {
    const grupoMisEventos = GRUPOS_NAVEGACION.find((grupo) => grupo.etiqueta === 'Mis Eventos');
    const tabEventos = grupoMisEventos?.tabs.find((tab) => tab.etiqueta === 'Eventos');

    expect(tabEventos?.rolMinimo).toBe('administrador');
    // Un productor no cumple ese rolMinimo — la agrupación visual con
    // 'Panel'/'Aprobaciones' (ambos 'productor') no relaja la autorización
    // real de 'Eventos', que sigue viviendo en el tab, no en el grupo.
    expect(cumpleRolMinimo('productor', tabEventos!.rolMinimo)).toBe(false);
  });
});

describe('rutaDestinoParaRol', () => {
  it('devuelve / si no hay rol', () => {
    expect(rutaDestinoParaRol(null)).toBe('/');
  });

  it('sin "Cartelera" en el arreglo, rutaDestinoParaRol no cambia para portero/productor/administrador (TODO.md Tarea 1)', () => {
    expect(rutaDestinoParaRol('portero')).toBe('/taquilla/puerta');
    expect(rutaDestinoParaRol('productor')).toBe('/mis-eventos/aprobaciones');
    expect(rutaDestinoParaRol('administrador')).toBe('/usuarios');
  });

  it('devuelve /taquilla/puerta para portero (tab más específico que cumple, no el primero "Cartelera")', () => {
    expect(rutaDestinoParaRol('portero')).toBe('/taquilla/puerta');
  });

  it('sigue devolviendo /taquilla/puerta y no /taquilla/efectivo, pese a que ambos comparten rolMinimo "portero" (orden intencional, TODO.md Tarea 2)', () => {
    expect(rutaDestinoParaRol('portero')).not.toBe('/taquilla/efectivo');
  });

  it('devuelve /mis-eventos/aprobaciones para productor (Eventos requiere administrador, así que un productor no lo alcanza)', () => {
    expect(rutaDestinoParaRol('productor')).toBe('/mis-eventos/aprobaciones');
  });

  it('devuelve /usuarios para administrador (último tab de todos, ya que Usuarios es el último grupo)', () => {
    expect(rutaDestinoParaRol('administrador')).toBe('/usuarios');
  });
});
