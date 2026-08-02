import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verificarIdTokenMock = vi.fn();
const sendMock = vi.fn();

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: verificarIdTokenMock }),
}));

vi.mock('../services/dynamodb', () => ({
  documentoDynamoDB: { send: sendMock },
}));

const { handler } = await import('./usuarios-me');

function crearEvento(authorization?: string): Parameters<typeof handler>[0] {
  return {
    headers: authorization ? { authorization } : {},
  } as Parameters<typeof handler>[0];
}

async function invocar(authorization?: string) {
  const respuesta = await handler(crearEvento(authorization), {} as never, undefined as never);
  return respuesta as { statusCode: number; body: string };
}

describe('handler de GET /api/usuarios/me', () => {
  beforeEach(() => {
    process.env['TABLA_USUARIOS'] = 'agora-usuarios-test';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('responde 401 si falta el encabezado Authorization', async () => {
    const respuesta = await invocar(undefined);
    expect(respuesta.statusCode).toBe(401);
  });

  it('responde 401 si el token es inválido', async () => {
    verificarIdTokenMock.mockRejectedValue(new Error('token malformado'));
    const respuesta = await invocar('Bearer token-malo');
    expect(respuesta.statusCode).toBe(401);
  });

  it('responde 403 si el correo no existe en agora-usuarios', async () => {
    verificarIdTokenMock.mockResolvedValue({ email: 'desconocido@letiende.co' });
    sendMock.mockResolvedValue({ Item: undefined });

    const respuesta = await invocar('Bearer token-valido');

    expect(respuesta.statusCode).toBe(403);
  });

  it('responde 403 si el correo existe pero está inactivo', async () => {
    verificarIdTokenMock.mockResolvedValue({ email: 'inactivo@letiende.co' });
    sendMock.mockResolvedValue({
      Item: {
        email: 'inactivo@letiende.co',
        nombre: 'Persona Inactiva',
        rol: 'portero',
        activo: false,
      },
    });

    const respuesta = await invocar('Bearer token-valido');

    expect(respuesta.statusCode).toBe(403);
  });

  it('responde 200 con email, nombre y rol si el correo es válido y activo', async () => {
    verificarIdTokenMock.mockResolvedValue({ email: 'admin@letiende.co' });
    sendMock.mockResolvedValue({
      Item: {
        email: 'admin@letiende.co',
        nombre: 'Administradora Ágora',
        rol: 'administrador',
        activo: true,
      },
    });

    const respuesta = await invocar('Bearer token-valido');

    expect(respuesta.statusCode).toBe(200);
    expect(JSON.parse(respuesta.body)).toEqual({
      email: 'admin@letiende.co',
      nombre: 'Administradora Ágora',
      rol: 'administrador',
    });
  });
});
