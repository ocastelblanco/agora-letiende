import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exigirRolMock, sendMock, clienteS3SendMock, getSignedUrlMock } = vi.hoisted(() => ({
  exigirRolMock: vi.fn(),
  sendMock: vi.fn(),
  clienteS3SendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

// `tieneAccesoAlEvento` se reexporta desde la implementación real
// (`importOriginal`) — es lógica pura sin dependencias externas, así que no
// hace falta (ni conviene) reimplementarla a mano en el mock; solo
// `exigirRol` se reemplaza por el mock controlado desde cada test.
vi.mock('../lib/autorizacion', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/autorizacion')>();
  return { ...real, exigirRol: exigirRolMock };
});
vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../services/s3', () => ({ clienteS3: { send: clienteS3SendMock } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));

const { handler } = await import('./eventos');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const permisosAdmin = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador' as const,
  activo: true,
};

const permisosProductor = {
  email: 'productor@letiende.co',
  nombre: 'Productor',
  rol: 'productor' as const,
  activo: true,
};

const etapaValida = {
  nombre: 'Preventa',
  precio: 45000,
  cierraEn: '2026-09-01T00:00:00.000Z',
  orden: 1,
};

const eventoValido = {
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz en Le Tiende',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  maxBoletasPorCompra: 4,
  etapas: [etapaValida],
  mediosPago: ['efectivo'],
  productores: ['productor@letiende.co'],
};

function crearEvento(
  metodo: string,
  opciones: {
    rawPath?: string;
    eventoId?: string;
    cuerpo?: unknown;
    queryStringParameters?: Record<string, string>;
  } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/eventos',
    pathParameters: opciones.eventoId ? { eventoId: opciones.eventoId } : undefined,
    queryStringParameters: opciones.queryStringParameters,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(
  metodo: string,
  opciones?: {
    rawPath?: string;
    eventoId?: string;
    cuerpo?: unknown;
    queryStringParameters?: Record<string, string>;
  },
) {
  const respuesta = await handler(crearEvento(metodo, opciones), {} as never, undefined as never);
  return respuesta as {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
    isBase64Encoded?: boolean;
  };
}

describe('handler de /api/eventos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosAdmin });
    clienteS3SendMock.mockResolvedValue({ Contents: [] });
  });

  it('devuelve la respuesta de exigirRol tal cual cuando no está autorizado', async () => {
    exigirRolMock.mockResolvedValue({
      autorizado: false,
      respuesta: { statusCode: 403, body: JSON.stringify({ mensaje: 'No autorizado en Ágora' }) },
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  describe('GET /api/eventos', () => {
    it('devuelve 200 con la lista de eventos', async () => {
      sendMock.mockResolvedValue({ Items: [{ eventoId: 'e1' }] });

      const respuesta = await invocar('GET');

      expect(respuesta.statusCode).toBe(200);
      expect(JSON.parse(respuesta.body!)).toEqual([{ eventoId: 'e1' }]);
    });
  });

  describe('POST /api/eventos', () => {
    it('crea el evento con eventoId generado en el backend y aforo inicializado', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', { cuerpo: eventoValido });

      expect(respuesta.statusCode).toBe(201);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(typeof cuerpo.eventoId).toBe('string');
      expect(cuerpo.eventoId.length).toBeGreaterThan(0);
      expect(cuerpo.sillasDisponibles).toBe(100);
      expect(cuerpo.sillasReservadas).toBe(0);
      expect(cuerpo.estado).toBe('borrador');
      expect(cuerpo.etapas[0].etapaId).toEqual(expect.any(String));
    });

    it('ignora un eventoId enviado por el cliente y genera el suyo propio', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, eventoId: 'id-falso-del-cliente' },
      });

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.eventoId).not.toBe('id-falso-del-cliente');
    });

    it('ignora sillasDisponibles enviado por el cliente y lo inicializa desde sillasTotales', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, sillasDisponibles: 999999 },
      });

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.sillasDisponibles).toBe(100);
    });

    it('responde 400 si falta un campo obligatorio', async () => {
      const { nombre: _nombre, ...sinNombre } = eventoValido;
      const respuesta = await invocar('POST', { cuerpo: sinNombre });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 400 si el slug tiene un formato inválido', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, slug: 'Slug Inválido!' },
      });

      expect(respuesta.statusCode).toBe(400);
    });

    it('responde 400 si etapas está vacío', async () => {
      const respuesta = await invocar('POST', { cuerpo: { ...eventoValido, etapas: [] } });

      expect(respuesta.statusCode).toBe(400);
    });

    it('responde 400 si mediosPago trae un valor no reconocido', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, mediosPago: ['bitcoin'] },
      });

      expect(respuesta.statusCode).toBe(400);
    });

    // TODO.md Tarea 1 (T7): el documento de negocio exige al menos un
    // productor para guardar el evento — antes de esta tarea, [] era válido.
    describe('productores/porteros (TODO.md Tarea 1, T7)', () => {
      it('responde 400 si productores está vacío', async () => {
        const respuesta = await invocar('POST', { cuerpo: { ...eventoValido, productores: [] } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('responde 400 si falta productores en el payload (default [] rechazado)', async () => {
        const { productores: _productores, ...sinProductores } = eventoValido;
        const respuesta = await invocar('POST', { cuerpo: sinProductores });

        expect(respuesta.statusCode).toBe(400);
      });

      it('responde 400 si productores trae un correo inválido', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, productores: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('crea el evento con porteros vacío por defecto cuando no se envía en el payload', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', { cuerpo: eventoValido });

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.porteros).toEqual([]);
      });

      it('crea el evento con los porteros enviados', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, porteros: ['portero@letiende.co'] },
        });

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.porteros).toEqual(['portero@letiende.co']);
      });

      it('responde 400 si porteros trae un correo inválido', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, porteros: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
      });
    });

    it('responde 409 si el eventoId colisiona (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('POST', { cuerpo: eventoValido });

      expect(respuesta.statusCode).toBe(409);
    });
  });

  describe('PUT /api/eventos/:eventoId', () => {
    it('actualiza el evento y responde 200', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1', nombre: 'Nuevo nombre' } });

      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { nombre: 'Nuevo nombre' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('ignora sillasDisponibles y sillasTotales en el payload de edición', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

      await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { nombre: 'X', sillasDisponibles: 1, sillasTotales: 1 },
      });

      const comando = sendMock.mock.calls[0][0];
      expect(comando.input.UpdateExpression).not.toContain('sillasDisponibles');
      expect(comando.input.UpdateExpression).not.toContain('sillasTotales');
    });

    it('responde 400 si no hay campos para actualizar', async () => {
      const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: {} });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 400 si imagenKey no pertenece al prefijo del evento', async () => {
      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { imagenKey: 'eventos/otro-evento/foto.jpg' },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('acepta imagenKey cuando pertenece al prefijo del evento', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { imagenKey: 'eventos/e1/imagen-abc.jpg' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('responde 404 si el eventoId no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('PUT', { eventoId: 'inexistente', cuerpo: { nombre: 'X' } });

      expect(respuesta.statusCode).toBe(404);
    });

    describe('productores/porteros (TODO.md Tarea 1, T7)', () => {
      it('responde 400 si productores se edita a un arreglo vacío (el evento nunca puede quedar sin ninguno)', async () => {
        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { productores: [] } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('actualiza productores cuando el arreglo tiene al menos un correo válido', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { productores: ['nuevo@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(200);
        const comando = sendMock.mock.calls[0][0];
        expect(comando.input.ExpressionAttributeValues[':productores']).toEqual(['nuevo@letiende.co']);
      });

      it('acepta porteros vacío al editar (opcional, a diferencia de productores)', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { porteros: [] } });

        expect(respuesta.statusCode).toBe(200);
      });

      it('actualiza porteros con los correos enviados', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { porteros: ['portero@letiende.co'] } });

        const comando = sendMock.mock.calls[0][0];
        expect(comando.input.ExpressionAttributeValues[':porteros']).toEqual(['portero@letiende.co']);
      });

      it('responde 400 si porteros trae un correo inválido, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { porteros: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('etapaId estable (TODO.md Tarea 2)', () => {
      it('reenviar el etapaId de una etapa existente no genera uno nuevo', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida, etapaId: 'et1' }] },
        });

        expect(sendMock).toHaveBeenCalledTimes(2);
        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':etapas'][0].etapaId).toBe('et1');
      });

      it('una etapa nueva (sin etapaId) recibe un etapaId nuevo generado por el backend', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida }] },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapaEnviada = comandoUpdate.input.ExpressionAttributeValues[':etapas'][0];
        expect(typeof etapaEnviada.etapaId).toBe('string');
        expect(etapaEnviada.etapaId).not.toBe('et1');
      });

      it('un etapaId que no pertenece al evento (inventado/obsoleto) se descarta y se genera uno nuevo', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida, etapaId: 'etapa-inventada' }] },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapaEnviada = comandoUpdate.input.ExpressionAttributeValues[':etapas'][0];
        expect(etapaEnviada.etapaId).not.toBe('etapa-inventada');
      });

      it('dos etapas del payload que reenvían el mismo etapaId existente no terminan con la misma identidad', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: {
            etapas: [
              { ...etapaValida, etapaId: 'et1' },
              { ...etapaValida, nombre: 'General', etapaId: 'et1' },
            ],
          },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapasEnviadas = comandoUpdate.input.ExpressionAttributeValues[':etapas'];
        expect(etapasEnviadas[0].etapaId).toBe('et1');
        expect(etapasEnviadas[1].etapaId).not.toBe('et1');
        expect(typeof etapasEnviadas[1].etapaId).toBe('string');
      });

      it('responde 404 y no llega al UpdateCommand si el eventoId no existe', async () => {
        sendMock.mockResolvedValueOnce({ Item: undefined });

        const respuesta = await invocar('PUT', {
          eventoId: 'inexistente',
          cuerpo: { etapas: [etapaValida] },
        });

        expect(respuesta.statusCode).toBe(404);
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('un PUT sin etapas en el payload no hace ningún GetCommand extra', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1', nombre: 'X' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { nombre: 'X' } });

        expect(sendMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('DELETE /api/eventos/:eventoId', () => {
    it('elimina el evento y responde 204', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('DELETE', { eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(204);
    });

    it('responde 404 si el eventoId no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('DELETE', { eventoId: 'inexistente' });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 400 si falta el eventoId en la ruta', async () => {
      const respuesta = await invocar('DELETE', {});

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('lista y borra los activos de S3 bajo el prefijo del evento', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'eventos/e1/imagen-abc.png' }, { Key: 'eventos/e1/logotipo-def.png' }],
        })
        .mockResolvedValueOnce({});

      await invocar('DELETE', { eventoId: 'e1' });

      expect(clienteS3SendMock).toHaveBeenCalledTimes(2);
      const comandoListar = clienteS3SendMock.mock.calls[0][0];
      expect(comandoListar.input.Prefix).toBe('eventos/e1/');
      const comandoBorrar = clienteS3SendMock.mock.calls[1][0];
      expect(comandoBorrar.input.Delete.Objects).toEqual([
        { Key: 'eventos/e1/imagen-abc.png' },
        { Key: 'eventos/e1/logotipo-def.png' },
      ]);
    });

    it('no intenta borrar objetos de S3 si el evento no tenía ninguno', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock.mockResolvedValue({ Contents: [] });

      await invocar('DELETE', { eventoId: 'e1' });

      expect(clienteS3SendMock).toHaveBeenCalledTimes(1);
    });

    it('responde 204 aunque falle la limpieza de S3 (best-effort)', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock.mockRejectedValue(new Error('S3 no disponible'));

      const respuesta = await invocar('DELETE', { eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(204);
    });
  });

  describe('POST /api/eventos/:eventoId/activos/url-carga', () => {
    // TODO.md Tarea 1 (T6): generarUrlCargaActivo ahora lee el evento primero
    // para verificar tieneAccesoAlEvento — como admin tiene bypass, alcanza
    // con que el ítem exista.
    beforeEach(() => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1' } });
    });

    it('devuelve una URL prefirmada y una key bajo el prefijo del evento', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example.com/presignada');

      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(200);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.url).toBe('https://s3.example.com/presignada');
      expect(cuerpo.key.startsWith('eventos/e1/imagen-')).toBe(true);
    });

    it('responde 400 si el tipoMime es SVG', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/svg+xml', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });

    it('responde 400 si el tamaño excede el máximo permitido', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 999999999 },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });

    it('responde 400 si tipo no es imagen ni logotipo', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'video', tipoMime: 'image/png', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(400);
    });
  });

  describe('GET /api/eventos/:eventoId/qr', () => {
    it('devuelve un SVG que codifica la URL pública del slug real leído de DynamoDB', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'concierto-jazz' } });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('image/svg+xml');
      expect(respuesta.headers?.['Content-Disposition']).toContain('qr-concierto-jazz.svg');
      expect(respuesta.body).toContain('<svg');
    });

    it('devuelve PNG en base64 cuando formato=png', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'concierto-jazz' } });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos/e1/qr',
        eventoId: 'e1',
        queryStringParameters: { formato: 'png' },
      });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('image/png');
      expect(respuesta.headers?.['Content-Disposition']).toContain('qr-concierto-jazz.png');
      expect(respuesta.isBase64Encoded).toBe(true);
      const primerosBytes = Buffer.from(respuesta.body!, 'base64').subarray(0, 4);
      expect(primerosBytes).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    it('nunca usa un slug de la ruta o el payload — solo el que lee de DynamoDB', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'slug-real-en-bd' } });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

      expect(respuesta.body).toContain('<svg');
      const comandoGet = sendMock.mock.calls[0][0];
      expect(comandoGet.input.Key).toEqual({ eventoId: 'e1' });
    });

    it('responde 404 si el evento no existe', async () => {
      sendMock.mockResolvedValue({ Item: undefined });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/inexistente/qr', eventoId: 'inexistente' });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 400 si formato no es svg ni png', async () => {
      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos/e1/qr',
        eventoId: 'e1',
        queryStringParameters: { formato: 'jpg' },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it('responde 405 para un método no soportado', async () => {
    const respuesta = await invocar('PATCH');

    expect(respuesta.statusCode).toBe(405);
  });

  describe('Alcance de productor (TODO.md Tarea 1, T6)', () => {
    beforeEach(() => {
      exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosProductor });
    });

    describe('GET /api/eventos', () => {
      it('como productor, solo devuelve los eventos donde está en productores', async () => {
        sendMock.mockResolvedValue({
          Items: [
            { eventoId: 'e1', productores: ['productor@letiende.co'] },
            { eventoId: 'e2', productores: ['otro@letiende.co'] },
            { eventoId: 'e3', productores: ['productor@letiende.co', 'otro@letiende.co'] },
          ],
        });

        const respuesta = await invocar('GET');

        expect(respuesta.statusCode).toBe(200);
        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.map((e: { eventoId: string }) => e.eventoId)).toEqual(['e1', 'e3']);
      });

      it('como administrador, sigue devolviendo todos los eventos (regresión)', async () => {
        exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosAdmin });
        sendMock.mockResolvedValue({
          Items: [
            { eventoId: 'e1', productores: ['productor@letiende.co'] },
            { eventoId: 'e2', productores: ['otro@letiende.co'] },
          ],
        });

        const respuesta = await invocar('GET');

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.map((e: { eventoId: string }) => e.eventoId)).toEqual(['e1', 'e2']);
      });
    });

    describe('PUT /api/eventos/:eventoId', () => {
      it('productor asignado, solo con campos permitidos: éxito', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['productor@letiende.co'] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1', maxBoletasPorCompra: 6 } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor con un campo no permitido en el payload: 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { nombre: 'Otro nombre' },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "etapas" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [etapaValida] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "estado" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { estado: 'publicado' },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      // TODO.md Tarea 1 (T7): ni productores ni porteros entran a
      // CAMPOS_EDITABLES_PRODUCTOR — un productor sigue sin poder tocarlos,
      // sin cambios respecto de T6.
      it('productor con "productores" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { productores: ['otro@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "porteros" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { porteros: ['portero@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor NO asignado al evento: 403', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['otro@letiende.co'] } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(403);
      });

      it('productor, evento inexistente: 404', async () => {
        sendMock.mockResolvedValueOnce({ Item: undefined });

        const respuesta = await invocar('PUT', {
          eventoId: 'inexistente',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(404);
      });
    });

    describe('POST /api/eventos (crear)', () => {
      it('como productor: 403, sin llegar a DynamoDB', async () => {
        const respuesta = await invocar('POST', { cuerpo: eventoValido });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/eventos/:eventoId', () => {
      it('como productor: 403, sin llegar a DynamoDB', async () => {
        const respuesta = await invocar('DELETE', { eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('POST /api/eventos/:eventoId/activos/url-carga', () => {
      it('productor asignado: éxito', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['productor@letiende.co'] } });
        getSignedUrlMock.mockResolvedValue('https://s3.example.com/presignada');

        const respuesta = await invocar('POST', {
          rawPath: '/api/eventos/e1/activos/url-carga',
          eventoId: 'e1',
          cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
        });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor NO asignado: 403, sin generar URL prefirmada', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['otro@letiende.co'] } });

        const respuesta = await invocar('POST', {
          rawPath: '/api/eventos/e1/activos/url-carga',
          eventoId: 'e1',
          cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(getSignedUrlMock).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/eventos/:eventoId/qr', () => {
      it('productor asignado: éxito', async () => {
        sendMock.mockResolvedValue({
          Item: { eventoId: 'e1', slug: 'concierto-jazz', productores: ['productor@letiende.co'] },
        });

        const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor NO asignado: 403', async () => {
        sendMock.mockResolvedValue({
          Item: { eventoId: 'e1', slug: 'concierto-jazz', productores: ['otro@letiende.co'] },
        });

        const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(403);
      });
    });
  });
});
