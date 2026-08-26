import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMock,
  verificarFirmaWebhookMock,
  confirmarSillasMock,
  liberarSillasMock,
  emitirBoletasMock,
  firmarCodigoBoletaMock,
  enviarMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  verificarFirmaWebhookMock: vi.fn(),
  confirmarSillasMock: vi.fn(),
  liberarSillasMock: vi.fn(),
  emitirBoletasMock: vi.fn(),
  firmarCodigoBoletaMock: vi.fn(),
  enviarMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../services/bold', () => ({ verificarFirmaWebhook: verificarFirmaWebhookMock }));
vi.mock('../lib/firma-boletas', () => ({ firmarCodigoBoleta: firmarCodigoBoletaMock }));
vi.mock('../services/boleteria', () => ({ emitirBoletas: emitirBoletasMock }));
vi.mock('../services/notificaciones', () => ({
  CanalCorreoSes: vi.fn().mockImplementation(function (this: { enviar: typeof enviarMock }) {
    this.enviar = enviarMock;
  }),
}));
// aforo.ts sí se importa real (no se mockea el módulo completo) para poder
// lanzar sus clases de error reales — solo confirmarSillas/liberarSillas se
// reemplazan, mismo criterio que aprobaciones.spec.ts.
vi.mock('../services/aforo', async () => {
  const real = await vi.importActual<typeof import('../services/aforo')>('../services/aforo');
  return { ...real, confirmarSillas: confirmarSillasMock, liberarSillas: liberarSillasMock };
});

const { handler } = await import('./bold-webhook');
const { ErrorAforo } = await import('../services/aforo');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const compraEsperandoPago = {
  compraId: 'compra-1',
  eventoId: 'evt-1',
  etapaId: 'et-1',
  cantidad: 2,
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
  montoTotal: 90000,
  estado: 'esperando_pago_bold',
};

const boletasEmitidas = [
  { boletaId: 'bol-1', eventoId: 'evt-1', compraId: 'compra-1', numeroEnCompra: 1, etapaId: 'et-1', valorUnitario: 45000, estado: 'valida' as const, emitidaEn: '2026-08-25T00:00:00.000Z' },
  { boletaId: 'bol-2', eventoId: 'evt-1', compraId: 'compra-1', numeroEnCompra: 2, etapaId: 'et-1', valorUnitario: 45000, estado: 'valida' as const, emitidaEn: '2026-08-25T00:00:00.000Z' },
];

function crearPeticion(opciones: {
  metodo?: string;
  cuerpo?: unknown;
  cuerpoCrudo?: string;
  firma?: string;
  isBase64Encoded?: boolean;
} = {}): Parameters<typeof handler>[0] {
  const cuerpoCrudo = opciones.cuerpoCrudo ?? (opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined);
  return {
    requestContext: { http: { method: opciones.metodo ?? 'POST' } },
    rawPath: '/api/pagos/bold/webhook',
    body: cuerpoCrudo,
    isBase64Encoded: opciones.isBase64Encoded ?? false,
    headers: opciones.firma !== undefined ? { 'x-bold-signature': opciones.firma } : {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(opciones?: Parameters<typeof crearPeticion>[0]) {
  const respuesta = await handler(crearPeticion(opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
  sendMock.mockReset();
  verificarFirmaWebhookMock.mockReset();
  confirmarSillasMock.mockReset();
  liberarSillasMock.mockReset();
  emitirBoletasMock.mockReset();
  firmarCodigoBoletaMock.mockReset();
  enviarMock.mockReset();
  verificarFirmaWebhookMock.mockReturnValue(true);
  confirmarSillasMock.mockResolvedValue(undefined);
  liberarSillasMock.mockResolvedValue(undefined);
  emitirBoletasMock.mockResolvedValue(boletasEmitidas);
  firmarCodigoBoletaMock.mockReturnValue('firma-simulada');
  enviarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/pagos/bold/webhook — firma', () => {
  it('responde 401 sin tocar DynamoDB si la firma es inválida', async () => {
    verificarFirmaWebhookMock.mockReturnValue(false);

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-incorrecta',
    });

    expect(respuesta.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 401 sin tocar DynamoDB si no llega el header x-bold-signature', async () => {
    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } },
    });

    expect(respuesta.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
    expect(verificarFirmaWebhookMock).not.toHaveBeenCalled();
  });

  it('decodifica el cuerpo Base64 antes de verificar la firma', async () => {
    const cuerpoCrudo = JSON.stringify({ type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } });
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }); // GetItem compra
    sendMock.mockResolvedValueOnce({}); // UpdateItem aprobar
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto' } }); // GetItem evento

    await invocar({
      cuerpoCrudo: Buffer.from(cuerpoCrudo, 'utf8').toString('base64'),
      isBase64Encoded: true,
      firma: 'firma-valida',
    });

    expect(verificarFirmaWebhookMock).toHaveBeenCalledWith(cuerpoCrudo, 'firma-valida', expect.any(Boolean));
  });
});

describe('POST /api/pagos/bold/webhook — SALE_APPROVED', () => {
  it('aprueba la compra, confirma el aforo, emite boletas y notifica al cliente', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago }) // GetItem compra
      .mockResolvedValueOnce({}) // UpdateItem condicional -> aprobada
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } }); // GetItem evento (para el correo)

    const respuesta = await invocar({
      cuerpo: {
        type: 'SALE_APPROVED',
        data: { payment_id: 'bold-tx-1', metadata: { reference: 'compra-1' }, amount: { total: 90000, currency: 'COP' } },
      },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      Key: { compraId: 'compra-1' },
      ConditionExpression: 'estado = :esperandoPago',
      ExpressionAttributeValues: expect.objectContaining({
        ':aprobada': 'aprobada',
        ':esperandoPago': 'esperando_pago_bold',
      }),
    });
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).toHaveBeenCalledWith({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 2,
    });
    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'ana@correo.com', nombre: 'Ana Pérez' },
      'boletas_emitidas',
      expect.objectContaining({ nombreEvento: 'Concierto de jazz' }),
    );
  });

  it('responde 200 sin volver a emitir boletas si el evento ya se procesó antes (duplicado, ConditionExpression falla)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { ...compraEsperandoPago, estado: 'aprobada' } })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 404 si no existe una compra con ese compraId', async () => {
    sendMock.mockResolvedValueOnce({}); // GetItem sin Item

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'no-existe' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(404);
  });

  it('responde 200 igual si confirmarSillas falla con un ErrorAforo (best-effort)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });
    confirmarSillasMock.mockRejectedValueOnce(new ErrorAforo('sillasReservadas insuficiente'));

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
  });

  it('no revierte la aprobación si la emisión de boletas o el correo fallan (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});
    emitirBoletasMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
  });
});

describe('POST /api/pagos/bold/webhook — SALE_REJECTED', () => {
  it('rechaza la compra y libera el aforo', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_REJECTED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      Key: { compraId: 'compra-1' },
      ConditionExpression: 'estado = :esperandoPago',
      ExpressionAttributeValues: expect.objectContaining({ ':rechazada': 'rechazada' }),
    });
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 200 sin liberar aforo dos veces si el evento ya se procesó antes (duplicado)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { ...compraEsperandoPago, estado: 'rechazada' } })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_REJECTED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(liberarSillasMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/pagos/bold/webhook — otros casos', () => {
  it('responde 200 para VOID_APPROVED/VOID_REJECTED sin procesarlos (fuera de alcance)', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago });

    const respuesta = await invocar({
      cuerpo: { type: 'VOID_APPROVED', data: { metadata: { reference: 'compra-1' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(liberarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el cuerpo no es JSON válido', async () => {
    const respuesta = await invocar({ cuerpoCrudo: '{no es json', firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(400);
  });

  it('responde 405 para métodos distintos de POST', async () => {
    const respuesta = await invocar({ metodo: 'GET' });

    expect(respuesta.statusCode).toBe(405);
  });

  it('responde 404 si data.metadata.reference no viene en el payload', async () => {
    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: {} },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
