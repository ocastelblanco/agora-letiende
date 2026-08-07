import { desdeInputBogota, paraInputBogota } from './fecha-bogota';

describe('fecha-bogota', () => {
  it('paraInputBogota resta 5 horas a un UTC ISO para obtener la hora de pared de Bogotá', () => {
    expect(paraInputBogota('2026-09-15T01:00:00.000Z')).toBe('2026-09-14T20:00');
  });

  it('desdeInputBogota suma 5 horas a una hora de pared de Bogotá para obtener el UTC ISO', () => {
    expect(desdeInputBogota('2026-09-14T20:00')).toBe('2026-09-15T01:00:00.000Z');
  });

  it('es inversa consigo misma en un redondeo completo', () => {
    const original = '2026-01-01T05:30:00.000Z';
    expect(desdeInputBogota(paraInputBogota(original))).toBe(original);
  });
});
