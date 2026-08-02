import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { ServicioAuth } from '../auth/servicio-auth';
import { guardiaAuth } from './guardia-auth';

const urlTreeFalso = { esUrlTree: true };

function configurarPrueba(usuarioActual: User | null, rol: string | null) {
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

describe('guardiaAuth', () => {
  it('redirige a /login cuando no hay sesión', async () => {
    const { createUrlTreeMock } = configurarPrueba(null, null);

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaAuth({} as never, {} as never),
    );

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });

  it('redirige a /login cuando hay identidad de Firebase pero el rol todavía no se resolvió (no autorizado)', async () => {
    const usuarioFalso = { uid: 'uid-1' } as User;
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, null);

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaAuth({} as never, {} as never),
    );

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });

  it('permite el acceso cuando hay sesión autorizada (usuario y rol resueltos)', async () => {
    const usuarioFalso = { uid: 'uid-1' } as User;
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'portero');

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaAuth({} as never, {} as never),
    );

    expect(resultado).toBe(true);
    expect(createUrlTreeMock).not.toHaveBeenCalled();
  });
});
