import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, verificarFirmaBoletaMock, exigirRolMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  verificarFirmaBoletaMock: vi.fn(),
  exigirRolMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../lib/firma-boletas', () => ({ verificarFirmaBoleta: verificarFirmaBoletaMock }));
vi.mock('../lib/autorizacion', () => ({ exigirRol: exigirRolMock }));

const { handler } = await import('./boletas');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const permisosPortero = {
  email: 'portero@letiende.co',
  nombre: 'Portero',
  rol: 'portero' as const,
  activo: true,
};

const boletaValida = {
  boletaId: 'bol-1',
  eventoId: 'evt-1',
  compraId: 'compra-1',
  numeroEnCompra: 1,
  etapaId: 'et-1',
  valorUnitario: 45000,
  estado: 'valida',
  emitidaEn: '2026-08-09T00:00:00.000Z',
};

const eventoConEtapa = {
  eventoId: 'evt-1',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  etapas: [{ etapaId: 'et-1', nombre: 'Preventa', precio: 45000, cierraEn: '2099-01-01T00:00:00.000Z', orden: 1 }],
};

const compraConCliente = {
  compraId: 'compra-1',
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
};

function crearPeticion(
  metodo: string,
  opciones: { codigo?: string; rawPath?: string; cuerpo?: unknown } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '',
    pathParameters: opciones.codigo ? { codigo: opciones.codigo } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, opciones?: Parameters<typeof crearPeticion>[1]) {
  const respuesta = await handler(crearPeticion(metodo, opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  sendMock.mockReset();
  verificarFirmaBoletaMock.mockReset();
  exigirRolMock.mockReset();
  exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosPortero });
  process.env['URL_BASE_APP'] = 'https://agora.letiende.co';
  process.env['BUCKET_ACTIVOS'] = 'agora-activos-test';
});

describe('GET /api/boletas/:codigo', () => {
  it('responde 400 si falta el código en la ruta', async () => {
    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 404 sin tocar DynamoDB si el código no tiene el formato {boletaId}.{firma}', async () => {
    const respuesta = await invocar('GET', { codigo: 'sin-punto' });

    expect(respuesta.statusCode).toBe(404);
    expect(verificarFirmaBoletaMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 404 sin tocar DynamoDB si la firma es inválida (rechazo barato, CLAUDE.md A02)', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(false);

    const respuesta = await invocar('GET', { codigo: 'bol-1.firma-invalida' });

    expect(respuesta.statusCode).toBe(404);
    expect(verificarFirmaBoletaMock).toHaveBeenCalledWith('bol-1', 'firma-invalida');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde el mismo mensaje genérico si la boleta no existe (sin distinguir de firma inválida)', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock.mockResolvedValueOnce({}); // GetCommand de la boleta: sin Item

    const respuestaFirmaInvalida = await invocar('GET', { codigo: 'bol-1.firma-mala' });
    verificarFirmaBoletaMock.mockReturnValueOnce(false);
    const respuestaInexistente = await invocar('GET', { codigo: 'bol-2.firma-buena' });

    const cuerpoA = JSON.parse(respuestaFirmaInvalida.body ?? '{}');
    const cuerpoB = JSON.parse(respuestaInexistente.body ?? '{}');
    expect(respuestaFirmaInvalida.statusCode).toBe(404);
    expect(respuestaInexistente.statusCode).toBe(404);
    expect(cuerpoA.mensaje).toBe(cuerpoB.mensaje);
  });

  it('devuelve los datos de la boleta digital con el QR en base64', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock
      .mockResolvedValueOnce({ Item: boletaValida })
      .mockResolvedValueOnce({ Item: eventoConEtapa })
      .mockResolvedValueOnce({ Item: compraConCliente });

    const respuesta = await invocar('GET', { codigo: 'bol-1.firma-buena' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.boletaId).toBe('bol-1');
    expect(cuerpo.numeroEnCompra).toBe(1);
    expect(cuerpo.estado).toBe('valida');
    expect(cuerpo.nombreEvento).toBe('Concierto de jazz');
    expect(cuerpo.etapaNombre).toBe('Preventa');
    expect(cuerpo.nombreCliente).toBe('Ana Pérez');
    expect(cuerpo.direccion).toBe('Bogotá, Colombia');
    expect(typeof cuerpo.qrPng).toBe('string');
    expect(cuerpo.qrPng.length).toBeGreaterThan(0);
  });

  it('no incluye logotipoUrl si el evento no tiene logotipoKey', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock
      .mockResolvedValueOnce({ Item: boletaValida })
      .mockResolvedValueOnce({ Item: eventoConEtapa })
      .mockResolvedValueOnce({ Item: compraConCliente });

    const respuesta = await invocar('GET', { codigo: 'bol-1.firma-buena' });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.logotipoUrl).toBeUndefined();
  });

  it('incluye logotipoUrl calculada a partir de logotipoKey si el evento lo tiene', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock
      .mockResolvedValueOnce({ Item: boletaValida })
      .mockResolvedValueOnce({ Item: { ...eventoConEtapa, logotipoKey: 'eventos/evt-1/logo.png' } })
      .mockResolvedValueOnce({ Item: compraConCliente });

    const respuesta = await invocar('GET', { codigo: 'bol-1.firma-buena' });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.logotipoUrl).toBe(
      'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/evt-1/logo.png',
    );
  });

  it('responde 405 para métodos distintos de GET', async () => {
    const respuesta = await invocar('POST', { codigo: 'bol-1.firma' });

    expect(respuesta.statusCode).toBe(405);
  });
});

describe('POST /api/boletas/:codigo/validar', () => {
  it('responde con la respuesta de exigirRol si no está autorizado', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 403, body: '{"mensaje":"No autorizado en Ágora"}' },
    });

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma/validar',
      codigo: 'bol-1.firma',
      cuerpo: { eventoId: 'evt-1' },
    });

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 400 si falta eventoId en el cuerpo', async () => {
    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma/validar',
      codigo: 'bol-1.firma',
      cuerpo: {},
    });

    expect(respuesta.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde NO_EXISTE sin tocar DynamoDB si la firma es inválida (rechazo barato)', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(false);

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma-mala/validar',
      codigo: 'bol-1.firma-mala',
      cuerpo: { eventoId: 'evt-1' },
    });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(respuesta.statusCode).toBe(200);
    expect(cuerpo.veredicto).toBe('NO_EXISTE');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('VALIDA: autoriza el ingreso con una única escritura condicional', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock.mockResolvedValueOnce({ Attributes: { ...boletaValida, estado: 'usada' } });

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma-buena/validar',
      codigo: 'bol-1.firma-buena',
      cuerpo: { eventoId: 'evt-1' },
    });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.veredicto).toBe('VALIDA');
    expect(cuerpo.numeroEnCompra).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      Key: { boletaId: 'bol-1' },
      UpdateExpression: 'SET estado = :usada, ingresoEn = :ahora, ingresoPor = :correo',
      ConditionExpression: 'estado = :valida AND eventoId = :eventoId',
    });
    expect(comando.input.ExpressionAttributeValues[':eventoId']).toBe('evt-1');
    expect(comando.input.ExpressionAttributeValues[':correo']).toBe('portero@letiende.co');
  });

  it('YA_USADA: condición falla porque la boleta ya se usó, responde con la hora del primer ingreso', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({
      Item: { ...boletaValida, estado: 'usada', ingresoEn: '2026-08-09T20:00:00.000Z' },
    });

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma-buena/validar',
      codigo: 'bol-1.firma-buena',
      cuerpo: { eventoId: 'evt-1' },
    });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(respuesta.statusCode).toBe(200);
    expect(cuerpo.veredicto).toBe('YA_USADA');
    expect(cuerpo.ingresoEn).toBe('2026-08-09T20:00:00.000Z');
  });

  it('OTRO_EVENTO: condición falla porque la boleta es de otro evento', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({ Item: { ...boletaValida, eventoId: 'evt-ajeno' } });

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-1.firma-buena/validar',
      codigo: 'bol-1.firma-buena',
      cuerpo: { eventoId: 'evt-1' },
    });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.veredicto).toBe('OTRO_EVENTO');
  });

  it('NO_EXISTE: condición falla y la boleta no existe en absoluto', async () => {
    verificarFirmaBoletaMock.mockReturnValueOnce(true);
    sendMock.mockRejectedValueOnce(new ConditionalCheckFailedException());
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocar('POST', {
      rawPath: '/api/boletas/bol-x.firma-buena/validar',
      codigo: 'bol-x.firma-buena',
      cuerpo: { eventoId: 'evt-1' },
    });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.veredicto).toBe('NO_EXISTE');
  });
});
