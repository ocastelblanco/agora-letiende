import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMock,
  verificarFirmaWebhookMock,
  confirmarSillasMock,
  liberarSillasMock,
  emitirBoletasMock,
  firmarCodigoBoletaMock,
  enviarMock,
  consultarPagoBoldMock,
  reservarSillasMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  verificarFirmaWebhookMock: vi.fn(),
  confirmarSillasMock: vi.fn(),
  liberarSillasMock: vi.fn(),
  emitirBoletasMock: vi.fn(),
  firmarCodigoBoletaMock: vi.fn(),
  enviarMock: vi.fn(),
  consultarPagoBoldMock: vi.fn(),
  reservarSillasMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
// bold.ts se importa real (montoCoincide, ErrorConsultaBold) — solo la firma y la
// consulta de red se reemplazan.
vi.mock('../services/bold', async () => {
  const real = await vi.importActual<typeof import('../services/bold')>('../services/bold');
  return {
    ...real,
    verificarFirmaWebhook: verificarFirmaWebhookMock,
    consultarPagoBold: consultarPagoBoldMock,
  };
});
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
  return { ...real, confirmarSillas: confirmarSillasMock, liberarSillas: liberarSillasMock, reservarSillas: reservarSillasMock };
});

const { handler } = await import('./bold-webhook');
const { ErrorAforo } = await import('../services/aforo');
const { ErrorConsultaBold } = await import('../services/bold');

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

const pagoAprobadoBold = {
  type: 'SALE_APPROVED',
  data: { payment_id: 'bold-tx-1', metadata: { reference: 'compra-1' }, amount: { total: 90000, currency: 'COP' } },
};

const comprobanteAprobado = { payment_status: 'APPROVED', total: 90000, reference_id: 'compra-1', transaction_id: 'bold-tx-1' };

function cuerpoAprobado(cambios: { payment_id?: string; amount?: unknown } = {}) {
  return { type: 'SALE_APPROVED', data: { ...pagoAprobadoBold.data, ...cambios } };
}

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
  consultarPagoBoldMock.mockReset();
  reservarSillasMock.mockReset();
  reservarSillasMock.mockResolvedValue(undefined);
  verificarFirmaWebhookMock.mockReturnValue(true);
  consultarPagoBoldMock.mockResolvedValue(comprobanteAprobado);
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

    const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(consultarPagoBoldMock).toHaveBeenCalledWith('compra-1', 1500);
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

  it('responde 200 sin conciliar ni volver a emitir boletas si la compra ya se resolvió (reintento de Bold)', async () => {
    sendMock.mockResolvedValueOnce({ Item: { ...compraEsperandoPago, estado: 'aprobada' } });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(consultarPagoBoldMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 200 sin volver a emitir boletas si otro webhook concurrente ya aprobó la compra (ConditionExpression falla)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 200 si no existe una compra con ese compraId (venta de otro canal)', async () => {
    sendMock.mockResolvedValueOnce({}); // GetItem sin Item

    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: { metadata: { reference: 'no-existe' } } },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(JSON.parse(respuesta.body as string)).toEqual({ recibido: true });
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 200 igual si confirmarSillas falla con un ErrorAforo (best-effort)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });
    confirmarSillasMock.mockRejectedValueOnce(new ErrorAforo('sillasReservadas insuficiente'));

    const respuesta = await invocar({
      cuerpo: cuerpoAprobado(),
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
  });

  it('no revierte la aprobación si la emisión de boletas o el correo fallan (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});
    emitirBoletasMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar({
      cuerpo: cuerpoAprobado(),
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
  });
});

describe('POST /api/pagos/bold/webhook — verificación del monto y conciliación (SALE_APPROVED)', () => {
  async function invocarYVerificarQueNoSeAprueba(cuerpo: unknown) {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago });
    const respuesta = await invocar({ cuerpo, firma: 'firma-valida' });
    expect(sendMock).toHaveBeenCalledTimes(1); // solo el GetItem: nunca el UpdateItem
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
    expect(enviarMock).not.toHaveBeenCalled();
    return respuesta;
  }

  it('responde 422 sin aprobar si el monto del webhook es menor que el de la compra', async () => {
    const respuesta = await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 1000, currency: 'COP' } }));

    expect(respuesta.statusCode).toBe(422);
    expect(consultarPagoBoldMock).not.toHaveBeenCalled();
  });

  it('responde 422 sin aprobar si el monto del webhook es mayor que el de la compra', async () => {
    const respuesta = await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 90001, currency: 'COP' } }));

    expect(respuesta.statusCode).toBe(422);
  });

  it('responde 422 sin aprobar si la moneda no es COP', async () => {
    const respuesta = await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 90000, currency: 'USD' } }));

    expect(respuesta.statusCode).toBe(422);
  });

  it('responde 422 sin aprobar si el webhook no trae monto, o lo trae como texto', async () => {
    expect((await invocarYVerificarQueNoSeAprueba({ type: 'SALE_APPROVED', data: { metadata: { reference: 'compra-1' } } })).statusCode).toBe(422);

    sendMock.mockReset();
    expect((await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: '90000', currency: 'COP' } }))).statusCode).toBe(422);
  });

  it.each(['REJECTED', 'FAILED', 'VOIDED', 'ESTADO_DESCONOCIDO'])(
    'responde 409 sin aprobar si la consulta de Bold dice %s (contradice el webhook)',
    async (estado) => {
      consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, payment_status: estado });

      expect((await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold)).statusCode).toBe(409);
    },
  );

  it('responde 409 sin aprobar si la consulta trae APPROVED con otro total', async () => {
    consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, total: 1000 });

    expect((await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold)).statusCode).toBe(409);
  });

  it('responde 409 sin aprobar si la consulta trae APPROVED con otra referencia', async () => {
    consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, reference_id: 'otra-compra' });

    expect((await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold)).statusCode).toBe(409);
  });

  it.each(['NO_TRANSACTION_FOUND', 'PROCESSING', 'PENDING'])(
    'si la venta aún no aparece en la consulta (%s) aprueba con firma y monto y deja un error en el log',
    async (estado) => {
      const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      consultarPagoBoldMock.mockResolvedValue({ payment_status: estado });
      sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

      const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

      expect(respuesta.statusCode).toBe(200);
      expect(emitirBoletasMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(consola.mock.calls)).toContain(estado);
      consola.mockRestore();
    },
  );

  it('aunque la venta aún no aparezca en la consulta, sigue rechazando un monto que no coincide', async () => {
    consultarPagoBoldMock.mockResolvedValue({ payment_status: 'NO_TRANSACTION_FOUND' });

    expect((await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 1000, currency: 'COP' } }))).statusCode).toBe(422);
  });

  it('acepta APPROVED sin reference_id en la consulta (la documentación no garantiza el campo)', async () => {
    consultarPagoBoldMock.mockResolvedValue({ payment_status: 'APPROVED', total: 90000 });
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

    expect((await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' })).statusCode).toBe(200);
  });

  it('nunca registra el comprobante completo de Bold (trae el correo del pagador)', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, total: 1, payer_email: 'pagador@correo.com' });

    await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold);

    expect(JSON.stringify(consola.mock.calls)).not.toContain('pagador@correo.com');
    consola.mockRestore();
  });

  it('responde 503 sin aprobar si Bold falla (5xx), para que Bold reintente', async () => {
    consultarPagoBoldMock.mockRejectedValue(new ErrorConsultaBold('Bold respondió 500', 500));

    const respuesta = await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold);

    expect(respuesta.statusCode).toBe(503);
  });

  it('responde 503 sin aprobar si la consulta a Bold vence el tiempo o falla la red (sin código HTTP)', async () => {
    consultarPagoBoldMock.mockRejectedValue(new ErrorConsultaBold('No se pudo consultar a Bold (TimeoutError)'));

    const respuesta = await invocarYVerificarQueNoSeAprueba(pagoAprobadoBold);

    expect(respuesta.statusCode).toBe(503);
  });

  it.each([401, 403])(
    'si Bold responde %i (las llaves no sirven para consultar) aprueba con firma y monto, y deja un error visible en el log',
    async (estado) => {
      const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      consultarPagoBoldMock.mockRejectedValue(new ErrorConsultaBold(`Bold respondió ${estado}`, estado));
      sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

      const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

      expect(respuesta.statusCode).toBe(200);
      expect(emitirBoletasMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(consola.mock.calls)).toContain(`Bold respondió ${estado}`);
      consola.mockRestore();
    },
  );

  it('con 403 de Bold sigue rechazando un monto que no coincide (la comparación no depende de la conciliación)', async () => {
    consultarPagoBoldMock.mockRejectedValue(new ErrorConsultaBold('Bold respondió 403', 403));

    const respuesta = await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 1000, currency: 'COP' } }));

    expect(respuesta.statusCode).toBe(422);
  });

  it('en modo pruebas (sandbox, que informa total 0) omite la comparación de monto pero sigue bloqueando si Bold contradice el pago', async () => {
    process.env['BOLD_MODO_PRUEBAS'] = 'true';
    try {
      const sandbox = { ...pagoAprobadoBold, data: { ...pagoAprobadoBold.data, amount: { currency: 'COP', total: 0, taxes: [], tip: 0 } } };
      consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, total: 0 });
      sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

      const aprobada = await invocar({ cuerpo: sandbox, firma: 'firma-valida' });
      expect(aprobada.statusCode).toBe(200);
      expect(emitirBoletasMock).toHaveBeenCalledTimes(1);

      // Si Bold contradice el pago, ni siquiera en modo pruebas se aprueba.
      emitirBoletasMock.mockClear();
      confirmarSillasMock.mockClear();
      enviarMock.mockClear();
      sendMock.mockReset();
      consultarPagoBoldMock.mockResolvedValue({ payment_status: 'REJECTED' });
      const sinConciliar = await invocarYVerificarQueNoSeAprueba(sandbox);
      expect(sinConciliar.statusCode).toBe(409);
    } finally {
      delete process.env['BOLD_MODO_PRUEBAS'];
    }
  });

  it('en producción (BOLD_MODO_PRUEBAS distinto de true) un total 0 en el webhook se rechaza', async () => {
    const cero = { ...pagoAprobadoBold, data: { ...pagoAprobadoBold.data, amount: { currency: 'COP', total: 0, taxes: [], tip: 0 } } };
    consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, total: 0 });

    const respuesta = await invocarYVerificarQueNoSeAprueba(cero);

    expect(respuesta.statusCode).toBe(422);
  });

  it('aprueba con APPROVED y el mismo total (la consulta de Bold no informa moneda)', async () => {
    consultarPagoBoldMock.mockResolvedValue(comprobanteAprobado);
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({}).mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

    const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(emitirBoletasMock).toHaveBeenCalledTimes(1);
  });

  it('un error inesperado al conciliar no aprueba la compra (500 genérico)', async () => {
    consultarPagoBoldMock.mockRejectedValue(new TypeError('bug inesperado'));
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago });

    const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(500);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('no registra datos personales del cliente al rechazar por monto', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await invocarYVerificarQueNoSeAprueba(cuerpoAprobado({ amount: { total: 1, currency: 'COP' } }));

    const registro = JSON.stringify(consola.mock.calls);
    expect(registro).toContain('compra-1');
    expect(registro).not.toContain('ana@correo.com');
    expect(registro).not.toContain('Ana Pérez');
    consola.mockRestore();
  });
});

describe('POST /api/pagos/bold/webhook — SALE_REJECTED (ADR-021: un rechazo no cierra la compra)', () => {
  const avisoRechazo = (paymentId?: string) => ({
    type: 'SALE_REJECTED',
    data: { ...(paymentId ? { payment_id: paymentId } : {}), metadata: { reference: 'compra-1' } },
  });

  it('registra el intento rechazado y deja la compra esperando el pago, con sus sillas reservadas', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});

    const respuesta = await invocar({ cuerpo: avisoRechazo('bold-tx-rechazado'), firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      Key: { compraId: 'compra-1' },
      ConditionExpression: 'estado = :esperandoPago',
      ExpressionAttributeValues: expect.objectContaining({
        ':esperandoPago': 'esperando_pago_bold',
        ':aviso': [{ tipo: 'rechazado', paymentId: 'bold-tx-rechazado', en: '2026-08-25T00:00:00.000Z' }],
      }),
    });
    // Nunca pasa la compra a 'rechazada' ni libera aforo: el cliente puede reintentar con la misma referencia.
    expect(JSON.stringify(comandoUpdate.input)).not.toContain('rechazada');
    expect(comandoUpdate.input.UpdateExpression).not.toMatch(/estado\s*=/);
    expect(liberarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('registra el intento aunque el aviso no traiga payment_id', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});

    const respuesta = await invocar({ cuerpo: avisoRechazo(), firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(sendMock.mock.calls[1]?.[0].input.ExpressionAttributeValues[':aviso']).toEqual([
      { tipo: 'rechazado', en: '2026-08-25T00:00:00.000Z' },
    ]);
  });

  it('descarta un payment_id con formato inesperado en vez de guardarlo', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraEsperandoPago }).mockResolvedValueOnce({});

    await invocar({ cuerpo: avisoRechazo('<script>alert(1)</script>'), firma: 'firma-valida' });

    expect(sendMock.mock.calls[1]?.[0].input.ExpressionAttributeValues[':aviso']).toEqual([
      { tipo: 'rechazado', en: '2026-08-25T00:00:00.000Z' },
    ]);
  });

  it('responde 200 sin escribir nada si la compra ya se resolvió (aviso tardío o duplicado)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({ cuerpo: avisoRechazo('bold-tx-rechazado'), firma: 'firma-valida' });

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

  it('responde 200 si data.metadata.reference no viene en el payload', async () => {
    const respuesta = await invocar({
      cuerpo: { type: 'SALE_APPROVED', data: {} },
      firma: 'firma-valida',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/pagos/bold/webhook — aviso tardío sobre una compra expirada (incidente del 16/10/2026)', () => {
  const compraExpirada = { ...compraEsperandoPago, estado: 'expirada', medioPago: 'bold' };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env['BOLD_MODO_PRUEBAS'] = 'false';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env['BOLD_MODO_PRUEBAS'];
    errorSpy.mockRestore();
  });

  it('vuelve a tomar el aforo, recupera la compra y la aprueba emitiendo las boletas', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraExpirada }) // GetItem
      .mockResolvedValueOnce({}) // expirada → esperando_pago_bold
      .mockResolvedValueOnce({}) // → aprobada
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } }); // nombre del evento

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(consultarPagoBoldMock).toHaveBeenCalledTimes(1);
    expect(reservarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    const recuperar = sendMock.mock.calls[1]?.[0];
    expect(recuperar.input.ConditionExpression).toBe('estado = :cerrada');
    expect(recuperar.input.ExpressionAttributeValues[':cerrada']).toBe('expirada');
    expect(recuperar.input.ExpressionAttributeValues[':esperandoPago']).toBe('esperando_pago_bold');
    expect(sendMock.mock.calls[2]?.[0].input.ExpressionAttributeValues[':aprobada']).toBe('aprobada');
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).toHaveBeenCalledTimes(1);
    expect(enviarMock).toHaveBeenCalledTimes(1);
  });

  it('sin aforo para recuperarla, no aprueba, deja un error para atención manual y responde 200', async () => {
    const { AforoInsuficienteError } = await import('../services/aforo');
    sendMock.mockResolvedValueOnce({ Item: compraExpirada });
    reservarSillasMock.mockRejectedValueOnce(new AforoInsuficienteError(0));

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('requiere atención manual');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('ana@correo.com');
  });

  it('si otro aviso ya la recuperó, devuelve el aforo recién tomado y no emite dos veces', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraExpirada }).mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('sigue exigiendo el monto exacto antes de recuperar nada', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraExpirada });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado({ amount: { total: 1000, currency: 'COP' } }), firma: 'firma' });

    expect(respuesta.statusCode).toBe(422);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('no recupera una compra expirada que no era de Bold (transferencia)', async () => {
    sendMock.mockResolvedValueOnce({ Item: { ...compraExpirada, medioPago: 'transferencia' } });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('no lo esperaba');
  });

  it('una referencia que no tiene forma de compra de Ágora (venta de otro canal) queda como aviso, no como error', async () => {
    const avisoSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocar({
      cuerpo: { ...cuerpoAprobado(), data: { ...pagoAprobadoBold.data, metadata: { reference: '170016244736' } } },
      firma: 'firma',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(avisoSpy).toHaveBeenCalledWith('Webhook de Bold: no existe la compra de la notificación', {
      compraId: '170016244736',
      tipo: 'SALE_APPROVED',
    });
    expect(errorSpy).not.toHaveBeenCalled();
    avisoSpy.mockRestore();
  });

  it('una referencia con forma de compra de Ágora que no existe sigue siendo un error (podría ser un pago perdido)', async () => {
    const idPerdido = '4548e01e-a597-4e6b-b7d9-ac1349e0ae60';
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocar({
      cuerpo: { ...cuerpoAprobado(), data: { ...pagoAprobadoBold.data, metadata: { reference: idPerdido } } },
      firma: 'firma',
    });

    expect(respuesta.statusCode).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith('Webhook de Bold: no existe la compra de la notificación', {
      compraId: idPerdido,
      tipo: 'SALE_APPROVED',
    });
  });
});

describe('POST /api/pagos/bold/webhook — aprobación tras un rechazo (incidente del 10/11/2026, ADR-021)', () => {
  const compraRechazadaPorBold = {
    ...compraEsperandoPago,
    estado: 'rechazada',
    medioPago: 'bold',
    resueltoPor: 'sistema (pago Bold confirmado)',
  };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env['BOLD_MODO_PRUEBAS'] = 'false';
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env['BOLD_MODO_PRUEBAS'];
    errorSpy.mockRestore();
  });

  it('recupera una compra que un rechazo anterior cerró: vuelve a tomar el aforo, la aprueba y emite las boletas', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: compraRechazadaPorBold }) // GetItem
      .mockResolvedValueOnce({}) // rechazada → esperando_pago_bold
      .mockResolvedValueOnce({}) // → aprobada
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } }); // nombre del evento

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(reservarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    const recuperar = sendMock.mock.calls[1]?.[0];
    expect(recuperar.input.ConditionExpression).toBe('estado = :cerrada');
    expect(recuperar.input.ExpressionAttributeValues[':cerrada']).toBe('rechazada');
    expect(sendMock.mock.calls[2]?.[0].input.ExpressionAttributeValues[':aprobada']).toBe('aprobada');
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).toHaveBeenCalledTimes(1);
    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'ana@correo.com', nombre: 'Ana Pérez' },
      'boletas_emitidas',
      expect.objectContaining({ nombreEvento: 'Concierto' }),
    );
  });

  it('exige igual la conciliación con Bold antes de recuperar: si Bold contradice el pago, no recupera nada', async () => {
    consultarPagoBoldMock.mockResolvedValue({ payment_status: 'REJECTED', total: 90000, reference_id: 'compra-1' });
    sendMock.mockResolvedValueOnce({ Item: compraRechazadaPorBold });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(409);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('exige el monto exacto antes de recuperar nada', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraRechazadaPorBold });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado({ amount: { total: 1000, currency: 'COP' } }), firma: 'firma' });

    expect(respuesta.statusCode).toBe(422);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('no recupera una compra que rechazó un productor (transferencia, sin resueltoPor de Bold)', async () => {
    sendMock.mockResolvedValueOnce({
      Item: { ...compraRechazadaPorBold, medioPago: 'transferencia', resueltoPor: 'productor@letiende.co' },
    });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('no lo esperaba');
  });

  it('no recupera una compra de Bold que cerró una persona (resueltoPor distinto del sistema)', async () => {
    sendMock.mockResolvedValueOnce({ Item: { ...compraRechazadaPorBold, resueltoPor: 'productor@letiende.co' } });

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('no lo esperaba');
  });

  it('sin aforo para recuperarla deja un error para atención manual, sin datos del cliente, y responde 200', async () => {
    const { AforoInsuficienteError } = await import('../services/aforo');
    sendMock.mockResolvedValueOnce({ Item: compraRechazadaPorBold });
    reservarSillasMock.mockRejectedValueOnce(new AforoInsuficienteError(0));

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).toContain('requiere atención manual');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('ana@correo.com');
  });

  it('si otro aviso ya la recuperó, devuelve el aforo recién tomado y no emite dos veces', async () => {
    sendMock.mockResolvedValueOnce({ Item: compraRechazadaPorBold }).mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar({ cuerpo: cuerpoAprobado(), firma: 'firma' });

    expect(respuesta.statusCode).toBe(200);
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/pagos/bold/webhook — código de pago de Bold en la compra (ADR-021)', () => {
  it('al aprobar guarda el payment_id del aviso y el código de transacción de la conciliación', async () => {
    consultarPagoBoldMock.mockResolvedValue({ ...comprobanteAprobado, transaction_id: 'TXBOLD00001' });
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

    await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    const aprobar = sendMock.mock.calls[1]?.[0].input;
    expect(aprobar.UpdateExpression).toContain('transaccionBoldId = :transaccion');
    expect(aprobar.ExpressionAttributeValues[':transaccion']).toBe('TXBOLD00001');
    expect(aprobar.ExpressionAttributeValues[':aviso']).toEqual([
      { tipo: 'aprobado', paymentId: 'bold-tx-1', en: '2026-08-25T00:00:00.000Z' },
    ]);
  });

  it('si la conciliación no devuelve código de transacción (venta aún no visible), no lo inventa', async () => {
    consultarPagoBoldMock.mockResolvedValue({ payment_status: 'NO_TRANSACTION_FOUND' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMock
      .mockResolvedValueOnce({ Item: compraEsperandoPago })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto' } });

    await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    const aprobar = sendMock.mock.calls[1]?.[0].input;
    expect(aprobar.UpdateExpression).not.toContain('transaccionBoldId');
    expect(aprobar.ExpressionAttributeValues).not.toHaveProperty(':transaccion');
    errorSpy.mockRestore();
  });
});

// Roadmap #33 (ADR-020) — un pago Bold de una pareja confirma sus sillas y emite con el tipo.
describe('POST /api/pagos/bold/webhook — tipos de boletería', () => {
  it('SALE_APPROVED de una pareja confirma compra.sillas y emite con el tipo', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { ...compraEsperandoPago, tipoId: 't-par', tipoNombre: 'Pareja', personas: 2, sillas: 4 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar({ cuerpo: pagoAprobadoBold, firma: 'firma-valida' });

    expect(respuesta.statusCode).toBe(200);
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 4);
    expect(emitirBoletasMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipoId: 't-par', tipoNombre: 'Pareja', personas: 2, cantidad: 2 }),
    );
  });
});
