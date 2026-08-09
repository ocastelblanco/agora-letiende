import { describe, expect, it } from 'vitest';
import {
  esEmailValido,
  esEnteroPositivo,
  esNombreClienteValido,
  esTelefonoValido,
  esTextoValido,
} from './validaciones';

describe('esTextoValido', () => {
  it('acepta texto no vacío dentro del límite', () => {
    expect(esTextoValido('concierto-jazz', 120)).toBe(true);
  });

  it('rechaza vacío, solo espacios, y texto que supera el límite', () => {
    expect(esTextoValido('', 120)).toBe(false);
    expect(esTextoValido('   ', 120)).toBe(false);
    expect(esTextoValido('a'.repeat(121), 120)).toBe(false);
    expect(esTextoValido(123, 120)).toBe(false);
  });
});

describe('esEnteroPositivo', () => {
  it('acepta enteros mayores a cero', () => {
    expect(esEnteroPositivo(1)).toBe(true);
    expect(esEnteroPositivo(4)).toBe(true);
  });

  it('rechaza cero, negativos, decimales y no-números', () => {
    expect(esEnteroPositivo(0)).toBe(false);
    expect(esEnteroPositivo(-1)).toBe(false);
    expect(esEnteroPositivo(1.5)).toBe(false);
    expect(esEnteroPositivo('2')).toBe(false);
  });
});

describe('esEmailValido', () => {
  it('acepta un correo con formato válido', () => {
    expect(esEmailValido('ana@correo.com')).toBe(true);
  });

  it('rechaza correos sin arroba, sin dominio, o no-string', () => {
    expect(esEmailValido('ana-correo.com')).toBe(false);
    expect(esEmailValido('ana@correo')).toBe(false);
    expect(esEmailValido(42)).toBe(false);
  });
});

describe('esTelefonoValido', () => {
  it('acepta dígitos, +, paréntesis, guiones y espacios entre 7 y 20 caracteres', () => {
    expect(esTelefonoValido('+57 300 1234567')).toBe(true);
    expect(esTelefonoValido('(601) 555-1234')).toBe(true);
  });

  it('rechaza texto demasiado corto, demasiado largo o con letras', () => {
    expect(esTelefonoValido('123')).toBe(false);
    expect(esTelefonoValido('1'.repeat(21))).toBe(false);
    expect(esTelefonoValido('abc1234567')).toBe(false);
  });
});

describe('esNombreClienteValido', () => {
  it('acepta un nombre normal', () => {
    expect(esNombreClienteValido('Ana Pérez')).toBe(true);
  });

  it('rechaza vacío, texto demasiado largo, y caracteres de control (CLAUDE.md A03)', () => {
    expect(esNombreClienteValido('')).toBe(false);
    expect(esNombreClienteValido('a'.repeat(201))).toBe(false);
    expect(esNombreClienteValido('Ana\x00Pérez')).toBe(false);
  });
});
