import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, clienteS3SendMock, getSignedUrlMock, hashearTokenMock, enviarMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  clienteS3SendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
  hashearTokenMock: vi.fn(),
  enviarMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../services/s3', () => ({ clienteS3: { send: clienteS3SendMock } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));
vi.mock('../lib/enlaces-magicos', () => ({ hashearToken: hashearTokenMock }));
vi.mock('../services/notificaciones', () => ({
  CanalCorreoSes: vi.fn().mockImplementation(function (this: { enviar: typeof enviarMock }) {
    this.enviar = enviarMock;
  }),
}));

const { handler } = await import('./comprobantes');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const AHORA_EPOCH = Math.floor(new Date('2026-08-08T00:00:00.000Z').getTime() / 1000);

const compraValida = {
  compraId: 'compra-1',
  eventoId: 'evt-1',
  cantidad: 2,
  estado: 'esperando_comprobante',
  expiraEn: AHORA_EPOCH + 600,
};

function crearPeticion(
  metodo: string,
  opciones: { rawPath?: string; token?: string; cuerpo?: unknown } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/comprobantes/token-en-claro/url-carga',
    pathParameters: opciones.token ? { token: opciones.token } : { token: 'token-en-claro' },
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
  vi.setSystemTime(new Date(AHORA_EPOCH * 1000));
  sendMock.mockReset();
  clienteS3SendMock.mockReset();
  getSignedUrlMock.mockReset();
  hashearTokenMock.mockReset();
  enviarMock.mockReset();
  hashearTokenMock.mockReturnValue('hash-derivado');
  getSignedUrlMock.mockResolvedValue('https://s3.amazonaws.com/presignada');
  enviarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('validación del token (compartida por ambos endpoints)', () => {
  it('responde 404 si el token no corresponde a ninguna compra', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/png', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(404);
  });

  it('responde 410 si el enlace ya venció, aunque el ítem todavía exista (TTL no puntual)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, expiraEn: AHORA_EPOCH - 60 }] });

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/png', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(410);
  });

  it('responde 409 si el enlace ya fue usado (estado distinto de esperando_comprobante)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, estado: 'en_revision' }] });

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/png', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(409);
  });
});

describe('POST /api/comprobantes/:token/url-carga', () => {
  it('devuelve una URL prefirmada y persiste la key en la compra', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] }); // validarToken
    sendMock.mockResolvedValueOnce({}); // UpdateCommand con la key

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/png', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.url).toBe('https://s3.amazonaws.com/presignada');
    expect(cuerpo.key).toMatch(/^compras\/compra-1\/comprobante-.+\.png$/);

    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input.UpdateExpression).toBe('SET comprobanteKey = :key');
    expect(comandoUpdate.input.ConditionExpression).toBe('estado = :esperando');
  });

  it('rechaza SVG explícitamente', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] });

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/svg+xml', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(400);
  });

  it('rechaza un tamaño mayor a 10 MB', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] });

    const respuesta = await invocar('POST', {
      cuerpo: { tipoMime: 'application/pdf', tamano: 11 * 1024 * 1024 },
    });

    expect(respuesta.statusCode).toBe(400);
  });

  it('acepta application/pdf', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] }).mockResolvedValueOnce({});

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'application/pdf', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(200);
  });

  it('responde 409 si la escritura de la key colisiona con un enlace ya consumido', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar('POST', { cuerpo: { tipoMime: 'image/png', tamano: 1000 } });

    expect(respuesta.statusCode).toBe(409);
  });
});

describe('POST /api/comprobantes/:token/confirmar', () => {
  function bodyConBytes(bytes: number[]) {
    return { transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array(bytes)) };
  }

  it('responde 400 si todavía no se subió ningún comprobante', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraValida] }); // sin comprobanteKey

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(400);
    expect(clienteS3SendMock).not.toHaveBeenCalled();
  });

  it('confirma un PNG válido: transiciona a en_revision y notifica a los productores', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x.png' }] });
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) });
    sendMock.mockResolvedValueOnce({}); // UpdateCommand a en_revision
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz', productores: ['p1@letiende.co', 'p2@letiende.co'] } });

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(200);
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      UpdateExpression: 'SET estado = :enRevision',
      ConditionExpression: 'estado = :esperando',
    });
    expect(enviarMock).toHaveBeenCalledTimes(2);
    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'p1@letiende.co', nombre: 'p1@letiende.co' },
      'aviso_comprobante',
      { nombreEvento: 'Concierto de jazz', cantidad: 2 },
    );
  });

  it.each([
    ['JPEG', [0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['PDF', [0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]],
    ['WEBP', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])('acepta %s por sus magic bytes reales', async (_nombre, bytes) => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x' }] });
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes(bytes) });
    sendMock.mockResolvedValueOnce({});
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Evento', productores: [] } });

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(200);
  });

  it('rechaza un archivo cuyo Content-Type declarado no coincide con sus magic bytes reales, y borra el objeto', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x.png' }] });
    // Declarado como PNG en url-carga, pero los bytes reales no son de ningún formato válido.
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) });
    clienteS3SendMock.mockResolvedValueOnce({}); // DeleteObjectCommand

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(400);
    expect(clienteS3SendMock).toHaveBeenCalledTimes(2);
    const comandoDelete = clienteS3SendMock.mock.calls[1]?.[0];
    expect(comandoDelete.input.Key).toBe('compras/compra-1/comprobante-x.png');
    // No debe haber transicionado la compra.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza un SVG cuya cabecera no coincide con ninguna firma binaria válida', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x.svg' }] });
    const svgBytes = Array.from(Buffer.from('<svg xml></svg>').subarray(0, 12));
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes(svgBytes) });
    clienteS3SendMock.mockResolvedValueOnce({});

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(400);
  });

  it('responde 409 si el enlace se consumió entre la validación y la transición (condición fallida)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x.png' }] });
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(409);
  });

  it('responde 200 aunque la notificación a productores falle (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraValida, comprobanteKey: 'compras/compra-1/comprobante-x.png' }] });
    clienteS3SendMock.mockResolvedValueOnce({ Body: bodyConBytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]) });
    sendMock.mockResolvedValueOnce({});
    sendMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar('POST', { rawPath: '/api/comprobantes/token-en-claro/confirmar' });

    expect(respuesta.statusCode).toBe(200);
  });
});
