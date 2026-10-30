import { describe, expect, it } from 'vitest';
import {
  normalizarTipos,
  precioDelTipo,
  resolverTipoDeCompra,
  sillasDeCompra,
  tiposEnUso,
  validarPreciosEtapa,
  validarTiposBoleta,
} from './tipos-boleteria';

const individual = { tipoId: 't-ind', nombre: 'Individual', personas: 1, orden: 0 };
const pareja = { tipoId: 't-par', nombre: 'Pareja', personas: 2, orden: 1 };

describe('normalizarTipos', () => {
  it('un evento legado (sin tiposBoleta, etapas con precio plano) se lee como un único tipo defecto', () => {
    const { tiposBoleta, etapas } = normalizarTipos({
      etapas: [{ etapaId: 'e1', nombre: 'Preventa', precio: 30000, cierraEn: '2026-10-31T00:00:00.000Z', orden: 1 }],
    });

    expect(tiposBoleta).toEqual([{ tipoId: 'defecto', nombre: 'Por defecto', personas: 1, orden: 0 }]);
    expect(etapas[0].precios).toEqual([{ tipoId: 'defecto', precio: 30000 }]);
    expect(etapas[0].precio).toBe(30000);
  });

  it('conserva los tipos y precios del formato nuevo, ordenados por orden', () => {
    const { tiposBoleta, etapas } = normalizarTipos({
      tiposBoleta: [pareja, individual],
      etapas: [
        {
          etapaId: 'e1',
          nombre: 'Preventa',
          cierraEn: '2026-10-31T00:00:00.000Z',
          orden: 1,
          precios: [
            { tipoId: 't-ind', precio: 30000 },
            { tipoId: 't-par', precio: 40000 },
          ],
        },
      ],
    });

    expect(tiposBoleta.map((tipo) => tipo.tipoId)).toEqual(['t-ind', 't-par']);
    expect(etapas[0].precios).toHaveLength(2);
    expect(etapas[0].precio).toBe(30000);
  });

  it('tolera datos malformados sin lanzar', () => {
    const { tiposBoleta, etapas } = normalizarTipos({ tiposBoleta: 'x', etapas: [null, 7] });
    expect(tiposBoleta).toHaveLength(1);
    expect(etapas).toEqual([]);
  });
});

describe('resolverTipoDeCompra', () => {
  it('sin tipoId solo es válido con un único tipo', () => {
    expect(resolverTipoDeCompra([individual], undefined)).toEqual({ tipo: individual });
    expect(resolverTipoDeCompra([individual, pareja], undefined)).toEqual({ error: 'requerido' });
  });

  it.each([['otro-evento'], [123], [null], [{ $ne: 1 }], ['__proto__']])(
    'rechaza un tipoId hostil o ajeno al evento (%j)',
    (tipoId) => {
      expect(resolverTipoDeCompra([individual, pareja], tipoId)).toEqual({ error: 'invalido' });
    },
  );

  it('resuelve un tipoId del evento', () => {
    expect(resolverTipoDeCompra([individual, pareja], 't-par')).toEqual({ tipo: pareja });
  });
});

describe('precioDelTipo y sillasDeCompra', () => {
  it('devuelve null si la etapa no ofrece el tipo', () => {
    expect(precioDelTipo({ precios: [{ tipoId: 't-ind', precio: 10 }] }, 't-par')).toBeNull();
    expect(precioDelTipo({ precios: [{ tipoId: 't-ind', precio: 0 }] }, 't-ind')).toBe(0);
  });

  it('usa sillas si existe y cae a cantidad en una compra legada', () => {
    expect(sillasDeCompra({ cantidad: 3, sillas: 6 })).toBe(6);
    expect(sillasDeCompra({ cantidad: 3 })).toBe(3);
    expect(sillasDeCompra({ cantidad: 3, sillas: 'x' })).toBe(3);
  });
});

describe('validarTiposBoleta', () => {
  it('genera un tipoId nuevo y personas = 1 por defecto', () => {
    const tipos = validarTiposBoleta([{ nombre: 'Individual' }, { nombre: 'Pareja', personas: 2 }]);
    expect(tipos).toHaveLength(2);
    expect(tipos?.[0].personas).toBe(1);
    expect(tipos?.[0].tipoId).not.toBe(tipos?.[1].tipoId);
  });

  it('conserva un tipoId existente y descarta uno inventado o repetido', () => {
    const tipos = validarTiposBoleta(
      [
        { tipoId: 't-ind', nombre: 'Individual' },
        { tipoId: 't-ind', nombre: 'Pareja' },
        { tipoId: 'inventado', nombre: 'VIP' },
      ],
      new Set(['t-ind']),
    );
    expect(tipos?.[0].tipoId).toBe('t-ind');
    expect(tipos?.[1].tipoId).not.toBe('t-ind');
    expect(tipos?.[2].tipoId).not.toBe('inventado');
  });

  it('conserva un tipoId con forma de UUID generado por el formulario, pero no uno repetido', () => {
    const idNuevo = '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b';
    const tipos = validarTiposBoleta([
      { tipoId: idNuevo, nombre: 'Individual' },
      { tipoId: idNuevo, nombre: 'Pareja' },
    ]);
    expect(tipos?.[0].tipoId).toBe(idNuevo);
    expect(tipos?.[1].tipoId).not.toBe(idNuevo);
  });

  it.each([
    ['vacío', []],
    ['no es arreglo', 'x'],
    ['nombre vacío', [{ nombre: '  ' }]],
    ['nombre con carácter de control', [{ nombre: 'Pa\u0000reja' }]],
    ['nombre demasiado largo', [{ nombre: 'x'.repeat(61) }]],
    ['nombres repetidos sin importar mayúsculas', [{ nombre: 'Pareja' }, { nombre: 'pareja' }]],
    ['personas = 0', [{ nombre: 'A', personas: 0 }]],
    ['personas = 11', [{ nombre: 'A', personas: 11 }]],
    ['personas decimal', [{ nombre: 'A', personas: 1.5 }]],
  ])('rechaza: %s', (_caso, valor) => {
    expect(validarTiposBoleta(valor)).toBeNull();
  });
});

describe('validarPreciosEtapa', () => {
  it('acepta el precio plano de un cliente anterior como el del primer tipo', () => {
    expect(validarPreciosEtapa({ precio: 45000 }, [individual, pareja])).toEqual([{ tipoId: 't-ind', precio: 45000 }]);
  });

  it('rechaza un tipo inexistente, repetido, un precio inválido o precios vacíos', () => {
    const tipos = [individual, pareja];
    expect(validarPreciosEtapa({ precios: [{ tipoId: 'x', precio: 1 }] }, tipos)).toBeNull();
    expect(
      validarPreciosEtapa({ precios: [{ tipoId: 't-ind', precio: 1 }, { tipoId: 't-ind', precio: 2 }] }, tipos),
    ).toBeNull();
    expect(validarPreciosEtapa({ precios: [{ tipoId: 't-ind', precio: -1 }] }, tipos)).toBeNull();
    expect(validarPreciosEtapa({ precios: [{ tipoId: 't-ind', precio: 1.5 }] }, tipos)).toBeNull();
    expect(validarPreciosEtapa({ precios: [] }, tipos)).toBeNull();
    expect(validarPreciosEtapa({}, tipos)).toBeNull();
  });
});

describe('tiposEnUso', () => {
  it('reúne los tipoId con precio en alguna etapa', () => {
    const enUso = tiposEnUso([{ precios: [{ tipoId: 'a', precio: 1 }] }, { precios: [{ tipoId: 'b', precio: 2 }] }]);
    expect([...enUso].sort()).toEqual(['a', 'b']);
  });
});
