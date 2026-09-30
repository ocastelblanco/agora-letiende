import { describe, expect, it } from 'vitest';
import {
  cambiarTipoPeriodo,
  esAnclaValida,
  estaEnPeriodo,
  etiquetaPeriodo,
  fechaBogotaDe,
  inicioDelDiaBogota,
  moverPeriodo,
  normalizarAncla,
  ordenarEventos,
  ordenarPorProximidad,
  periodoDe,
  periodoDesdeParametros,
  rangoDelPeriodo,
} from './periodo-eventos';

// 2026-10-01 es jueves; la semana de Bogotá va de lunes 28/09 a domingo 04/10.
describe('periodo-eventos', () => {
  it('fechaBogotaDe usa la fecha de Bogotá, no la de UTC', () => {
    // 2026-11-01T02:00Z = 31 de octubre a las 21:00 en Bogotá
    expect(fechaBogotaDe(Date.parse('2026-11-01T02:00:00.000Z'))).toBe('2026-10-31');
  });

  it('valida anclas reales', () => {
    expect(esAnclaValida('2026-10-01')).toBe(true);
    expect(esAnclaValida('2026-02-30')).toBe(false);
    expect(esAnclaValida('hoy')).toBe(false);
    expect(esAnclaValida(undefined)).toBe(false);
  });

  it('normaliza al día 1 del mes y al lunes de la semana', () => {
    expect(normalizarAncla('mes', '2026-10-17')).toBe('2026-10-01');
    expect(normalizarAncla('semana', '2026-10-01')).toBe('2026-09-28');
    expect(normalizarAncla('semana', '2026-09-28')).toBe('2026-09-28');
    expect(normalizarAncla('semana', '2026-10-04')).toBe('2026-09-28'); // domingo
  });

  it('periodoDe ubica el instante en su mes y su semana', () => {
    const instante = Date.parse('2026-10-01T18:00:00.000Z');
    expect(periodoDe('mes', instante)).toEqual({ tipo: 'mes', ancla: '2026-10-01' });
    expect(periodoDe('semana', instante)).toEqual({ tipo: 'semana', ancla: '2026-09-28' });
  });

  it('mueve meses y semanas, incluso cruzando el año', () => {
    expect(moverPeriodo({ tipo: 'mes', ancla: '2026-12-01' }, 1).ancla).toBe('2027-01-01');
    expect(moverPeriodo({ tipo: 'mes', ancla: '2026-01-01' }, -1).ancla).toBe('2025-12-01');
    expect(moverPeriodo({ tipo: 'semana', ancla: '2026-09-28' }, 1).ancla).toBe('2026-10-05');
    expect(moverPeriodo({ tipo: 'semana', ancla: '2026-12-28' }, 1).ancla).toBe('2027-01-04');
  });

  it('cambiar de tipo conserva la fecha de referencia', () => {
    expect(cambiarTipoPeriodo({ tipo: 'todos', ancla: '2026-10-17' }, 'mes')).toEqual({
      tipo: 'mes',
      ancla: '2026-10-01',
    });
    expect(cambiarTipoPeriodo({ tipo: 'mes', ancla: '2026-10-01' }, 'semana').ancla).toBe('2026-09-28');
  });

  it('todos no tiene rango y acepta cualquier evento', () => {
    expect(rangoDelPeriodo({ tipo: 'todos', ancla: '2026-10-01' })).toBeNull();
    expect(estaEnPeriodo('2020-01-01T00:00:00.000Z', { tipo: 'todos', ancla: '2026-10-01' })).toBe(true);
  });

  it('el mes se corta a medianoche de Bogotá, no de UTC', () => {
    const octubre = { tipo: 'mes' as const, ancla: '2026-10-01' };
    // 31/oct 21:00 Bogotá = 01/nov 02:00 UTC → sigue siendo octubre
    expect(estaEnPeriodo('2026-11-01T02:00:00.000Z', octubre)).toBe(true);
    // 01/nov 00:00 Bogotá = 01/nov 05:00 UTC → ya es noviembre
    expect(estaEnPeriodo('2026-11-01T05:00:00.000Z', octubre)).toBe(false);
    // 01/oct 00:00 Bogotá = 05:00 UTC → entra
    expect(estaEnPeriodo('2026-10-01T05:00:00.000Z', octubre)).toBe(true);
    expect(estaEnPeriodo('2026-10-01T04:59:00.000Z', octubre)).toBe(false);
  });

  it('la semana va de lunes a domingo', () => {
    const semana = { tipo: 'semana' as const, ancla: '2026-09-28' };
    expect(estaEnPeriodo('2026-09-28T05:00:00.000Z', semana)).toBe(true); // lunes 00:00 Bogotá
    expect(estaEnPeriodo('2026-10-05T04:59:00.000Z', semana)).toBe(true); // domingo 23:59 Bogotá
    expect(estaEnPeriodo('2026-10-05T05:00:00.000Z', semana)).toBe(false); // lunes siguiente
  });

  it('escribe la etiqueta en español para mes y semana', () => {
    expect(etiquetaPeriodo({ tipo: 'mes', ancla: '2026-10-01' })).toBe('Octubre 2026');
    expect(etiquetaPeriodo({ tipo: 'semana', ancla: '2026-10-05' })).toBe('5 – 11 oct 2026');
    expect(etiquetaPeriodo({ tipo: 'semana', ancla: '2026-09-28' })).toBe('28 sep – 4 oct 2026');
    expect(etiquetaPeriodo({ tipo: 'semana', ancla: '2026-12-28' })).toBe('28 dic 2026 – 3 ene 2027');
    expect(etiquetaPeriodo({ tipo: 'todos', ancla: '2026-10-01' })).toBe('Todos los eventos');
  });

  describe('ordenarEventos', () => {
    const eventos = [
      { nombre: 'Álbum', fechaHora: '2026-10-03T00:00:00.000Z' },
      { nombre: 'zorro', fechaHora: '2026-10-01T00:00:00.000Z' },
      { nombre: 'Banda', fechaHora: '2026-10-02T00:00:00.000Z' },
      { nombre: 'Banda', fechaHora: '2026-10-01T12:00:00.000Z' },
    ];

    it('por nombre ignora tildes y mayúsculas y desempata por fecha', () => {
      expect(ordenarEventos(eventos, 'nombre', 'asc').map((e) => `${e.nombre}|${e.fechaHora.slice(5, 10)}`)).toEqual([
        'Álbum|10-03',
        'Banda|10-01',
        'Banda|10-02',
        'zorro|10-01',
      ]);
    });

    it('por fecha descendente pone primero la más reciente', () => {
      expect(ordenarEventos(eventos, 'fecha', 'desc')[0].nombre).toBe('Álbum');
    });

    it('por fecha ascendente pone primero la más antigua y no muta la entrada', () => {
      const copia = [...eventos];
      expect(ordenarEventos(eventos, 'fecha', 'asc')[0].nombre).toBe('zorro');
      expect(eventos).toEqual(copia);
    });
  });
  it('periodoDesdeParametros acepta tipos y anclas válidos e ignora el resto', () => {
    expect(periodoDesdeParametros('mes', '2026-10-01')).toEqual({ tipo: 'mes', ancla: '2026-10-01' });
    expect(periodoDesdeParametros('semana', '2026-09-28')).toEqual({ tipo: 'semana', ancla: '2026-09-28' });
    expect(periodoDesdeParametros('año', '2026-10-01')).toBeNull();
    expect(periodoDesdeParametros('mes', '2026-13-01')).toBeNull();
    expect(periodoDesdeParametros(null, null)).toBeNull();
  });

  it('inicioDelDiaBogota es la medianoche de Bogotá (05:00 UTC), no la de UTC', () => {
    // 2026-10-02T03:00Z sigue siendo 1 de octubre a las 22:00 en Bogotá
    expect(inicioDelDiaBogota(Date.parse('2026-10-02T03:00:00.000Z'))).toBe(Date.parse('2026-10-01T05:00:00.000Z'));
    expect(inicioDelDiaBogota(Date.parse('2026-10-02T15:00:00.000Z'))).toBe(Date.parse('2026-10-02T05:00:00.000Z'));
  });

  describe('ordenarPorProximidad', () => {
    // "Ahora" = 2 de octubre a las 10:00 en Bogotá
    const ahora = Date.parse('2026-10-02T15:00:00.000Z');
    const eventos = [
      { nombre: 'Pasado lejano', fechaHora: '2026-09-20T18:00:00.000Z' },
      { nombre: 'Futuro lejano', fechaHora: '2026-10-20T18:00:00.000Z' },
      { nombre: 'Ayer', fechaHora: '2026-10-02T03:00:00.000Z' },
      { nombre: 'Hoy', fechaHora: '2026-10-02T18:00:00.000Z' },
      { nombre: 'Mañana', fechaHora: '2026-10-03T18:00:00.000Z' },
    ];

    it('pone primero hoy y lo que viene, del más cercano al más lejano, y después lo pasado, del más reciente al más antiguo', () => {
      expect(ordenarPorProximidad(eventos, ahora).map((e) => e.nombre)).toEqual([
        'Hoy',
        'Mañana',
        'Futuro lejano',
        'Ayer',
        'Pasado lejano',
      ]);
    });

    it('un evento de hoy que ya empezó sigue arriba de los próximos (es el que se abre durante la función)', () => {
      const enCurso = [
        { nombre: 'Mañana', fechaHora: '2026-10-03T18:00:00.000Z' },
        { nombre: 'En curso', fechaHora: '2026-10-02T14:00:00.000Z' }, // 09:00 en Bogotá, ya empezó
      ];

      expect(ordenarPorProximidad(enCurso, ahora)[0].nombre).toBe('En curso');
    });

    it('desempata por nombre y no muta la entrada', () => {
      const iguales = [
        { nombre: 'Zeta', fechaHora: '2026-10-03T18:00:00.000Z' },
        { nombre: 'Álef', fechaHora: '2026-10-03T18:00:00.000Z' },
      ];
      const copia = [...iguales];

      expect(ordenarPorProximidad(iguales, ahora).map((e) => e.nombre)).toEqual(['Álef', 'Zeta']);
      expect(iguales).toEqual(copia);
    });
  });
});
