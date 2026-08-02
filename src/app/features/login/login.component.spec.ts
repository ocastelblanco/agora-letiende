import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ErrorInicioSesion, ServicioAuth } from '../../core/auth/servicio-auth';
import { LoginComponent } from './login.component';

// `servicio-auth.ts` (importado abajo solo como token de DI) importa el SDK
// real de Firebase a nivel de módulo — se mockea aquí para que este archivo
// nunca lo cargue de verdad (mismo motivo que en servicio-auth.spec.ts).
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

function configurarPrueba(iniciarSesionConGoogleMock = vi.fn().mockResolvedValue(undefined)) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ServicioAuth, useValue: { iniciarSesionConGoogle: iniciarSesionConGoogleMock } },
    ],
  });

  const fixture: ComponentFixture<LoginComponent> = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();

  return { fixture, iniciarSesionConGoogleMock };
}

describe('LoginComponent', () => {
  it('el botón de Google dispara iniciarSesionConGoogle y navega a / al tener éxito', async () => {
    const { fixture, iniciarSesionConGoogleMock } = configurarPrueba();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const boton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    boton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(iniciarSesionConGoogleMock).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('muestra el mensaje de ErrorInicioSesion sin exponer detalles internos', async () => {
    const { fixture } = configurarPrueba(
      vi.fn().mockRejectedValue(new ErrorInicioSesion('no-autorizado')),
    );

    const boton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    boton.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Esta cuenta no tiene acceso a Ágora.');
  });

  it('muestra un mensaje genérico ante un error inesperado', async () => {
    const { fixture } = configurarPrueba(vi.fn().mockRejectedValue(new Error('boom interno')));

    const boton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    boton.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'No se pudo iniciar sesión. Intenta de nuevo.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('boom interno');
  });
});
