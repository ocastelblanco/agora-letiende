import { beforeEach, describe, expect, it, vi } from 'vitest';
import { estadoEfectivo, finalizarSiVencido, haFinalizadoPorVigencia } from './vigencia-evento';

const sendMock = vi.fn();

vi.mock('../services/dynamodb', () => ({
  documentoDynamoDB: { send: (...args: unknown[]) => sendMock(...args) },
}));

const AHORA = new Date('2026-08-20T12:00:00.000Z');

function evento(fechaHora: string, cierraEnEtapas: string[]) {
  return { fechaHora, etapas: cierraEnEtapas.map((cierraEn) => ({ cierraEn })) };
}

describe('haFinalizadoPorVigencia', () => {
  it('no ha finalizado si la fecha del evento todavía no pasó, aunque la etapa ya cerró', () => {
    const e = evento('2026-08-21T00:00:00.000Z', ['2026-08-15T00:00:00.000Z']);
    expect(haFinalizadoPorVigencia(e, AHORA)).toBe(false);
  });

  it('no ha finalizado si la última etapa todavía no cerró, aunque la fecha del evento ya pasó', () => {
    const e = evento('2026-08-10T00:00:00.000Z', ['2026-08-25T00:00:00.000Z']);
    expect(haFinalizadoPorVigencia(e, AHORA)).toBe(false);
  });

  it('ha finalizado cuando tanto la fecha como el cierre de la última etapa ya pasaron', () => {
    const e = evento('2026-08-10T00:00:00.000Z', ['2026-08-05T00:00:00.000Z', '2026-08-09T00:00:00.000Z']);
    expect(haFinalizadoPorVigencia(e, AHORA)).toBe(true);
  });

  it('usa la etapa que cierra más tarde, no la primera del arreglo', () => {
    const e = evento('2026-08-01T00:00:00.000Z', ['2026-08-25T00:00:00.000Z', '2026-08-02T00:00:00.000Z']);
    expect(haFinalizadoPorVigencia(e, AHORA)).toBe(false);
  });
});

describe('estadoEfectivo', () => {
  it('devuelve finalizado para un publicado cuya vigencia ya terminó', () => {
    const e = { ...evento('2026-08-01T00:00:00.000Z', ['2026-08-01T00:00:00.000Z']), estado: 'publicado' };
    expect(estadoEfectivo(e, AHORA)).toBe('finalizado');
  });

  it('devuelve finalizado para un agotado cuya vigencia ya terminó', () => {
    const e = { ...evento('2026-08-01T00:00:00.000Z', ['2026-08-01T00:00:00.000Z']), estado: 'agotado' };
    expect(estadoEfectivo(e, AHORA)).toBe('finalizado');
  });

  it('devuelve finalizado para un cancelado cuya vigencia ya terminó', () => {
    const e = { ...evento('2026-08-01T00:00:00.000Z', ['2026-08-01T00:00:00.000Z']), estado: 'cancelado' };
    expect(estadoEfectivo(e, AHORA)).toBe('finalizado');
  });

  it('preserva cancelado mientras todavía está vigente (hotfix 3)', () => {
    const e = { ...evento('2026-09-01T00:00:00.000Z', ['2026-08-30T00:00:00.000Z']), estado: 'cancelado' };
    expect(estadoEfectivo(e, AHORA)).toBe('cancelado');
  });

  it('preserva publicado mientras todavía está vigente', () => {
    const e = { ...evento('2026-09-01T00:00:00.000Z', ['2026-08-30T00:00:00.000Z']), estado: 'publicado' };
    expect(estadoEfectivo(e, AHORA)).toBe('publicado');
  });

  it('nunca cambia un borrador (nunca fue público, la vigencia no aplica)', () => {
    const e = { ...evento('2020-01-01T00:00:00.000Z', ['2020-01-01T00:00:00.000Z']), estado: 'borrador' };
    expect(estadoEfectivo(e, AHORA)).toBe('borrador');
  });

  it('nunca revive un finalizado ya persistido', () => {
    const e = { ...evento('2020-01-01T00:00:00.000Z', ['2020-01-01T00:00:00.000Z']), estado: 'finalizado' };
    expect(estadoEfectivo(e, AHORA)).toBe('finalizado');
  });
});

describe('finalizarSiVencido', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('envía un UpdateCommand condicional sobre el estado leído', async () => {
    sendMock.mockResolvedValue({});
    await finalizarSiVencido('agora-eventos-test', 'e1', 'publicado');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const comando = sendMock.mock.calls[0][0];
    expect(comando.input.TableName).toBe('agora-eventos-test');
    expect(comando.input.Key).toEqual({ eventoId: 'e1' });
    expect(comando.input.ConditionExpression).toBe('estado = :estadoActual');
    expect(comando.input.ExpressionAttributeValues).toEqual({
      ':finalizado': 'finalizado',
      ':estadoActual': 'publicado',
    });
  });

  it('nunca lanza si la escritura falla (best-effort)', async () => {
    sendMock.mockRejectedValue(new Error('ConditionalCheckFailedException'));
    await expect(finalizarSiVencido('agora-eventos-test', 'e1', 'publicado')).resolves.toBeUndefined();
  });
});
