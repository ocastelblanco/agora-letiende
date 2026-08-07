import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const { liberarSillasMock } = vi.hoisted(() => ({ liberarSillasMock: vi.fn() }));

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
});

it('libera el aforo de una reserva vencida en estado iniciada', async () => {
  liberarSillasMock.mockResolvedValueOnce(undefined);

  await handler(evento([registroRemove('iniciada')]), {} as never, () => {});

  expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
});

it.each(['esperando_comprobante', 'en_revision'])(
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
