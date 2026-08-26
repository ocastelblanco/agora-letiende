import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    sendMock.mockResolvedValueOnce({ Items: [] }); // 2. liberarReservasVencidas: sin vencidas (esperando_comprobante)
    sendMock.mockResolvedValueOnce({ Items: [] }); // 3. sin vencidas (esperando_pago_bold, roadmap #19)
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 4. reintento, sigue fallando
    sendMock.mockResolvedValueOnce({ Item: { estado: 'borrador', sillasDisponibles: 10 } }); // 5. clasificación

    await expect(reservarSillas('evt-1', 3)).rejects.toBeInstanceOf(EventoNoPublicadoError);
  });

  it('propaga AforoInsuficienteError con las sillas disponibles reales cuando no hay reservas vencidas que liberar', async () => {
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Items: [] });
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
    sendMock.mockResolvedValueOnce({ Items: [] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    await expect(reservarSillas('evt-1', 3)).rejects.toBeInstanceOf(ErrorAforo);
  });

  describe('liberación activa de reservas vencidas (hotfix pre-producción, 14/08/2026 — SLA de 15 minutos, nunca depender solo del TTL)', () => {
    it('cuando la reserva inicial falla, busca reservas vencidas de ese evento (esperando_comprobante) antes de clasificar el fallo', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial
      sendMock.mockResolvedValueOnce({ Items: [] }); // 2. Query de vencidas (esperando_comprobante)
      sendMock.mockResolvedValueOnce({ Items: [] }); // 3. Query de vencidas (esperando_pago_bold)
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 4. reintento
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // 5. clasificación

      await reservarSillas('evt-1', 1).catch(() => {});

      const comandoQuery = sendMock.mock.calls[1]?.[0];
      expect(comandoQuery.input).toMatchObject({
        TableName: 'agora-compras-test',
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :estado AND expiraEn < :ahora',
        ExpressionAttributeValues: expect.objectContaining({
          ':eventoId': 'evt-1',
          ':estado': 'esperando_comprobante',
        }),
      });
    });

    it('libera una reserva vencida real y el reintento de reservarSillas tiene éxito', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial falla
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'c-vencida', eventoId: 'evt-1', cantidad: 2, estado: 'esperando_comprobante' }],
      }); // 2. Query encuentra una vencida (esperando_comprobante)
      sendMock.mockResolvedValueOnce({}); // 3. marca c-vencida como expirada
      sendMock.mockResolvedValueOnce({}); // 4. liberarSillas(evt-1, 2)
      sendMock.mockResolvedValueOnce({ Items: [] }); // 5. Query de vencidas (esperando_pago_bold): ninguna
      sendMock.mockResolvedValueOnce({}); // 6. reintento de la reserva original, ahora con aforo libre

      await reservarSillas('evt-1', 1);

      expect(sendMock).toHaveBeenCalledTimes(6);
      const comandoExpira = sendMock.mock.calls[2]?.[0];
      expect(comandoExpira.input).toMatchObject({
        TableName: 'agora-compras-test',
        Key: { compraId: 'c-vencida' },
        UpdateExpression: 'SET estado = :expirada',
        ConditionExpression: 'estado = :estadoOrigen',
        ExpressionAttributeValues: { ':expirada': 'expirada', ':estadoOrigen': 'esperando_comprobante' },
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
      sendMock.mockResolvedValueOnce({ Items: [] }); // 4. Query de vencidas (esperando_pago_bold): ninguna
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 5. reintento sigue sin aforo
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // 6. clasificación

      const error = await reservarSillas('evt-1', 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AforoInsuficienteError);
      expect(sendMock).toHaveBeenCalledTimes(6); // nunca llama liberarSillas para esta compra
    });
  });

  // Bold (roadmap #19, Sub-tarea 1, decisión 4 del plan) — reconciliación de
  // respaldo antes de expirar una reserva esperando_pago_bold.
  describe('liberación activa de reservas vencidas — Bold (roadmap #19, decisión 4 del plan)', () => {
    const fetchOriginal = globalThis.fetch;
    const fetchMock = vi.fn();

    beforeEach(() => {
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      fetchMock.mockReset();
      process.env['BOLD_LLAVE_IDENTIDAD'] = 'llave-identidad-test';
    });

    afterEach(() => {
      globalThis.fetch = fetchOriginal;
    });

    it('consulta el endpoint de reconciliación por la referencia externa (compraId) — el bloqueo del payment_id no aplica: is_external_reference=true lo evita', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial
      sendMock.mockResolvedValueOnce({ Items: [] }); // 2. esperando_comprobante: ninguna
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'compra-bold-1', eventoId: 'evt-1', cantidad: 1, estado: 'esperando_pago_bold' }],
      }); // 3. esperando_pago_bold: una vencida
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [] }) });
      sendMock.mockResolvedValueOnce({}); // 4. marca expirada
      sendMock.mockResolvedValueOnce({}); // 5. liberarSillas
      sendMock.mockResolvedValueOnce({}); // 6. reintento exitoso

      await reservarSillas('evt-1', 1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opciones] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(url).toContain('/payments/webhook/notifications/compra-bold-1');
      expect(url).toContain('is_external_reference=true');
      expect(opciones.headers['Authorization']).toBe('x-api-key llave-identidad-test');
    });

    it('NO expira una reserva esperando_pago_bold si la reconciliación encuentra un SALE_APPROVED (evita perder una venta real)', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 1. intento inicial
      sendMock.mockResolvedValueOnce({ Items: [] }); // 2. esperando_comprobante: ninguna
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'compra-bold-1', eventoId: 'evt-1', cantidad: 1, estado: 'esperando_pago_bold' }],
      }); // 3. esperando_pago_bold: una vencida
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [{ type: 'SALE_APPROVED' }] }) });
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // 4. reintento (todavía sin aforo)
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // 5. clasificación

      const error = await reservarSillas('evt-1', 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AforoInsuficienteError);
      // Nunca marca expirada ni libera sillas para esta compra: solo el
      // intento inicial + 2 queries + reintento + clasificación = 5.
      expect(sendMock).toHaveBeenCalledTimes(5);
    });

    it('expira normalmente si la reconciliación confirma que no hay un SALE_APPROVED', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
      sendMock.mockResolvedValueOnce({ Items: [] });
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'compra-bold-1', eventoId: 'evt-1', cantidad: 3, estado: 'esperando_pago_bold' }],
      });
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [{ type: 'SALE_REJECTED' }] }) });
      sendMock.mockResolvedValueOnce({}); // marca expirada
      sendMock.mockResolvedValueOnce({}); // liberarSillas
      sendMock.mockResolvedValueOnce({}); // reintento exitoso

      await reservarSillas('evt-1', 1);

      const comandoExpira = sendMock.mock.calls[3]?.[0];
      expect(comandoExpira.input).toMatchObject({
        Key: { compraId: 'compra-bold-1' },
        ConditionExpression: 'estado = :estadoOrigen',
        ExpressionAttributeValues: { ':expirada': 'expirada', ':estadoOrigen': 'esperando_pago_bold' },
      });
      const comandoLibera = sendMock.mock.calls[4]?.[0];
      expect(comandoLibera.input).toMatchObject({ ExpressionAttributeValues: { ':n': 3 } });
    });

    it('NO expira (conservador) si la consulta de reconciliación falla — nunca arriesga una venta real por un fallo de red transitorio', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
      sendMock.mockResolvedValueOnce({ Items: [] });
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'compra-bold-1', eventoId: 'evt-1', cantidad: 1, estado: 'esperando_pago_bold' }],
      });
      fetchMock.mockRejectedValueOnce(new Error('Bold no disponible'));
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException()); // reintento
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } }); // clasificación

      const error = await reservarSillas('evt-1', 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AforoInsuficienteError);
      expect(sendMock).toHaveBeenCalledTimes(5);
    });

    it('NO expira (conservador) si Bold responde con un status distinto de 2xx', async () => {
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
      sendMock.mockResolvedValueOnce({ Items: [] });
      sendMock.mockResolvedValueOnce({
        Items: [{ compraId: 'compra-bold-1', eventoId: 'evt-1', cantidad: 1, estado: 'esperando_pago_bold' }],
      });
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
      sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
      sendMock.mockResolvedValueOnce({ Item: { estado: 'publicado', sillasDisponibles: 0 } });

      const error = await reservarSillas('evt-1', 1).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AforoInsuficienteError);
      expect(sendMock).toHaveBeenCalledTimes(5);
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
