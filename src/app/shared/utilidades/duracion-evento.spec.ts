import { describe, expect, it } from 'vitest';
import { duracionLegible, horasMinutosAMinutos, minutosAHorasMinutos } from './duracion-evento';

describe('duracion-evento', () => {
  it('convierte minutos a horas y minutos y de vuelta', () => {
    expect(minutosAHorasMinutos(135)).toEqual({ horas: 2, minutos: 15 });
    expect(minutosAHorasMinutos(1440)).toEqual({ horas: 24, minutos: 0 });
    expect(horasMinutosAMinutos({ horas: 2, minutos: 15 })).toBe(135);
  });

  it('la duración por defecto (180) son exactamente 3 h', () => {
    expect(minutosAHorasMinutos(180)).toEqual({ horas: 3, minutos: 0 });
  });

  it('escribe la duración legible en español', () => {
    expect(duracionLegible(180)).toBe('3 h');
    expect(duracionLegible(135)).toBe('2 h 15 min');
    expect(duracionLegible(45)).toBe('45 min');
  });
});
