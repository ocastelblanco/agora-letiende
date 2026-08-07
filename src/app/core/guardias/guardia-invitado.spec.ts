import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { ServicioAuth } from '../auth/servicio-auth';
import type { Rol } from '../models/usuario.model';
import { guardiaInvitado } from './guardia-invitado';

// Ver el mismo comentario en guardia-auth.spec.ts: `servicio-auth.ts`
// importa el SDK real de Firebase a nivel de módulo, y sin mockearlo aquí
// "envenena" el registro de módulos compartido entre archivos de prueba.
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(function () {
    return { setCustomParameters: vi.fn() };
  }),
}));

const urlTreeFalso = { esUrlTree: true };
const usuarioFalso = { uid: 'uid-1' } as User;

function configurarPrueba(usuarioActual: User | null, rol: Rol | null) {
  const createUrlTreeMock = vi.fn().mockReturnValue(urlTreeFalso);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ServicioAuth,
        useValue: {
          esperarListo: () => Promise.resolve(),
          usuarioActual: () => usuarioActual,
          rol: () => rol,
        },
      },
      { provide: Router, useValue: { createUrlTree: createUrlTreeMock } },
    ],
  });
  return { createUrlTreeMock };
}

describe('guardiaInvitado', () => {
  it('permite el acceso a /login cuando no hay sesión autorizada', async () => {
    const { createUrlTreeMock } = configurarPrueba(null, null);

    const resultado = await TestBed.runInInjectionContext(() => guardiaInvitado({} as never, {} as never));

    expect(resultado).toBe(true);
    expect(createUrlTreeMock).not.toHaveBeenCalled();
  });

  it('redirige a /admin/usuarios cuando ya hay sesión de administrador', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'administrador');

    const resultado = await TestBed.runInInjectionContext(() => guardiaInvitado({} as never, {} as never));

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/admin/usuarios']);
  });

  it('redirige a / cuando ya hay sesión de portero', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'portero');

    const resultado = await TestBed.runInInjectionContext(() => guardiaInvitado({} as never, {} as never));

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/']);
  });
});
