import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('./dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const { ejecutarIdempotente } = await import('./idempotencia');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const CLAVE = '3f0c9f4e-5b1a-4c2e-9d7a-1a2b3c4d5e6f';

function crearEvento(opciones: { clave?: string; body?: string } = {}): APIGatewayProxyEventV2 {
  return {
    headers: opciones.clave ? { 'idempotency-key': opciones.clave } : {},
    body: opciones.body ?? '{"cantidad":2}',
  } as unknown as APIGatewayProxyEventV2;
}

const respuestaOk = { statusCode: 201, body: '{"compraId":"c-1"}' };

beforeEach(() => {
  sendMock.mockReset();
  process.env['TABLA_IDEMPOTENCIA'] = 'agora-idempotencia-test';
});

describe('ejecutarIdempotente', () => {
  it('sin encabezado ejecuta la operación sin tocar la tabla (retrocompatible)', async () => {
    const accion = vi.fn().mockResolvedValue(respuestaOk);

    const respuesta = await ejecutarIdempotente(crearEvento(), 'crear-compra', 'publico', accion);

    expect(respuesta).toBe(respuestaOk);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rechaza con 400 una clave que no es UUID v4 sin ejecutar nada', async () => {
    const accion = vi.fn();

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: 'abc' }), 'crear-compra', 'publico', accion);

    expect(respuesta).toMatchObject({ statusCode: 400 });
    expect(accion).not.toHaveBeenCalled();
  });

  it('primera vez: reclama la clave con escritura condicional, ejecuta y guarda la respuesta', async () => {
    sendMock.mockResolvedValue({});
    const accion = vi.fn().mockResolvedValue(respuestaOk);

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(respuesta).toBe(respuestaOk);
    expect(accion).toHaveBeenCalledTimes(1);
    const reclamo = sendMock.mock.calls[0]?.[0].input;
    expect(reclamo.ConditionExpression).toBe('attribute_not_exists(idempotenciaId)');
    expect(reclamo.Item.estado).toBe('en_proceso');
    expect(reclamo.Item.idempotenciaId).not.toContain(CLAVE);
    const cierre = sendMock.mock.calls[1]?.[0].input;
    expect(cierre.ExpressionAttributeValues[':completada']).toBe('completada');
    expect(cierre.ExpressionAttributeValues[':respuesta']).toBe(respuestaOk.body);
  });

  it('reintento con la misma clave y cuerpo devuelve la respuesta guardada sin ejecutar de nuevo', async () => {
    let cuerpoHash = '';
    sendMock.mockImplementationOnce(async (comando) => {
      cuerpoHash = comando.input.Item.cuerpoHash;
      return {};
    });
    sendMock.mockResolvedValueOnce({});
    await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', async () => respuestaOk);

    sendMock.mockReset();
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({
      Item: { cuerpoHash, estado: 'completada', statusCode: 201, respuesta: respuestaOk.body },
    });
    const accion = vi.fn();

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(accion).not.toHaveBeenCalled();
    expect(respuesta).toMatchObject({ statusCode: 201, body: respuestaOk.body });
    expect((respuesta as { headers: Record<string, string> }).headers['Idempotent-Replayed']).toBe('true');
  });

  it('misma clave con cuerpo distinto responde 409 y no ejecuta', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Item: { cuerpoHash: 'otro', estado: 'completada', statusCode: 201, respuesta: '{}' } });
    const accion = vi.fn();

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(respuesta).toMatchObject({ statusCode: 409 });
    expect(accion).not.toHaveBeenCalled();
  });

  it('misma clave todavía en proceso responde 409 con Retry-After y no ejecuta', async () => {
    let cuerpoHash = '';
    sendMock.mockImplementationOnce(async (comando) => {
      cuerpoHash = comando.input.Item.cuerpoHash;
      throw new ConditionalCheckFailedException();
    });
    sendMock.mockImplementationOnce(async () => ({
      Item: { cuerpoHash, estado: 'en_proceso', iniciadaEn: Math.floor(Date.now() / 1000) },
    }));
    const accion = vi.fn();

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(respuesta).toMatchObject({ statusCode: 409, headers: { 'Retry-After': '5' } });
    expect(accion).not.toHaveBeenCalled();
  });

  it('retoma con actualización condicional una reclamación en proceso ya vencida', async () => {
    let cuerpoHash = '';
    sendMock.mockImplementationOnce(async (comando) => {
      cuerpoHash = comando.input.Item.cuerpoHash;
      throw new ConditionalCheckFailedException();
    });
    sendMock.mockImplementationOnce(async () => ({
      Item: { cuerpoHash, estado: 'en_proceso', iniciadaEn: Math.floor(Date.now() / 1000) - 600 },
    }));
    sendMock.mockResolvedValue({});
    const accion = vi.fn().mockResolvedValue(respuestaOk);

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(accion).toHaveBeenCalledTimes(1);
    expect(respuesta).toBe(respuestaOk);
    expect(sendMock.mock.calls[2]?.[0].input.ConditionExpression).toContain('iniciadaEn = :vista');
  });

  it('si el retomado pierde la carrera, responde 409 sin ejecutar', async () => {
    let cuerpoHash = '';
    sendMock.mockImplementationOnce(async (comando) => {
      cuerpoHash = comando.input.Item.cuerpoHash;
      throw new ConditionalCheckFailedException();
    });
    sendMock.mockImplementationOnce(async () => ({
      Item: { cuerpoHash, estado: 'en_proceso', iniciadaEn: 1 },
    }));
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    const accion = vi.fn();

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion);

    expect(respuesta).toMatchObject({ statusCode: 409 });
    expect(accion).not.toHaveBeenCalled();
  });

  it('una respuesta no 2xx libera la clave en vez de guardarla', async () => {
    sendMock.mockResolvedValue({});
    const rechazo = { statusCode: 409, body: '{"mensaje":"sin aforo"}' };

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', async () => rechazo);

    expect(respuesta).toBe(rechazo);
    expect(sendMock.mock.calls[1]?.[0].constructor.name).toBe('DeleteCommand');
  });

  it('si la operación lanza, libera la clave y propaga el error', async () => {
    sendMock.mockResolvedValue({});

    await expect(
      ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', async () => {
        throw new Error('falla');
      }),
    ).rejects.toThrow('falla');
    expect(sendMock.mock.calls[1]?.[0].constructor.name).toBe('DeleteCommand');
  });

  it('si no puede guardar la respuesta, igual devuelve la respuesta real', async () => {
    sendMock.mockResolvedValueOnce({});
    sendMock.mockRejectedValueOnce(new Error('throttled'));

    const respuesta = await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', async () => respuestaOk);

    expect(respuesta).toBe(respuestaOk);
  });

  it('el actor y la operación entran en el identificador: la misma clave no se cruza', async () => {
    sendMock.mockResolvedValue({});
    await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'venta-efectivo', 'a@x.co', async () => respuestaOk);
    await ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'venta-efectivo', 'b@x.co', async () => respuestaOk);

    const idA = sendMock.mock.calls[0]?.[0].input.Item.idempotenciaId;
    const idB = sendMock.mock.calls[2]?.[0].input.Item.idempotenciaId;
    expect(idA).not.toBe(idB);
  });

  it('dos peticiones concurrentes con la misma clave ejecutan la operación una sola vez', async () => {
    const reclamados = new Set<string>();
    let cuerpoHash = '';
    sendMock.mockImplementation(async (comando) => {
      const nombre = comando.constructor.name;
      if (nombre === 'PutCommand') {
        const id = comando.input.Item.idempotenciaId as string;
        if (reclamados.has(id)) throw new ConditionalCheckFailedException();
        reclamados.add(id);
        cuerpoHash = comando.input.Item.cuerpoHash;
        return {};
      }
      if (nombre === 'GetCommand') {
        return { Item: { cuerpoHash, estado: 'en_proceso', iniciadaEn: Math.floor(Date.now() / 1000) } };
      }
      return {};
    });
    const accion = vi.fn(async () => respuestaOk);

    const [a, b] = await Promise.all([
      ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion),
      ejecutarIdempotente(crearEvento({ clave: CLAVE }), 'crear-compra', 'publico', accion),
    ]);

    expect(accion).toHaveBeenCalledTimes(1);
    expect([a, b].filter((r) => (r as { statusCode: number }).statusCode === 409)).toHaveLength(1);
  });
});
