import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { ServicioAuth } from '../auth/servicio-auth';
import type { Rol } from '../models/usuario.model';
import { guardiaRol } from './guardia-rol';

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

function rutaConRolMinimo(rolMinimo: Rol | undefined): ActivatedRouteSnapshot {
  return { data: { rolMinimo } } as unknown as ActivatedRouteSnapshot;
}

describe('guardiaRol', () => {
  it('redirige a /login cuando la ruta no declara rolMinimo', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'administrador');

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaRol(rutaConRolMinimo(undefined), {} as never),
    );

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });

  it('redirige a /login cuando no hay sesión autorizada', async () => {
    const { createUrlTreeMock } = configurarPrueba(null, null);

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaRol(rutaConRolMinimo('portero'), {} as never),
    );

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });

  it('redirige a /login cuando el rol actual no alcanza el rol mínimo de la ruta', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'portero');

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaRol(rutaConRolMinimo('administrador'), {} as never),
    );

    expect(resultado).toBe(urlTreeFalso);
    expect(createUrlTreeMock).toHaveBeenCalledWith(['/login']);
  });

  it('permite el acceso cuando el rol actual cumple el rol mínimo de la ruta', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'administrador');

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaRol(rutaConRolMinimo('productor'), {} as never),
    );

    expect(resultado).toBe(true);
    expect(createUrlTreeMock).not.toHaveBeenCalled();
  });

  it('permite el acceso cuando el rol actual es exactamente el rol mínimo de la ruta', async () => {
    const { createUrlTreeMock } = configurarPrueba(usuarioFalso, 'portero');

    const resultado = await TestBed.runInInjectionContext(() =>
      guardiaRol(rutaConRolMinimo('portero'), {} as never),
    );

    expect(resultado).toBe(true);
    expect(createUrlTreeMock).not.toHaveBeenCalled();
  });
});
