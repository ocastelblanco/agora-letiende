import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('./dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const {
  reservarSillas,
  confirmarSillas,
  liberarSillas,
  ErrorAforo,
  EventoNoPublicadoError,
  AforoInsuficienteError,
  SillasReservadasInsuficientesError,
} = await import('./aforo');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

beforeEach(() => {
  sendMock.mockReset();
  process.env['TABLA_EVENTOS'] = 'agora-eventos-test';
  process.env['TABLA_COMPRAS'] = 'agora-compras-test';
});

describe('reservarSillas', () => {
  it('envía una única escritura condicional que resta disponibles y suma reservadas', async () => {
    sendMock.mockResolvedValueOnce({});

    await reservarSillas('evt-1', 3);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      TableName: 'agora-eventos-test',
      Key: { eventoId: 'evt-1' },
      UpdateExpression:
        'SET sillasDisponibles = sillasDisponibles - :n, sillasReservadas = sillasReservadas + :n',
      ConditionExpression: 'sillasDisponibles >= :n AND estado = :publicado',
      ExpressionAttributeValues: { ':n': 3, ':publicado': 'publicado' },
    });
  });

  it('propaga EventoNoPublicadoError cuando el evento no está publicado', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial
    sendMock.mockResolvedValueOnce({ Items: [] }); // 2. liberarReservasVencidas: sin vencidas
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 3. reintento, sigue fallando
    sendMock.mockResolvedValueOnce({ Item: { estado: 'borrador', sillasDisponibles: 10 } }); // 4. clasificación

    await expect(reservarSillas('evt-1', 3)).rejects.toBeInstanceOf(EventoNoPublicadoError);
  });

  it('propaga AforoInsuficienteError con las sillas disponibles reales cuando no hay reservas vencidas que liberar', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Items: [] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 2 } });

    const error = await reservarSillas('evt-1', 5).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AforoInsuficienteError);
    expect((error as InstanceType<typeof AforoInsuficienteError>).sillasDisponibles).toBe(2);
  });

  it('propaga un ErrorAforo genérico si la lectura de clasificación también falla', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Items: [] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    await expect(reservarSillas('evt-1', 3)).rejects.toBeInstanceOf(ErrorAforo);
  });

  describe('liberación activa de reservas vencidas (hotfix pre-producción, 14/08/2026 — SLA de 15 minutos, nunca depender solo del TTL)', () => {
    it('cuando la reserva inicial falla, busca reservas vencidas de ese evento antes de clasificar el fallo', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial
      sendMock.mockResolvedValueOnce({ Items: [] }); // 2. Query de vencidas
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 3. reintento
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // 4. clasificación

      await reservarSillas('evt-1', 1).catch(() => {});

      const comandoQuery = sendMock.mock.calls[1]?.[0];
      expect(comandoQuery.input).toMatchObject({
        TableName: 'agora-compras-test',
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :esperando AND expiraEn < :ahora',
        ExpressionAttributeValues: expect.objectContaining({
          ':eventoId': 'evt-1',
          ':esperando': 'esperando_comprobante',
        }),
      });
    });

    it('libera una reserva vencida real y el reintento de reservarSillas tiene éxito', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial falla
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'c-vencida', eventoId: 'evt-1', cantidad: 2, estado: 'esperando_comprobante' }],
      }); // 2. Query encuentra una vencida
      sendMock.mockResolvedValueOnce({}); // 3. marca c-vencida como expirada
      sendMock.mockResolvedValueOnce({}); // 4. liberarSillas(evt-1, 2)
      sendMock.mockResolvedValueOnce({}); // 5. reintento de la reserva original, ahora con aforo libre

      await reservarSillas('evt-1', 1);

      expect(sendMock).toHaveBeenCalledTimes(5);
      const comandoExpira = sendMock.mock.calls[2]?.[0];
      expect(comandoExpira.input).toMatchObject({
        TableName: 'agora-compras-test',
        Key: { compraId: 'c-vencida' },
        UpdateExpression: 'SET estado = :expirada',
        ConditionExpression: 'estado = :esperando',
        ExpressionAttributeValues: { ':expirada': 'expirada', ':esperando': 'esperando_comprobante' },
      });
      const comandoLibera = sendMock.mock.calls[3]?.[0];
      expect(comandoLibera.input).toMatchObject({
        TableName: 'agora-eventos-test',
        Key: { eventoId: 'evt-1' },
        UpdateExpression:
          'SET sillasDisponibles = sillasDisponibles + :n, sillasReservadas = sillasReservadas - :n',
        ExpressionAttributeValues: { ':n': 2 },
      });
    });

    it('si otra reserva ya reclamó la vencida primero (condición fallida al marcarla expirada), la ignora y sigue con las demás sin lanzar error', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial falla
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'c-ya-reclamada', eventoId: 'evt-1', cantidad: 1, estado: 'esperando_comprobante' }],
      }); // 2. Query
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 3. alguien más ya la marcó expirada
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 4. reintento sigue sin aforo
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // 5. clasificación

      const error = await reservarSillas('evt-1', 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AforoInsuficienteError);
      expect(sendMock).toHaveBeenCalledTimes(5); // nunca llama liberarSillas para esta compra
    });
  });

  it('nunca lee el evento antes de intentar la escritura condicional', async () => {
    sendMock.mockResolvedValueOnce({});

    await reservarSillas('evt-1', 3);

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('relanza errores que no son de condición fallida', async () => {
    sendMock.mockRejectedValueOnce(new Error('Fallo de red'));

    await expect(reservarSillas('evt-1', 3)).rejects.toThrow('Fallo de red');
  });
});

describe('confirmarSillas', () => {
  it('decrementa sillasReservadas y no falla si el intento de agotar no aplica', async () => {
    sendMock.mockResolvedValueOnce({});
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    await confirmarSillas('evt-1', 2);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const primerComando = sendMock.mock.calls[0]?.[0];
    expect(primerComando.input).toMatchObject({
      UpdateExpression: 'SET sillasReservadas = sillasReservadas - :n',
      ConditionExpression: 'sillasReservadas >= :n',
      ExpressionAttributeValues: { ':n': 2 },
    });
  });

  it('transiciona el evento a agotado cuando la segunda condición aplica', async () => {
    sendMock.mockResolvedValueOnce({});
    sendMock.mockResolvedValueOnce({});

    await confirmarSillas('evt-1', 2);

    const segundoComando = sendMock.mock.calls[1]?.[0];
    expect(segundoComando.input).toMatchObject({
      UpdateExpression: 'SET estado = :agotado',
      ConditionExpression: 'sillasDisponibles = :cero AND estado = :publicado',
      ExpressionAttributeValues: { ':agotado': 'agotado', ':cero': 0, ':publicado': 'publicado' },
    });
  });

  it('propaga SillasReservadasInsuficientesError y no intenta la segunda escritura', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    await expect(confirmarSillas('evt-1', 2)).rejects.toBeInstanceOf(
      SillasReservadasInsuficientesError,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('relanza errores reales de la segunda escritura (no de condición fallida)', async () => {
    sendMock.mockResolvedValueOnce({});
    sendMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    await expect(confirmarSillas('evt-1', 2)).rejects.toThrow('DynamoDB no disponible');
  });
});

describe('liberarSillas', () => {
  it('devuelve el aforo con la escritura condicional correcta', async () => {
    sendMock.mockResolvedValueOnce({});

    await liberarSillas('evt-1', 4);

    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      UpdateExpression:
        'SET sillasDisponibles = sillasDisponibles + :n, sillasReservadas = sillasReservadas - :n',
      ConditionExpression: 'sillasReservadas >= :n',
      ExpressionAttributeValues: { ':n': 4 },
    });
  });

  it('es segura ante un mismo registro de Stream entregado dos veces: la segunda falla', async () => {
    sendMock.mockResolvedValueOnce({});
    await liberarSillas('evt-1', 4);

    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    await expect(liberarSillas('evt-1', 4)).rejects.toBeInstanceOf(
      SillasReservadasInsuficientesError,
    );
  });

  it('relanza errores que no son de condición fallida', async () => {
    sendMock.mockRejectedValueOnce(new Error('Fallo de red'));

    await expect(liberarSillas('evt-1', 4)).rejects.toThrow('Fallo de red');
  });
});
