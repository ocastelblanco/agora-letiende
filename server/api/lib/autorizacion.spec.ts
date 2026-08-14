import { describe, expect, it } from 'vitest';
import { tieneAccesoAlEvento } from './autorizacion';

const permisos = (rol: 'administrador' | 'productor' | 'portero', email: string) => ({
  email,
  nombre: 'Alguien',
  rol,
  activo: true,
});

describe('tieneAccesoAlEvento', () => {
  it('un administrador siempre tiene acceso, aunque no esté en productores ni porteros', () => {
    const evento = { productores: [], porteros: [] };
    expect(tieneAccesoAlEvento(evento, permisos('administrador', 'admin@letiende.co'))).toBe(true);
  });

  it('un productor tiene acceso si su correo está en productores', () => {
    const evento = { productores: ['productor@letiende.co'], porteros: [] };
    expect(tieneAccesoAlEvento(evento, permisos('productor', 'productor@letiende.co'))).toBe(true);
  });

  it('un productor NO tiene acceso si su correo no está en productores', () => {
    const evento = { productores: ['otro@letiende.co'], porteros: [] };
    expect(tieneAccesoAlEvento(evento, permisos('productor', 'productor@letiende.co'))).toBe(false);
  });

  // TODO.md Tarea 1 (T8): antes de esta tarea, tieneAccesoAlEvento solo
  // resolvía productor/administrador — un portero siempre caía al `false`
  // final sin importar `porteros`.
  it('un portero tiene acceso si su correo está en porteros', () => {
    const evento = { productores: [], porteros: ['portero@letiende.co'] };
    expect(tieneAccesoAlEvento(evento, permisos('portero', 'portero@letiende.co'))).toBe(true);
  });

  it('un portero NO tiene acceso si su correo no está en porteros', () => {
    const evento = { productores: [], porteros: ['otro@letiende.co'] };
    expect(tieneAccesoAlEvento(evento, permisos('portero', 'portero@letiende.co'))).toBe(false);
  });

  it('un portero nunca se resuelve contra productores, aunque su correo esté ahí', () => {
    const evento = { productores: ['portero@letiende.co'], porteros: [] };
    expect(tieneAccesoAlEvento(evento, permisos('portero', 'portero@letiende.co'))).toBe(false);
  });

  it('un productor nunca se resuelve contra porteros, aunque su correo esté ahí', () => {
    const evento = { productores: [], porteros: ['productor@letiende.co'] };
    expect(tieneAccesoAlEvento(evento, permisos('productor', 'productor@letiende.co'))).toBe(false);
  });

  it('devuelve false si el campo correspondiente no es un arreglo (dato inconsistente)', () => {
    const evento = { productores: undefined, porteros: undefined };
    expect(tieneAccesoAlEvento(evento, permisos('productor', 'productor@letiende.co'))).toBe(false);
    expect(tieneAccesoAlEvento(evento, permisos('portero', 'portero@letiende.co'))).toBe(false);
  });
});
