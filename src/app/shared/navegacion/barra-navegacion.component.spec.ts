import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import type { User } from 'firebase/auth';
import { PanelService } from '../../core/api/panel.service';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import type { Rol } from '../../core/models/usuario.model';
import { BarraNavegacionComponent } from './barra-navegacion.component';

/** Componente vacío para registrar `/login` como ruta real en las pruebas que navegan. */
@Component({ selector: 'app-login-dummy', template: '' })
class ComponenteLoginDummy {}

// `servicio-auth.ts` (importado abajo solo como token de DI) importa el SDK
// real de Firebase a nivel de módulo — se mockea aquí para que este archivo
// nunca lo cargue de verdad (mismo motivo que en login.component.spec.ts).
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

function configurarPrueba(
  usuarioActual: User | null,
  rol: Rol | null,
  cerrarSesionMock = vi.fn().mockResolvedValue(undefined),
  limpiarPanelMock = vi.fn(),
  rutas: Routes = [],
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(rutas),
      {
        provide: ServicioAuth,
        useValue: {
          usuarioActual: () => usuarioActual,
          rol: () => rol,
          cerrarSesion: cerrarSesionMock,
        },
      },
      { provide: PanelService, useValue: { limpiar: limpiarPanelMock } },
    ],
  });

  const fixture: ComponentFixture<BarraNavegacionComponent> =
    TestBed.createComponent(BarraNavegacionComponent);
  fixture.detectChanges();

  return { fixture, cerrarSesionMock, limpiarPanelMock };
}

describe('BarraNavegacionComponent', () => {
  it('sin sesión: muestra el logo y el botón "Ingresar" como icon button accesible, sin secciones ni avatar', () => {
    const { fixture } = configurarPrueba(null, null);
    const texto = fixture.nativeElement.textContent as string;

    const enlaceIngresar = fixture.nativeElement.querySelector(
      'a[aria-label="Ingresar"]',
    ) as HTMLAnchorElement;
    expect(enlaceIngresar).toBeTruthy();
    expect(enlaceIngresar.getAttribute('href')).toBe('/login');
    expect(enlaceIngresar.textContent?.trim()).toBe('');
    expect(texto).not.toContain('Ingresar');
    expect(texto).not.toContain('Cerrar sesión');
    expect(fixture.nativeElement.querySelectorAll('nav a').length).toBe(0);
  });

  it('el botón "Ingresar" no se renderiza en /login (se confunde con "Ingresar con Google")', async () => {
    const { fixture } = configurarPrueba(null, null, undefined, undefined, [
      { path: 'login', component: ComponenteLoginDummy },
    ]);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/login');
    fixture.detectChanges();

    const enlaceIngresar = fixture.nativeElement.querySelector('a[aria-label="Ingresar"]');
    expect(enlaceIngresar).toBeNull();
  });

  it('administrador ve Eventos y Usuarios, pero ya no Cartelera (el logo del header ya enlaza a /)', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Eventos');
    expect(texto).toContain('Usuarios');
    expect(texto).toContain('Cerrar sesión');
  });

  it('portero ve Efectivo y Puerta, pero ya no Cartelera ni las secciones de productor/administrador', () => {
    const usuario = { displayName: 'Pedro Portero', email: 'pedro@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'portero');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('Puerta');
    expect(texto).not.toContain('Aprobaciones');
    expect(texto).not.toContain('Eventos');
    expect(texto).not.toContain('Usuarios');
  });

  it('productor tampoco ve Cartelera en el menú', () => {
    const usuario = { displayName: 'Paula Productora', email: 'paula@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'productor');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Panel');
    expect(texto).toContain('Aprobaciones');
  });

  it('muestra el avatar con photoURL con referrerpolicy="no-referrer"', () => {
    const usuario = {
      displayName: 'Ana Admin',
      email: 'ana@letiende.co',
      photoURL: 'https://lh3.googleusercontent.com/foto.jpg',
    } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');

    const img = fixture.nativeElement.querySelector('img[alt="Ana Admin"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('sin photoURL, muestra un avatar de respaldo con la inicial del nombre', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('A');
  });

  it('"Cerrar sesión" invoca servicioAuth.cerrarSesion() y navega a /login', async () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture, cerrarSesionMock } = configurarPrueba(usuario, 'administrador');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const botonCerrarSesion = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((boton) => boton.textContent?.includes('Cerrar sesión'));
    botonCerrarSesion?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(cerrarSesionMock).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('"Cerrar sesión" también limpia PanelService (datos personales de clientes, CLAUDE.md §5 A07)', async () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture, limpiarPanelMock } = configurarPrueba(usuario, 'administrador');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const botonCerrarSesion = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((boton) => boton.textContent?.includes('Cerrar sesión'));
    botonCerrarSesion?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(limpiarPanelMock).toHaveBeenCalledTimes(1);
  });
});
