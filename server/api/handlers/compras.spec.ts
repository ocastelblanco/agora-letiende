import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, reservarSillasMock, generarTokenEnlaceMock, enviarMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  reservarSillasMock: vi.fn(),
  generarTokenEnlaceMock: vi.fn(),
  enviarMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../lib/enlaces-magicos', () => ({ generarTokenEnlace: generarTokenEnlaceMock }));
vi.mock('../services/notificaciones', () => ({
  CanalCorreoSes: vi.fn().mockImplementation(function (this: { enviar: typeof enviarMock }) {
    this.enviar = enviarMock;
  }),
}));

const { handler, etapaVigente } = await import('./compras');
const { AforoInsuficienteError, EventoNoPublicadoError } = await import('../services/aforo');

// aforo.ts sí se importa real (no se mockea el módulo completo) para poder
// lanzar sus clases de error reales — solo su función se reemplaza.
vi.mock('../services/aforo', async () => {
  const real = await vi.importActual<typeof import('../services/aforo')>('../services/aforo');
  return { ...real, reservarSillas: reservarSillasMock };
});

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const clienteValido = {
  nombre: 'Ana Pérez',
  telefono: '+57 300 1234567',
  correo: 'ana@correo.com',
};

const AHORA = new Date('2026-08-08T00:00:00.000Z');

const eventoPublicado = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  estado: 'publicado',
  maxBoletasPorCompra: 4,
  plazoComprobanteMinutos: 10,
  etapas: [
    { etapaId: 'et-1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 },
  ],
};

function crearPeticion(
  metodo: string,
  opciones: {
    rawPath?: string;
    compraId?: string;
    cuerpo?: unknown;
  } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/compras',
    pathParameters: opciones.compraId ? { compraId: opciones.compraId } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, opciones?: Parameters<typeof crearPeticion>[1]) {
  const respuesta = await handler(crearPeticion(metodo, opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  sendMock.mockReset();
  reservarSillasMock.mockReset();
  generarTokenEnlaceMock.mockReset();
  enviarMock.mockReset();
  generarTokenEnlaceMock.mockReturnValue({ token: 'token-en-claro', hash: 'hash-derivado' });
  enviarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/compras', () => {
  it('crea la compra, reserva el aforo y envía el correo con el enlace de comprobante', async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [eventoPublicado] }) // QueryCommand por slug
      .mockResolvedValueOnce({}); // PutCommand de la compra
    reservarSillasMock.mockResolvedValueOnce(undefined);

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 2, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(201);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.montoTotal).toBe(90000);
    expect(cuerpo.estado).toBe('esperando_comprobante');
    expect(reservarSillasMock).toHaveBeenCalledWith('evt-1', 2);

    const comandoPut = sendMock.mock.calls[1]?.[0];
    expect(comandoPut.input.Item).toMatchObject({
      eventoId: 'evt-1',
      etapaId: 'et-1',
      cantidad: 2,
      montoTotal: 90000,
      // Único medio realmente alcanzable por este flujo hoy (Bold es fase
      // 2, 'efectivo' es exclusivo de ventas-efectivo.ts) — gap de modelo
      // cerrado en esta tarea: antes ninguna compra persistía medioPago.
      medioPago: 'transferencia',
      estado: 'esperando_comprobante',
      tokenComprobanteHash: 'hash-derivado',
    });
    // expiraEn es epoch-segundos (Number), no ISO — TTL de DynamoDB lo exige.
    expect(typeof comandoPut.input.Item.expiraEn).toBe('number');

    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'ana@correo.com', nombre: 'Ana Pérez' },
      'enlace_comprobante',
      expect.objectContaining({ nombreEvento: 'Concierto de jazz', urlComprobante: expect.stringContaining('token-en-claro') }),
    );
  });

  it('nunca acepta el precio/total del payload — siempre lo calcula del backend', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] }).mockResolvedValueOnce({});
    reservarSillasMock.mockResolvedValueOnce(undefined);

    const respuesta = await invocar('POST', {
      cuerpo: {
        slug: 'concierto-jazz',
        cantidad: 1,
        cliente: clienteValido,
        autorizacionDatos: true,
        montoTotal: 1, // debe ignorarse por completo
      },
    });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.montoTotal).toBe(45000);
  });

  it('responde 400 si falta autorizacionDatos', async () => {
    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido },
    });
    expect(respuesta.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 400 si el nombre del cliente tiene caracteres de control', async () => {
    const respuesta = await invocar('POST', {
      cuerpo: {
        slug: 'concierto-jazz',
        cantidad: 1,
        cliente: { ...clienteValido, nombre: 'Ana\x00Pérez' },
        autorizacionDatos: true,
      },
    });
    expect(respuesta.statusCode).toBe(400);
  });

  it('responde 400 si el correo del cliente es inválido', async () => {
    const respuesta = await invocar('POST', {
      cuerpo: {
        slug: 'concierto-jazz',
        cantidad: 1,
        cliente: { ...clienteValido, correo: 'no-es-un-correo' },
        autorizacionDatos: true,
      },
    });
    expect(respuesta.statusCode).toBe(400);
  });

  it('responde 404 si el evento no existe', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'no-existe', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

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

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(404);
    expect(reservarSillasMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(2);
    const comandoUpdate = sendMock.mock.calls[1][0];
    expect(comandoUpdate.constructor.name).toBe('UpdateCommand');
    expect(comandoUpdate.input.Key).toEqual({ eventoId: 'evt-1' });
  });

  it('no bloquea la compra si solo la última etapa cerró pero la fecha del evento todavía no pasó', async () => {
    // Caso ya cubierto por el 409 de "ninguna etapa vigente" — confirma que
    // la vigencia (hotfix 1) no lo intercepta antes con un 404 distinto.
    sendMock.mockResolvedValueOnce({
      Items: [{ ...eventoPublicado, etapas: [{ ...eventoPublicado.etapas[0], cierraEn: '2020-01-01T00:00:00.000Z' }] }],
    });

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('responde 400 si la cantidad supera maxBoletasPorCompra', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 10, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(400);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 409 si ninguna etapa está vigente', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ ...eventoPublicado, etapas: [{ ...eventoPublicado.etapas[0], cierraEn: '2020-01-01T00:00:00.000Z' }] }],
    });

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(409);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 501 si la etapa vigente es gratuita (fuera de alcance de esta tarea)', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ ...eventoPublicado, etapas: [{ ...eventoPublicado.etapas[0], precio: 0 }] }],
    });

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(501);
    expect(reservarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 409 con las sillas disponibles reales cuando el aforo no alcanza (CU-17)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });
    reservarSillasMock.mockRejectedValueOnce(new AforoInsuficienteError(1));

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 3, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(409);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.sillasDisponibles).toBe(1);
  });

  it('responde 409 si el evento ya no está publicado en el momento de reservar', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] });
    reservarSillasMock.mockRejectedValueOnce(new EventoNoPublicadoError());

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(409);
  });

  it('no revierte la compra si el envío de correo falla (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] }).mockResolvedValueOnce({});
    reservarSillasMock.mockResolvedValueOnce(undefined);
    enviarMock.mockRejectedValueOnce(new Error('SES no disponible'));

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(201);
  });

  it('responde 409 si colisiona el compraId al persistir (condición fallida)', async () => {
    sendMock
      .mockResolvedValueOnce({ Items: [eventoPublicado] })
      .mockRejectedValueOnce(new ConditionalCheckFailedException());
    reservarSillasMock.mockResolvedValueOnce(undefined);

    const respuesta = await invocar('POST', {
      cuerpo: { slug: 'concierto-jazz', cantidad: 1, cliente: clienteValido, autorizacionDatos: true },
    });

    expect(respuesta.statusCode).toBe(409);
  });
});

describe('GET /api/compras/:compraId/estado', () => {
  it('devuelve el estado sin datos personales del cliente', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        compraId: 'compra-1',
        estado: 'esperando_comprobante',
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: Math.floor(AHORA.getTime() / 1000) + 600,
        cliente: { nombre: 'Ana', telefono: '300', correo: 'ana@correo.com' },
      },
    });

    const respuesta = await invocar('GET', { rawPath: '/api/compras/compra-1/estado', compraId: 'compra-1' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.cliente).toBeUndefined();
    expect(cuerpo.estado).toBe('esperando_comprobante');
  });

  it('reporta expirada si expiraEn ya pasó aunque el ítem todavía exista (TTL no puntual)', async () => {
    sendMock.mockResolvedValueOnce({
      Item: {
        compraId: 'compra-1',
        estado: 'esperando_comprobante',
        cantidad: 1,
        montoTotal: 45000,
        expiraEn: Math.floor(AHORA.getTime() / 1000) - 60,
      },
    });

    const respuesta = await invocar('GET', { rawPath: '/api/compras/compra-1/estado', compraId: 'compra-1' });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.estado).toBe('expirada');
  });

  it('responde 404 si la compra no existe', async () => {
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocar('GET', { rawPath: '/api/compras/no-existe/estado', compraId: 'no-existe' });

    expect(respuesta.statusCode).toBe(404);
  });
});

describe('etapaVigente', () => {
  it('ordena por cierraEn cronológico aunque contradiga a orden (caso real: etapa nueva agregada al final del formulario pero que cierra antes que una anterior)', () => {
    // Escenario real reportado por el usuario en producción: A (orden 1) ya
    // cerrada, B (orden 2) sería la "vigente" si se ordenara por orden. El
    // admin agrega C al final del formulario (orden 3), pero su cierraEn es
    // ANTERIOR al de B. Cronológicamente cierran en el orden A, C, B — como
    // A ya cerró, la etapa vigente correcta es C, no B (que es lo que
    // devolvía el cálculo anterior, ordenado por `orden`, cobrando el
    // precio equivocado).
    const etapas = [
      { etapaId: 'A', nombre: 'Preventa', precio: 30000, orden: 1, cierraEn: '2026-08-01T00:00:00.000Z' },
      { etapaId: 'B', nombre: 'General', precio: 60000, orden: 2, cierraEn: '2026-09-15T00:00:00.000Z' },
      { etapaId: 'C', nombre: 'Última hora', precio: 45000, orden: 3, cierraEn: '2026-09-01T00:00:00.000Z' },
    ];

    const resultado = etapaVigente(etapas, AHORA);

    expect(resultado?.etapaId).toBe('C');
  });

  it('devuelve null cuando todas las etapas ya cerraron, sin importar orden', () => {
    const etapas = [
      { etapaId: 'A', nombre: 'Preventa', precio: 30000, orden: 1, cierraEn: '2020-01-01T00:00:00.000Z' },
      { etapaId: 'B', nombre: 'General', precio: 60000, orden: 2, cierraEn: '2020-02-01T00:00:00.000Z' },
    ];

    expect(etapaVigente(etapas, AHORA)).toBeNull();
  });
});
