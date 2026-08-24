import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMock,
  exigirRolMock,
  reservarSillasMock,
  confirmarSillasMock,
  emitirBoletasMock,
  firmarCodigoBoletaMock,
  enviarMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  exigirRolMock: vi.fn(),
  reservarSillasMock: vi.fn(),
  confirmarSillasMock: vi.fn(),
  emitirBoletasMock: vi.fn(),
  firmarCodigoBoletaMock: vi.fn(),
  enviarMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
// `tieneAccesoAlEvento` se reexporta desde la implementación real
// (`importOriginal`) — es lógica pura sin dependencias externas (TODO.md
// Tarea 1, T8), mismo criterio que eventos.spec.ts; solo `exigirRol` se
// reemplaza por el mock controlado desde cada test.
vi.mock('../lib/autorizacion', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/autorizacion')>();
  return { ...real, exigirRol: exigirRolMock };
});
vi.mock('../lib/firma-boletas', () => ({ firmarCodigoBoleta: firmarCodigoBoletaMock }));
vi.mock('../services/notificaciones', () => ({
  CanalCorreoSes: vi.fn().mockImplementation(function (this: { enviar: typeof enviarMock }) {
    this.enviar = enviarMock;
  }),
}));
vi.mock('../services/boleteria', () => ({ emitirBoletas: emitirBoletasMock }));
// reservarSillas/confirmarSillas se mockean, pero las clases de error de
// aforo.ts se importan reales (mismo criterio que compras.spec.ts) para
// poder lanzarlas de verdad en las pruebas de rechazo.
vi.mock('../services/aforo', async () => {
  const real = await vi.importActual<typeof import('../services/aforo')>('../services/aforo');
  return { ...real, reservarSillas: reservarSillasMock, confirmarSillas: confirmarSillasMock };
});

const { handler } = await import('./ventas-efectivo');
const { AforoInsuficienteError, EventoNoPublicadoError } = await import('../services/aforo');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const permisosPortero = {
  email: 'portero@letiende.co',
  nombre: 'Pedro Portero',
  rol: 'portero' as const,
  activo: true,
};

const clienteValido = {
  nombre: 'Ana Pérez',
  telefono: '+57 300 1234567',
  correo: 'ana@correo.com',
};

const AHORA = new Date('2026-08-09T00:00:00.000Z');

const eventoPublicado = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  estado: 'publicado',
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo', 'transferencia'],
  plazoComprobanteMinutos: 10,
  etapas: [
    { etapaId: 'et-1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 },
  ],
  // El portero por defecto de estas pruebas está asignado (TODO.md Tarea 1,
  // T8) — las pruebas de "no asignado" abajo lo desasignan explícitamente,
  // en vez de que todas las demás pruebas (aforo, etapas, mediosPago...)
  // tengan que preocuparse por armar este campo cada vez.
  porteros: ['portero@letiende.co'],
  productores: [],
};

function crearPeticion(metodo: string, cuerpo?: unknown): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: '/api/ventas-efectivo',
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, cuerpo?: unknown) {
  const respuesta = await handler(crearPeticion(metodo, cuerpo), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  sendMock.mockReset();
  exigirRolMock.mockReset();
  reservarSillasMock.mockReset();
  confirmarSillasMock.mockReset();
  emitirBoletasMock.mockReset();
  firmarCodigoBoletaMock.mockReset();
  enviarMock.mockReset();
  exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosPortero });
  confirmarSillasMock.mockResolvedValue(undefined);
  emitirBoletasMock.mockResolvedValue([
    { boletaId: 'bol-1', eventoId: 'evt-1', compraId: 'compra-1', numeroEnCompra: 1, etapaId: 'et-1', valorUnitario: 45000, estado: 'valida', emitidaEn: AHORA.toISOString() },
  ]);
  firmarCodigoBoletaMock.mockReturnValue('firma-simulada');
  enviarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

const cuerpoValido = {
  slug: 'concierto-jazz',
  cantidad: 2,
  cliente: clienteValido,
  autorizacionDatos: true,
};

describe('POST /api/ventas-efectivo', () => {
  it('responde 401/403 si exigirRol rechaza (sin sesión de portero)', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 401, body: JSON.stringify({ mensaje: 'No autenticado' }) },
    });

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('reserva, confirma y emite boletas en una sola operación, con medioPago efectivo y estado aprobada', async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [eventoPublicado] }) // QueryCommand por slug (buscarEventoPublicadoPorSlug)
      .mockResolvedValueOnce({}); // PutCommand de la compra
    reservarSillasMock.mockResolvedValueOnce(undefined);

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(201);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.estado).toBe('aprobada');
    expect(cuerpo.montoTotal).toBe(90000);
    expect(cuerpo.boletas).toBe(1);

    expect(reservarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(emitirBoletasMock).toHaveBeenCalledWith({
      compraId: expect.any(String),
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 2,
    });

    const comandoPut = sendMock.mock.calls[1]?.[0];
    expect(comandoPut.input.Item).toMatchObject({
      eventoId: 'evt-1',
      etapaId: 'et-1',
      cantidad: 2,
      montoTotal: 90000,
      medioPago: 'efectivo',
      estado: 'aprobada',
      resueltoPor: 'portero@letiende.co',
    });
    // Venta directa sin plazo de comprobante: no hay TTL/token de enlace.
    expect(comandoPut.input.Item.expiraEn).toBeUndefined();
    expect(comandoPut.input.Item.tokenComprobanteHash).toBeUndefined();

    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'ana@correo.com', nombre: 'Ana Pérez' },
      'boletas_emitidas',
      expect.objectContaining({ nombreEvento: 'Concierto de jazz' }),
    );
  });

  it('responde 400 si falta autorizacionDatos', async () => {
    const respuesta = await invocar('POST', { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido });

    expect(respuesta.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el evento no existe', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(404);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el evento venció por vigencia aunque el estado siga publicado, y lo finaliza best-effort (hotfixes pre-producción)', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            ...eventoPublicado,
            fechaHora: '2020-01-10T00:00:00.000Z',
            etapas: [{ ...eventoPublicado.etapas[0], cierraEn: '2020-01-05T00:00:00.000Z' }],
          },
        ],
      })
      .mockResolvedValueOnce({});

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(404);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(2);
    const comandoUpdate = sendMock.mock.calls[1][0];
    expect(comandoUpdate.constructor.name).toBe('UpdateCommand');
    expect(comandoUpdate.input.Key).toEqual({ eventoId: 'evt-1' });
  });

  // TODO.md Tarea 1 (T8): autorización real por evento — un portero solo
  // puede vender en efectivo para los eventos donde está en `porteros`.
  describe('autorización por evento (TODO.md Tarea 1, T8)', () => {
    it('responde 403 si el portero no está asignado al evento (porteros no lo incluye)', async () => {
      sendMock.mockResolvedValueOnce({ Items: [{ ...eventoPublicado, porteros: ['otro@letiende.co'] }] });

      const respuesta = await invocar('POST', cuerpoValido);

      expect(respuesta.statusCode).toBe(403);
      expect(reservarSillasMock).not.toHaveBeenCalled();
    });

    it('responde 403 si el evento no tiene ningún portero asignado', async () => {
      sendMock.mockResolvedValueOnce({ Items: [{ ...eventoPublicado, porteros: [] }] });

      const respuesta = await invocar('POST', cuerpoValido);

      expect(respuesta.statusCode).toBe(403);
    });

    it('un administrador puede vender aunque no esté en porteros (bypass)', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [{ ...eventoPublicado, porteros: ['otro@letiende.co'] }] })
        .mockResolvedValueOnce({});
      reservarSillasMock.mockResolvedValueOnce(undefined);
      exigirRolMock.mockResolvedValueOnce({
        autorizado: true,
        permisos: { email: 'admin@letiende.co', nombre: 'Ana Admin', rol: 'administrador', activo: true },
      });

      const respuesta = await invocar('POST', cuerpoValido);

      expect(respuesta.statusCode).toBe(201);
    });
  });

  it('responde 409 si el evento no acepta pagos en efectivo', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...eventoPublicado, mediosPago: ['transferencia'] }] });

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(409);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 400 si la cantidad supera maxBoletasPorCompra', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });

    const respuesta = await invocar('POST', { ...cuerpoValido, cantidad: 10 });

    expect(respuesta.statusCode).toBe(400);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 409 si ninguna etapa está vigente', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ ...eventoPublicado, etapas: [{ ...eventoPublicado.etapas[0], cierraEn: '2020-01-01T00:00:00.000Z' }] }],
    });

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(409);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 501 si la etapa vigente es gratuita (fuera de alcance de esta tarea)', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ ...eventoPublicado, etapas: [{ ...eventoPublicado.etapas[0], precio: 0 }] }],
    });

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(501);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 409 con las sillas disponibles reales cuando el aforo no alcanza', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });
    reservarSillasMock.mockRejectedValueOnce(new AforoInsuficienteError(1));

    const respuesta = await invocar('POST', { ...cuerpoValido, cantidad: 3 });

    expect(respuesta.statusCode).toBe(409);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.sillasDisponibles).toBe(1);
  });

  it('responde 409 si el evento ya no está publicado en el momento de reservar', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });
    reservarSillasMock.mockRejectedValueOnce(new EventoNoPublicadoError());

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(409);
  });

  it('responde 409 si colisiona el compraId al persistir (condición fallida)', async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [eventoPublicado] })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());
    reservarSillasMock.mockResolvedValueOnce(undefined);

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(409);
  });

  it('no revierte la venta si la emisión de boletas o el correo fallan (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] }).mockResolvedValueOnce({});
    reservarSillasMock.mockResolvedValueOnce(undefined);
    emitirBoletasMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar('POST', cuerpoValido);

    expect(respuesta.statusCode).toBe(201);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.boletas).toBe(0);
  });

  it('responde 405 para métodos distintos de POST', async () => {
    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(405);
  });

  // v2, roadmap #24 — boletería opcional: un evento sin etapas no cobra
  // nada, solo controla aforo. La venta en taquilla ya era inmediata sin
  // comprobante; con etapas: [] simplemente no hay precio ni etapaId que
  // asociar.
  describe('evento sin etapas (boletería opcional)', () => {
    const eventoSinEtapas = { ...eventoPublicado, etapas: [] };

    it('reserva, confirma y emite boletas con montoTotal 0 y sin etapaId', async () => {
      sendMock.mockResolvedValueOnce({ Items: [eventoSinEtapas] }).mockResolvedValueOnce({});
      reservarSillasMock.mockResolvedValueOnce(undefined);

      const respuesta = await invocar('POST', cuerpoValido);

      expect(respuesta.statusCode).toBe(201);
      const cuerpo = JSON.parse(respuesta.body ?? '{}');
      expect(cuerpo.estado).toBe('aprobada');
      expect(cuerpo.montoTotal).toBe(0);
      expect(cuerpo.boletas).toBe(1);

      expect(emitirBoletasMock).toHaveBeenCalledWith({
        compraId: expect.any(String),
        eventoId: 'evt-1',
        etapaId: undefined,
        montoTotal: 0,
        cantidad: 2,
      });

      const comandoPut = sendMock.mock.calls[1]?.[0];
      expect(comandoPut.input.Item.etapaId).toBeUndefined();
      expect(comandoPut.input.Item.montoTotal).toBe(0);
      expect(comandoPut.input.Item.medioPago).toBe('efectivo');
    });

    it('no exige ninguna etapa vigente ni rechaza por etapa gratuita', async () => {
      sendMock.mockResolvedValueOnce({ Items: [eventoSinEtapas] }).mockResolvedValueOnce({});
      reservarSillasMock.mockResolvedValueOnce(undefined);

      const respuesta = await invocar('POST', cuerpoValido);

      expect(respuesta.statusCode).toBe(201);
    });
  });
});
