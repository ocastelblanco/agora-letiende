import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: verifyIdTokenMock }),
}));

import {
  ErrorAutenticacion,
  VIGENCIA_REVISION_REVOCACION_MS,
  reiniciarCacheRevocacion,
  verificarToken,
} from './verificar-token';

function errorFirebase(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  verifyIdTokenMock.mockReset();
  reiniciarCacheRevocacion();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verificarToken', () => {
  it('devuelve el correo de un token válido con email_verified', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ email: 'ana@letiende.co', email_verified: true });

    await expect(verificarToken('Bearer token-valido')).resolves.toBe('ana@letiende.co');
  });

  it('pide a Firebase comprobar la revocación (checkRevoked)', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ email: 'ana@letiende.co', email_verified: true });

    await verificarToken('Bearer token-valido');

    expect(verifyIdTokenMock).toHaveBeenCalledWith('token-valido', true);
  });

  it.each([false, undefined])('rechaza un token con email_verified = %j', async (verificado) => {
    verifyIdTokenMock.mockResolvedValueOnce({ email: 'ana@letiende.co', email_verified: verificado });

    await expect(verificarToken('Bearer token')).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('rechaza un token sin correo', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ email_verified: true });

    await expect(verificarToken('Bearer token')).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it.each(['auth/id-token-revoked', 'auth/user-disabled', 'auth/id-token-expired', 'auth/argument-error'])(
    'traduce %s a ErrorAutenticacion sin exponer el mensaje de Firebase',
    async (codigo) => {
      verifyIdTokenMock.mockRejectedValueOnce(errorFirebase(codigo));

      const error = await verificarToken('Bearer token').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorAutenticacion);
      expect((error as Error).message).not.toContain(codigo);
    },
  );

  it.each([undefined, '', 'Basic abc', 'Bearer ', 'Bearer    '])(
    'rechaza el encabezado %j sin llamar a Firebase',
    async (encabezado) => {
      await expect(verificarToken(encabezado)).rejects.toBeInstanceOf(ErrorAutenticacion);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
    },
  );
});

describe('caché de la revisión de revocación', () => {
  const tokenValido = { email: 'portero@letiende.co', email_verified: true };

  it('revisa la revocación la primera vez y la omite con el mismo token dentro de la vigencia', async () => {
    vi.useFakeTimers();
    verifyIdTokenMock.mockResolvedValue(tokenValido);

    await verificarToken('Bearer token-a');
    vi.advanceTimersByTime(VIGENCIA_REVISION_REVOCACION_MS - 1);
    await verificarToken('Bearer token-a');

    expect(verifyIdTokenMock.mock.calls).toEqual([
      ['token-a', true],
      ['token-a', false],
    ]);
  });

  it('vuelve a revisar al vencer la vigencia', async () => {
    vi.useFakeTimers();
    verifyIdTokenMock.mockResolvedValue(tokenValido);

    await verificarToken('Bearer token-a');
    vi.advanceTimersByTime(VIGENCIA_REVISION_REVOCACION_MS);
    await verificarToken('Bearer token-a');

    expect(verifyIdTokenMock.mock.calls[1]).toEqual(['token-a', true]);
  });

  it('cada token se revisa por separado', async () => {
    verifyIdTokenMock.mockResolvedValue(tokenValido);

    await verificarToken('Bearer token-a');
    await verificarToken('Bearer token-b');

    expect(verifyIdTokenMock.mock.calls).toEqual([
      ['token-a', true],
      ['token-b', true],
    ]);
  });

  it('no guarda en caché un token rechazado: la siguiente petición vuelve a revisar', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(errorFirebase('auth/id-token-revoked'));
    verifyIdTokenMock.mockResolvedValueOnce(tokenValido);

    await expect(verificarToken('Bearer token-a')).rejects.toBeInstanceOf(ErrorAutenticacion);
    await verificarToken('Bearer token-a');

    expect(verifyIdTokenMock.mock.calls[1]).toEqual(['token-a', true]);
  });

  it('no guarda en caché un token sin correo verificado', async () => {
    verifyIdTokenMock.mockResolvedValueOnce({ email: 'x@correo.com', email_verified: false });
    verifyIdTokenMock.mockResolvedValueOnce(tokenValido);

    await expect(verificarToken('Bearer token-a')).rejects.toBeInstanceOf(ErrorAutenticacion);
    await verificarToken('Bearer token-a');

    expect(verifyIdTokenMock.mock.calls[1]).toEqual(['token-a', true]);
  });
});
