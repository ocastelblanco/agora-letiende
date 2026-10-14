import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock, sendMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: verifyIdTokenMock }),
}));

vi.mock('../services/dynamodb', () => ({
  documentoDynamoDB: { send: sendMock },
}));

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { exigirRol } from './autorizacion';
import { reiniciarCacheRevocacion } from './verificar-token';

const TOKEN = 'token-secreto-de-prueba';

function crearEvento(authorization?: string): APIGatewayProxyEventV2 {
  return {
    headers: authorization ? { authorization } : {},
    rawPath: '/api/eventos/evt-1/panel',
    requestContext: { http: { method: 'GET' } },
  } as unknown as APIGatewayProxyEventV2;
}

function tokenValido(email: string) {
  verifyIdTokenMock.mockResolvedValue({ email, email_verified: true });
}

function usuario(rol: string, activo = true) {
  sendMock.mockResolvedValue({ Item: { email: 'ana@letiende.co', nombre: 'Ana', rol, activo } });
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env['TABLA_USUARIOS'] = 'agora-usuarios-test';
  reiniciarCacheRevocacion();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.resetAllMocks();
  warnSpy.mockRestore();
});

function unicoLog(): Record<string, unknown> {
  expect(warnSpy).toHaveBeenCalledTimes(1);
  const [mensaje, datos] = warnSpy.mock.calls[0]!;
  expect(mensaje).toBe('Acceso rechazado');
  return datos as Record<string, unknown>;
}

describe('exigirRol registra cada rechazo', () => {
  it('sin token: 401 con motivo sin_token, ruta y método', async () => {
    const resultado = await exigirRol(crearEvento(), 'productor');

    expect(resultado.autorizado).toBe(false);
    expect(unicoLog()).toEqual({ motivo: 'sin_token', metodo: 'GET', ruta: '/api/eventos/evt-1/panel' });
  });

  it('token inválido: 401 con motivo token_invalido y sin el token en el log', async () => {
    verifyIdTokenMock.mockRejectedValue(new Error('auth/argument-error'));

    await exigirRol(crearEvento(`Bearer ${TOKEN}`), 'productor');

    expect(unicoLog()).toEqual({ motivo: 'token_invalido', metodo: 'GET', ruta: '/api/eventos/evt-1/panel' });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(TOKEN);
  });

  it('correo no registrado: 403 con motivo no_registrado y el correo', async () => {
    tokenValido('ana@letiende.co');
    sendMock.mockResolvedValue({ Item: undefined });

    await exigirRol(crearEvento(`Bearer ${TOKEN}`), 'portero');

    expect(unicoLog()).toEqual({
      motivo: 'no_registrado',
      metodo: 'GET',
      ruta: '/api/eventos/evt-1/panel',
      email: 'ana@letiende.co',
    });
  });

  it('usuario inactivo: 403 con motivo inactivo', async () => {
    tokenValido('ana@letiende.co');
    usuario('administrador', false);

    await exigirRol(crearEvento(`Bearer ${TOKEN}`), 'portero');

    expect(unicoLog()).toMatchObject({ motivo: 'inactivo', email: 'ana@letiende.co' });
  });

  it('rol insuficiente: 403 con el rol del usuario y el rol exigido', async () => {
    tokenValido('ana@letiende.co');
    usuario('portero');

    const resultado = await exigirRol(crearEvento(`Bearer ${TOKEN}`), 'administrador');

    expect(resultado.autorizado).toBe(false);
    expect(unicoLog()).toEqual({
      motivo: 'rol_insuficiente',
      metodo: 'GET',
      ruta: '/api/eventos/evt-1/panel',
      email: 'ana@letiende.co',
      rol: 'portero',
      rolMinimo: 'administrador',
    });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(TOKEN);
  });

  it('no registra nada cuando autoriza', async () => {
    tokenValido('ana@letiende.co');
    usuario('administrador');

    const resultado = await exigirRol(crearEvento(`Bearer ${TOKEN}`), 'productor');

    expect(resultado.autorizado).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
