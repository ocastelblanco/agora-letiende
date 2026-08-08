import { beforeEach, describe, expect, it } from 'vitest';
import { generarTokenEnlace, hashearToken } from './enlaces-magicos';

beforeEach(() => {
  process.env['SECRETO_ENLACES_MAGICOS'] = 'secreto-de-prueba';
});

describe('generarTokenEnlace', () => {
  it('genera un token con al menos 128 bits de entropía (32 bytes en hexadecimal)', () => {
    const { token } = generarTokenEnlace();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('genera tokens distintos en cada llamada', () => {
    const primero = generarTokenEnlace();
    const segundo = generarTokenEnlace();
    expect(primero.token).not.toBe(segundo.token);
    expect(primero.hash).not.toBe(segundo.hash);
  });

  it('el hash no permite reconstruir el token (no es el token en claro)', () => {
    const { token, hash } = generarTokenEnlace();
    expect(hash).not.toBe(token);
  });
});

describe('hashearToken', () => {
  it('deriva el mismo hash que generarTokenEnlace produjo para ese token', () => {
    const { token, hash } = generarTokenEnlace();
    expect(hashearToken(token)).toBe(hash);
  });

  it('produce hashes distintos con secretos distintos (defensa ante fuga de la tabla)', () => {
    const { token, hash } = generarTokenEnlace();
    process.env['SECRETO_ENLACES_MAGICOS'] = 'otro-secreto';
    expect(hashearToken(token)).not.toBe(hash);
  });
});
