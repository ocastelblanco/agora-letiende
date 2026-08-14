import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMock,
  clienteS3SendMock,
  getSignedUrlMock,
  hashearTokenMock,
  exigirRolMock,
  confirmarSillasMock,
  liberarSillasMock,
  emitirBoletasMock,
  enviarMock,
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  clienteS3SendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
  hashearTokenMock: vi.fn(),
  exigirRolMock: vi.fn(),
  confirmarSillasMock: vi.fn(),
  liberarSillasMock: vi.fn(),
  emitirBoletasMock: vi.fn(),
  enviarMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../services/s3', () => ({ clienteS3: { send: clienteS3SendMock } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));
vi.mock('../lib/enlaces-magicos', () => ({ hashearToken: hashearTokenMock }));
// exigirRol se mockea, pero tieneAccesoAlEvento se importa real (mismo
// criterio que aforo.ts abajo) — es una función pura sin dependencias, y las
// pruebas de listarPendientes() verifican su comportamiento real.
vi.mock('../lib/autorizacion', async () => {
  const real = await vi.importActual<typeof import('../lib/autorizacion')>('../lib/autorizacion');
  return { ...real, exigirRol: exigirRolMock };
});
vi.mock('../services/notificaciones', () => ({
  CanalCorreoSes: vi.fn().mockImplementation(function (this: { enviar: typeof enviarMock }) {
    this.enviar = enviarMock;
  }),
}));
vi.mock('../services/aforo', async () => {
  const real = await vi.importActual<typeof import('../services/aforo')>('../services/aforo');
  return { ...real, confirmarSillas: confirmarSillasMock, liberarSillas: liberarSillasMock };
});
vi.mock('../services/boleteria', () => ({ emitirBoletas: emitirBoletasMock }));

const { handler } = await import('./aprobaciones');
const { ErrorAforo } = await import('../services/aforo');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const AHORA_EPOCH = Math.floor(new Date('2026-08-09T00:00:00.000Z').getTime() / 1000);

const compraEnRevision = {
  compraId: 'compra-1',
  eventoId: 'evt-1',
  etapaId: 'et-1',
  cantidad: 2,
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
  montoTotal: 90000,
  estado: 'en_revision',
  comprobanteKey: 'compras/compra-1/comprobante-x.png',
  tokenAprobacionExpiraEn: AHORA_EPOCH + 3600,
};

const boletasEmitidas = [
  { boletaId: 'bol-1', eventoId: 'evt-1', compraId: 'compra-1', numeroEnCompra: 1, etapaId: 'et-1', valorUnitario: 45000, estado: 'valida' as const, emitidaEn: '2026-08-09T00:00:00.000Z' },
  { boletaId: 'bol-2', eventoId: 'evt-1', compraId: 'compra-1', numeroEnCompra: 2, etapaId: 'et-1', valorUnitario: 45000, estado: 'valida' as const, emitidaEn: '2026-08-09T00:00:00.000Z' },
];

const permisosProductor = {
  email: 'productor@letiende.co',
  nombre: 'Productor',
  rol: 'productor' as const,
  activo: true,
};

const permisosAdministrador = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador' as const,
  activo: true,
};

function crearPeticion(
  metodo: string,
  opciones: { rawPath?: string; token?: string; cuerpo?: unknown; headers?: Record<string, string> } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/aprobaciones',
    pathParameters: opciones.token ? { token: opciones.token } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: opciones.headers ?? {},
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
  exigirRolMock.mockReset();
  confirmarSillasMock.mockReset();
  liberarSillasMock.mockReset();
  emitirBoletasMock.mockReset();
  enviarMock.mockReset();
  hashearTokenMock.mockReturnValue('hash-derivado');
  getSignedUrlMock.mockResolvedValue('https://s3.amazonaws.com/presignada');
  emitirBoletasMock.mockResolvedValue(boletasEmitidas);
  enviarMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/aprobaciones (autenticado)', () => {
  it('responde con la respuesta de exigirRol si no está autorizado', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 403, body: '{"mensaje":"No autorizado en Ágora"}' },
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('solo lista compras en_revision de eventos donde el productor está asignado', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({
      Items: [
        { eventoId: 'evt-propio', nombre: 'Concierto de jazz', productores: ['productor@letiende.co'] },
        { eventoId: 'evt-ajeno', nombre: 'Otro evento', productores: ['otro@letiende.co'] },
      ],
    });
    sendMock.mockResolvedValueOnce({
      Items: [{ compraId: 'compra-1', cantidad: 2, montoTotal: 90000, creadaEn: '2026-08-08T00:00:00.000Z' }],
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toEqual([
      {
        compraId: 'compra-1',
        nombreEvento: 'Concierto de jazz',
        cantidad: 2,
        montoTotal: 90000,
        creadaEn: '2026-08-08T00:00:00.000Z',
      },
    ]);
    // Solo se hizo Query sobre el evento propio, no sobre el ajeno.
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('devuelve una lista vacía si el productor no tiene eventos asignados', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('GET');

    expect(JSON.parse(respuesta.body ?? 'null')).toEqual([]);
  });

  it('con bypass de administrador, ve las compras en_revision de todos los eventos aunque no esté en productores', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosAdministrador });
    sendMock.mockResolvedValueOnce({
      Items: [
        { eventoId: 'evt-propio', nombre: 'Concierto de jazz', productores: ['otro@letiende.co'] },
        { eventoId: 'evt-ajeno', nombre: 'Otro evento', productores: ['alguien-mas@letiende.co'] },
      ],
    });
    sendMock.mockResolvedValueOnce({
      Items: [{ compraId: 'compra-1', cantidad: 2, montoTotal: 90000, creadaEn: '2026-08-08T00:00:00.000Z' }],
    });
    sendMock.mockResolvedValueOnce({
      Items: [{ compraId: 'compra-2', cantidad: 1, montoTotal: 45000, creadaEn: '2026-08-08T00:00:00.000Z' }],
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toHaveLength(2);
    // Query sobre ambos eventos, ninguno filtrado — a diferencia de un
    // productor sin asignar (caso anterior, lista vacía).
    expect(sendMock).toHaveBeenCalledTimes(3);
  });
});

describe('validación del token (compartida por los tres endpoints de enlace mágico)', () => {
  it('responde 404 si el token no corresponde a ninguna compra', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('GET', { token: 'token-x' });

    expect(respuesta.statusCode).toBe(404);
  });

  it('responde 410 si el token de aprobación ya venció', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraEnRevision, tokenAprobacionExpiraEn: AHORA_EPOCH - 60 }] });

    const respuesta = await invocar('GET', { token: 'token-x' });

    expect(respuesta.statusCode).toBe(410);
  });

  it('responde 409 con quién la resolvió si la compra ya no está en_revision (CU-10)', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ ...compraEnRevision, estado: 'aprobada', resueltoPor: 'otro miembro del equipo' }],
    });

    const respuesta = await invocar('GET', { token: 'token-x' });

    expect(respuesta.statusCode).toBe(409);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.mensaje).toContain('ya fue resuelta por');
  });

  it('responde 409 genérico si ya no está en_revision y no hay resueltoPor', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraEnRevision, estado: 'aprobada' }] });

    const respuesta = await invocar('GET', { token: 'token-x' });

    expect(respuesta.statusCode).toBe(409);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.mensaje).not.toContain('undefined');
  });
});

describe('GET /api/aprobaciones/:token', () => {
  it('devuelve los datos de la compra (incluye cliente) y la URL del comprobante', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });

    const respuesta = await invocar('GET', { token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.cliente).toEqual(compraEnRevision.cliente);
    expect(cuerpo.urlComprobante).toBe('https://s3.amazonaws.com/presignada');
  });

  it('no incluye urlComprobante si todavía no hay comprobanteKey', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraEnRevision, comprobanteKey: undefined }] });

    const respuesta = await invocar('GET', { token: 'token-x' });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.urlComprobante).toBeUndefined();
    expect(clienteS3SendMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/aprobaciones/:token/aprobar', () => {
  it('transiciona a aprobada y confirma el aforo', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    confirmarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
    expect(confirmarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      UpdateExpression: 'SET estado = :aprobada, resueltoPor = :resueltoPor, resueltoEn = :ahora REMOVE expiraEn',
      ConditionExpression: 'estado = :enRevision',
    });
    // Defensa adicional: aunque comprobantes.ts ya debería haberlo quitado,
    // un REMOVE de más nunca falla (MEMORY.md §7).
    expect(comandoUpdate.input.UpdateExpression).toContain('REMOVE expiraEn');
  });

  it('emite las boletas con emitirBoletas (sin reimplementar boleteria.ts) y notifica al cliente con un enlace por boleta', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    confirmarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(emitirBoletasMock).toHaveBeenCalledWith({
      compraId: 'compra-1',
      eventoId: 'evt-1',
      etapaId: 'et-1',
      montoTotal: 90000,
      cantidad: 2,
    });
    expect(enviarMock).toHaveBeenCalledTimes(1);
    const [destinatario, plantilla, datos] = enviarMock.mock.calls[0] ?? [];
    expect(destinatario).toEqual({ correo: 'ana@correo.com', nombre: 'Ana Pérez' });
    expect(plantilla).toBe('boletas_emitidas');
    expect(datos.nombreEvento).toBe('Concierto de jazz');
    expect(datos.urlsBoletas).toHaveLength(2);
    expect(datos.urlsBoletas[0]).toContain('/boleta/bol-1.');
    expect(datos.urlsBoletas[1]).toContain('/boleta/bol-2.');
  });

  it('responde 409 si otro productor ya la resolvió (condición fallida)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(409);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });

  it('responde 200 igual si confirmarSillas lanza ErrorAforo (no debería pasar, pero no revierte la aprobación)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    confirmarSillasMock.mockRejectedValueOnce(new ErrorAforo('inesperado'));
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
  });

  it('responde 200 aunque emitirBoletas falle (best-effort, la aprobación ya es válida)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    confirmarSillasMock.mockResolvedValueOnce(undefined);
    emitirBoletasMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('responde 200 aunque la notificación de boletas emitidas falle (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    confirmarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });
    enviarMock.mockRejectedValueOnce(new Error('SES no disponible'));

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
  });

  it('responde 410 si el token ya venció, sin llegar a escribir', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ ...compraEnRevision, tokenAprobacionExpiraEn: AHORA_EPOCH - 1 }] });

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/aprobar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(410);
    expect(confirmarSillasMock).not.toHaveBeenCalled();
    expect(emitirBoletasMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/aprobaciones/:token/rechazar', () => {
  it('transiciona a rechazada, libera el aforo y notifica al cliente con el motivo', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar('POST', {
      rawPath: '/api/aprobaciones/token-x/rechazar',
      token: 'token-x',
      cuerpo: { motivo: 'El comprobante no corresponde al monto' },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(liberarSillasMock).toHaveBeenCalledWith('evt-1', 2);
    expect(enviarMock).toHaveBeenCalledWith(
      { correo: 'ana@correo.com', nombre: 'Ana Pérez' },
      'compra_rechazada',
      { nombreEvento: 'Concierto de jazz', cantidad: 2, motivo: 'El comprobante no corresponde al monto' },
    );
    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input).toMatchObject({
      UpdateExpression:
        'SET estado = :rechazada, resueltoPor = :resueltoPor, resueltoEn = :ahora, motivoRechazo = :motivo REMOVE expiraEn',
      ConditionExpression: 'estado = :enRevision',
    });
    // El motivo queda persistido en la compra, no solo en el correo (hotfix
    // pre-producción, 14/08/2026) — nunca se pierde si la petición gana la
    // carrera pero el correo llega a fallar más abajo.
    expect(comandoUpdate.input.ExpressionAttributeValues[':motivo']).toBe(
      'El comprobante no corresponde al monto',
    );
    // Defensa adicional, mismo criterio que aprobarCompra (MEMORY.md §7).
    expect(comandoUpdate.input.UpdateExpression).toContain('REMOVE expiraEn');
  });

  it('sin motivo, no agrega motivoRechazo al UpdateExpression', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    await invocar('POST', { rawPath: '/api/aprobaciones/token-x/rechazar', token: 'token-x' });

    const comandoUpdate = sendMock.mock.calls[1]?.[0];
    expect(comandoUpdate.input.UpdateExpression).not.toContain('motivoRechazo');
    expect(comandoUpdate.input.ExpressionAttributeValues[':motivo']).toBeUndefined();
  });

  it('funciona sin motivo', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/rechazar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
    const llamada = enviarMock.mock.calls[0]?.[2];
    expect(llamada.motivo).toBeUndefined();
  });

  it('responde 409 si ya fue resuelta (condición fallida)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/rechazar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(409);
    expect(liberarSillasMock).not.toHaveBeenCalled();
  });

  it('responde 200 aunque liberarSillas lance ErrorAforo', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockRejectedValueOnce(new ErrorAforo('inesperado'));
    sendMock.mockResolvedValueOnce({ Item: { nombre: 'Concierto de jazz' } });

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/rechazar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
  });

  it('responde 200 aunque la notificación al cliente falle (best-effort)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [compraEnRevision] });
    sendMock.mockResolvedValueOnce({});
    liberarSillasMock.mockResolvedValueOnce(undefined);
    sendMock.mockRejectedValueOnce(new Error('DynamoDB no disponible'));

    const respuesta = await invocar('POST', { rawPath: '/api/aprobaciones/token-x/rechazar', token: 'token-x' });

    expect(respuesta.statusCode).toBe(200);
  });
});
