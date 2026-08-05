import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exigirRolMock, sendMock } = vi.hoisted(() => ({
  exigirRolMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('../lib/autorizacion', () => ({ exigirRol: exigirRolMock }));
vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const { handler } = await import('./usuarios');

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

function crearEvento(
  metodo: string,
  opciones: { emailObjetivo?: string; cuerpo?: unknown } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    pathParameters: opciones.emailObjetivo ? { email: opciones.emailObjetivo } : undefined,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, opciones?: { emailObjetivo?: string; cuerpo?: unknown }) {
  const respuesta = await handler(crearEvento(metodo, opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

describe('handler de /api/usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosAdmin });
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

  describe('GET /api/usuarios', () => {
    it('devuelve 200 con la lista de usuarios', async () => {
      sendMock.mockResolvedValue({ Items: [permisosAdmin] });

      const respuesta = await invocar('GET');

      expect(respuesta.statusCode).toBe(200);
      expect(JSON.parse(respuesta.body!)).toEqual([permisosAdmin]);
    });
  });

  describe('POST /api/usuarios', () => {
    it('crea el usuario y responde 201', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { email: 'nuevo@letiende.co', nombre: 'Nuevo', rol: 'portero' },
      });

      expect(respuesta.statusCode).toBe(201);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo).toMatchObject({
        email: 'nuevo@letiende.co',
        nombre: 'Nuevo',
        rol: 'portero',
        activo: true,
      });
    });

    it('responde 400 si falta un campo obligatorio', async () => {
      const respuesta = await invocar('POST', { cuerpo: { email: 'nuevo@letiende.co' } });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 400 si el rol no es válido', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { email: 'nuevo@letiende.co', nombre: 'Nuevo', rol: 'superadmin' },
      });

      expect(respuesta.statusCode).toBe(400);
    });

    it('responde 409 si el correo ya existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('POST', {
        cuerpo: { email: 'admin@letiende.co', nombre: 'Admin', rol: 'administrador' },
      });

      expect(respuesta.statusCode).toBe(409);
    });
  });

  describe('PUT /api/usuarios/:email', () => {
    it('actualiza el usuario y responde 200', async () => {
      sendMock.mockResolvedValue({
        Attributes: { email: 'otro@letiende.co', nombre: 'Otro', rol: 'portero', activo: true },
      });

      const respuesta = await invocar('PUT', {
        emailObjetivo: 'otro@letiende.co',
        cuerpo: { nombre: 'Otro' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('responde 400 si un administrador intenta degradar su propio rol', async () => {
      const respuesta = await invocar('PUT', {
        emailObjetivo: 'admin@letiende.co',
        cuerpo: { rol: 'portero' },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('permite que un administrador actualice otros campos propios sin tocar el rol', async () => {
      sendMock.mockResolvedValue({
        Attributes: {
          email: 'admin@letiende.co',
          nombre: 'Admin Nuevo',
          rol: 'administrador',
          activo: true,
        },
      });

      const respuesta = await invocar('PUT', {
        emailObjetivo: 'admin@letiende.co',
        cuerpo: { nombre: 'Admin Nuevo' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('responde 404 si el correo no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('PUT', {
        emailObjetivo: 'inexistente@letiende.co',
        cuerpo: { nombre: 'X' },
      });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 400 si el cuerpo no trae ningún campo para actualizar', async () => {
      const respuesta = await invocar('PUT', { emailObjetivo: 'otro@letiende.co', cuerpo: {} });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/usuarios/:email', () => {
    it('elimina el usuario y responde 204', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('DELETE', { emailObjetivo: 'otro@letiende.co' });

      expect(respuesta.statusCode).toBe(204);
    });

    it('responde 400 si un administrador intenta eliminarse a sí mismo', async () => {
      const respuesta = await invocar('DELETE', { emailObjetivo: 'admin@letiende.co' });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 404 si el correo no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('DELETE', { emailObjetivo: 'inexistente@letiende.co' });

      expect(respuesta.statusCode).toBe(404);
    });
  });

  it('responde 405 para un método no soportado', async () => {
    const respuesta = await invocar('PATCH');

    expect(respuesta.statusCode).toBe(405);
  });
});
