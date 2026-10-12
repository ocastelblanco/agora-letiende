import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: verifyIdTokenMock }),
}));

import { ErrorAutenticacion, verificarToken } from './verificar-token';

function errorFirebase(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => {
  verifyIdTokenMock.mockReset();
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
