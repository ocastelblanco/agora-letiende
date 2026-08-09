import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { User } from 'firebase/auth';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import type { Rol } from '../../core/models/usuario.model';
import { BarraNavegacionComponent } from './barra-navegacion.component';

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
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ServicioAuth,
        useValue: {
          usuarioActual: () => usuarioActual,
          rol: () => rol,
          cerrarSesion: cerrarSesionMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<BarraNavegacionComponent> =
    TestBed.createComponent(BarraNavegacionComponent);
  fixture.detectChanges();

  return { fixture, cerrarSesionMock };
}

describe('BarraNavegacionComponent', () => {
  it('sin sesión: solo muestra el logo y "Ingresar", sin secciones ni avatar', () => {
    const { fixture } = configurarPrueba(null, null);
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Ingresar');
    expect(texto).not.toContain('Cerrar sesión');
    expect(fixture.nativeElement.querySelectorAll('nav a').length).toBe(0);
  });

  it('administrador ve Cartelera, Eventos y Usuarios', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Cartelera');
    expect(texto).toContain('Eventos');
    expect(texto).toContain('Usuarios');
    expect(texto).toContain('Cerrar sesión');
  });

  it('portero ve Cartelera y Puerta, pero no las secciones de productor/administrador', () => {
    const usuario = { displayName: 'Pedro Portero', email: 'pedro@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'portero');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Cartelera');
    expect(texto).toContain('Efectivo');
    expect(texto).toContain('Puerta');
    expect(texto).not.toContain('Aprobaciones');
    expect(texto).not.toContain('Eventos');
    expect(texto).not.toContain('Usuarios');
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
});
