import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('./dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const { emitirBoletas } = await import('./boleteria');

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
  process.env['TABLA_BOLETAS'] = 'agora-boletas-test';
});

describe('emitirBoletas', () => {
  it('crea exactamente `cantidad` boletas', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 3,
    });

    expect(boletas).toHaveLength(3);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('cada boleta tiene un boletaId UUID v4 distinto', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 2,
    });

    expect(boletas[0]?.boletaId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(boletas[0]?.boletaId).not.toBe(boletas[1]?.boletaId);
  });

  it('numera las boletas de 1 a cantidad, en orden', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 3,
    });

    expect(boletas.map((b) => b.numeroEnCompra)).toEqual([1, 2, 3]);
  });

  it('deriva valorUnitario de montoTotal / cantidad', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 2,
    });

    expect(boletas.every((b) => b.valorUnitario === 45000)).toBe(true);
  });

  it('cada boleta queda con estado valida y eventoId/compraId/etapaId propagados', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 45000,
      cantidad: 1,
    });

    expect(boletas[0]).toMatchObject({
      eventoId: 'evt-1',
      compraId: 'compra-1',
      etapaId: 'et-1',
      estado: 'valida',
    });
    expect(typeof boletas[0]?.emitidaEn).toBe('string');
  });

  // v2, roadmap #24 — un evento sin etapas no tiene etapaId que propagar.
  it('acepta etapaId ausente (evento sin etapas) y lo deja ausente en cada boleta', async () => {
    const boletas = await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      montoTotal: 0,
      cantidad: 2,
    });

    expect(boletas).toHaveLength(2);
    expect(boletas.every((b) => b.etapaId === undefined)).toBe(true);
    expect(boletas.every((b) => b.valorUnitario === 0)).toBe(true);
  });

  it('escribe cada boleta con ConditionExpression attribute_not_exists(boletaId)', async () => {
    await emitirBoletas({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 45000,
      cantidad: 1,
    });

    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      TableName: 'agora-boletas-test',
      ConditionExpression: 'attribute_not_exists(boletaId)',
    });
  });
});
