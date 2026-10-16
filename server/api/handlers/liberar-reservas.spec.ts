import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const { liberarSillasMock, sendMock } = vi.hoisted(() => ({ liberarSillasMock: vi.fn(), sendMock: vi.fn() }));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

vi.mock('../services/aforo', async () => {
  const real = await vi.importActual<typeof import('../services/aforo')>('../services/aforo');
  return { ...real, liberarSillas: liberarSillasMock };
});

const { handler } = await import('./liberar-reservas');
const { SillasReservadasInsuficientesError } = await import('../services/aforo');

function registroRemove(
  estado: string,
  opciones: { eventoId?: string; cantidad?: number } = {},
): DynamoDBStreamEvent['Records'][number] {
  const eventoId = opciones.eventoId ?? 'evt-1';
  const cantidad = opciones.cantidad ?? 2;
  return {
    eventName: 'REMOVE',
    dynamodb: {
      OldImage: {
        compraId: { S: 'compra-1' },
        eventoId: { S: eventoId },
        cantidad: { N: String(cantidad) },
        estado: { S: estado },
      },
    },
  };
}

function evento(records: DynamoDBStreamEvent['Records']): DynamoDBStreamEvent {
  return { Records: records };
}

beforeEach(() => {
  liberarSillasMock.mockReset();
  sendMock.mockReset();
});

/** Mismo registro, pero borrado por el TTL de DynamoDB (`userIdentity` de servicio). */
function registroTtl(estado: string, extra: Record<string, { S: string } | { N: string }> = {}) {
  const registro = registroRemove(estado);
  return {
    ...registro,
    userIdentity: { type: 'Service', principalId: 'dynamodb.amazonaws.com' },
    dynamodb: {
      OldImage: {
        ...registro.dynamodb!.OldImage!,
        expiraEn: { N: '1792160120' },
        medioPago: { S: 'bold' },
        cliente: { M: { correo: { S: 'cliente@correo.com' } } },
        ...extra,
      },
    },
  } as DynamoDBStreamEvent['Records'][number];
}

describe('borrado por TTL (incidente del 16/10/2026)', () => {
  it('archiva la compra como expirada, sin expiraEn y con sus datos, y luego libera el aforo', async () => {
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockResolvedValueOnce(undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handler(evento([registroTtl('esperando_pago_bold')]), {} as never, () => {});

    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input.ConditionExpression).toBe('attribute_not_exists(compraId)');
    const item = comando.input.Item;
    expect(item.estado).toBe('expirada');
    expect(item.estadoAlExpirar).toBe('esperando_pago_bold');
    expect(item.expiraEn).toBeUndefined();
    expect(item.cliente).toEqual({ correo: 'cliente@correo.com' });
    expect(typeof item.archivadaPorTtlEn).toBe('string');
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    // Alerta en el log, solo con identificadores (nunca el correo del cliente).
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain('cliente@correo.com');
    errorSpy.mockRestore();
  });

  it('un registro duplicado del Stream no vuelve a liberar el aforo', async () => {
    const yaArchivada = Object.assign(new Error('condición'), { name: 'ConditionalCheckFailedException' });
    sendMock.mockRejectedValueOnce(yaArchivada);

    await handler(evento([registroTtl('esperando_comprobante')]), {} as never, () => {});

    expect(liberarSillasMock).not.toHaveBeenCalled();
  });

  it('archiva sin cambiar el estado una compra que ya no retenía aforo', async () => {
    sendMock.mockResolvedValueOnce({});

    await handler(evento([registroTtl('expirada')]), {} as never, () => {});

    expect(sendMock.mock.calls[0]?.[0].input.Item.estado).toBe('expirada');
    expect(sendMock.mock.calls[0]?.[0].input.Item.estadoAlExpirar).toBeUndefined();
    expect(liberarSillasMock).not.toHaveBeenCalled();
  });

  it('un error al archivar se propaga para que Lambda reintente el lote', async () => {
    sendMock.mockRejectedValueOnce(new Error('ProvisionedThroughputExceeded'));

    await expect(handler(evento([registroTtl('esperando_pago_bold')]), {} as never, () => {})).rejects.toThrow();
    expect(liberarSillasMock).not.toHaveBeenCalled();
  });

  it('un borrado hecho por la aplicación (no por TTL) no se archiva', async () => {
    liberarSillasMock.mockResolvedValueOnce(undefined);

    await handler(evento([registroRemove('esperando_comprobante')]), {} as never, () => {});

    expect(sendMock).not.toHaveBeenCalled();
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
  });
});

it('libera el aforo de una reserva vencida en estado iniciada', async () => {
  liberarSillasMock.mockResolvedValueOnce(undefined);

  await handler(evento([registroRemove('iniciada')]), {} as never, () => {});

  expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
});

// 'esperando_pago_bold' (roadmap #19, Sub-tarea 1) — una reserva de Bold
// también retiene aforo hasta que el webhook (o el TTL) la resuelva.
it.each(['esperando_comprobante', 'esperando_pago_bold', 'en_revision'])(
  'libera el aforo de una reserva vencida en estado %s',
  async (estado) => {
    liberarSillasMock.mockResolvedValueOnce(undefined);

    await handler(evento([registroRemove(estado)]), {} as never, () => {});

    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
  },
);

it('ignora eventos de Stream que no son REMOVE', async () => {
  const record = { ...registroRemove('iniciada'), eventName: 'MODIFY' as const };

  await handler(evento([record]), {} as never, () => {});

  expect(liberarSillasMock).not.toHaveBeenCalled();
});

it.each(['aprobada', 'rechazada', 'expirada'])(
  'ignora un REMOVE cuyo estado previo (%s) ya no retenía aforo',
  async (estado) => {
    await handler(evento([registroRemove(estado)]), {} as never, () => {});

    expect(liberarSillasMock).not.toHaveBeenCalled();
  },
);

it('ignora un registro sin OldImage', async () => {
  await handler(evento([{ eventName: 'REMOVE', dynamodb: {} }]), {} as never, () => {});

  expect(liberarSillasMock).not.toHaveBeenCalled();
});

it('ignora silenciosamente un registro de Stream duplicado (idempotencia at-least-once)', async () => {
  liberarSillasMock.mockRejectedValueOnce(new SillasReservadasInsuficientesError());

  await expect(
    handler(evento([registroRemove('en_revision')]), {} as never, () => {}),
  ).resolves.toBeUndefined();
});

it('relanza errores reales que no son de duplicado', async () => {
  liberarSillasMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

  await expect(
    handler(evento([registroRemove('esperando_comprobante')]), {} as never, () => {}),
  ).rejects.toThrow('DynamoDB no disponible');
});

it('procesa varios registros del mismo lote de forma independiente', async () => {
  liberarSillasMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

  await handler(
    evento([
      registroRemove('iniciada', { eventoId: 'evt-1', cantidad: 1 }),
      registroRemove('en_revision', { eventoId: 'evt-2', cantidad: 3 }),
    ]),
    {} as never,
    () => {},
  );

  expect(liberarSillasMock).toHaveBeenNthCalledWith(1, 'evt-1', 1);
  expect(liberarSillasMock).toHaveBeenNthCalledWith(2, 'evt-2', 3);
});
