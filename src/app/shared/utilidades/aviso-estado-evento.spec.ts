import { avisoEstadoEvento } from './aviso-estado-evento';

describe('avisoEstadoEvento', () => {
  it('devuelve "AGOTADO" cuando el estado es agotado', () => {
    expect(avisoEstadoEvento('agotado')).toBe('AGOTADO');
  });

  it('devuelve "CANCELADO" cuando el estado es cancelado', () => {
    expect(avisoEstadoEvento('cancelado')).toBe('CANCELADO');
  });

  it('devuelve null cuando el estado es publicado', () => {
    expect(avisoEstadoEvento('publicado')).toBeNull();
  });

  it('devuelve null cuando el estado es borrador', () => {
    expect(avisoEstadoEvento('borrador')).toBeNull();
  });

  it('devuelve null cuando el estado es finalizado', () => {
    expect(avisoEstadoEvento('finalizado')).toBeNull();
  });
});
