import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { User } from 'firebase/auth';
import { ErrorInicioSesion, ServicioAuth } from './servicio-auth';

const {
  initializeAppMock,
  getAuthMock,
  onAuthStateChangedMock,
  signInWithPopupMock,
  signOutMock,
  setCustomParametersMock,
  GoogleAuthProviderMock,
} = vi.hoisted(() => {
  const setCustomParametersMock = vi.fn();
  return {
    initializeAppMock: vi.fn(() => ({})),
    getAuthMock: vi.fn(() => ({})),
    onAuthStateChangedMock: vi.fn(),
    signInWithPopupMock: vi.fn(),
    signOutMock: vi.fn(),
    setCustomParametersMock,
    GoogleAuthProviderMock: vi.fn(function () {
      return { setCustomParameters: setCustomParametersMock };
    }),
  };
});

vi.mock('firebase/app', () => ({ initializeApp: initializeAppMock }));
vi.mock('firebase/auth', () => ({
  getAuth: getAuthMock,
  onAuthStateChanged: onAuthStateChangedMock,
  signInWithPopup: signInWithPopupMock,
  signOut: signOutMock,
  GoogleAuthProvider: GoogleAuthProviderMock,
}));

describe('ServicioAuth', () => {
  const usuarioFalso = {
    uid: 'uid-123',
    email: 'admin@letiende.co',
    getIdToken: vi.fn().mockResolvedValue('id-token'),
  } as unknown as User;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
    signOutMock.mockResolvedValue(undefined);
    // No-op por defecto: el listener de sesión no dispara solo, cada
    // prueba controla explícitamente cuándo simular un cambio de estado.
    onAuthStateChangedMock.mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('puebla usuarioActual y rol tras un login exitoso con perfil autorizado', async () => {
    signInWithPopupMock.mockResolvedValue({ user: usuarioFalso });
    const servicio = TestBed.inject(ServicioAuth);

    const promesa = servicio.iniciarSesionConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ email: 'admin@letiende.co', nombre: 'Admin', rol: 'administrador' });
    await promesa;

    expect(servicio.usuarioActual()).toEqual(usuarioFalso);
    expect(servicio.rol()).toBe('administrador');
  });

  it('fuerza el selector de cuentas de Google (prompt: select_account)', async () => {
    signInWithPopupMock.mockResolvedValue({ user: usuarioFalso });
    const servicio = TestBed.inject(ServicioAuth);

    const promesa = servicio.iniciarSesionConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ email: 'admin@letiende.co', nombre: 'Admin', rol: 'administrador' });
    await promesa;

    expect(setCustomParametersMock).toHaveBeenCalledWith({ prompt: 'select_account' });
  });

  it('cierra la sesión de Firebase y lanza ErrorInicioSesion cuando /api/usuarios/me responde 403', async () => {
    signInWithPopupMock.mockResolvedValue({ user: usuarioFalso });
    const servicio = TestBed.inject(ServicioAuth);

    const promesa = servicio.iniciarSesionConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ mensaje: 'No autorizado en Ágora' }, { status: 403, statusText: 'Forbidden' });

    await expect(promesa).rejects.toBeInstanceOf(ErrorInicioSesion);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(servicio.usuarioActual()).toBeNull();
    expect(servicio.rol()).toBeNull();
  });

  it('cierra la sesión también ante un error inesperado (no 403) durante el login', async () => {
    signInWithPopupMock.mockResolvedValue({ user: usuarioFalso });
    const servicio = TestBed.inject(ServicioAuth);

    const promesa = servicio.iniciarSesionConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ mensaje: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });

    await expect(promesa).rejects.toMatchObject({ razon: 'error' });
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('cerrarSesion invoca signOut de Firebase y limpia usuarioActual y rol', async () => {
    signInWithPopupMock.mockResolvedValue({ user: usuarioFalso });
    const servicio = TestBed.inject(ServicioAuth);

    const promesaLogin = servicio.iniciarSesionConGoogle();
    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ email: 'admin@letiende.co', nombre: 'Admin', rol: 'administrador' });
    await promesaLogin;
    expect(servicio.rol()).toBe('administrador');

    await servicio.cerrarSesion();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(servicio.usuarioActual()).toBeNull();
    expect(servicio.rol()).toBeNull();
  });

  it('cierra sesión automáticamente si una sesión restaurada ya no está autorizada (correo desactivado)', async () => {
    let callbackCapturado: ((usuario: User | null) => void) | undefined;
    onAuthStateChangedMock.mockImplementation(
      (_auth: unknown, callback: (usuario: User | null) => void) => {
        callbackCapturado = callback;
      },
    );

    const servicio = TestBed.inject(ServicioAuth);
    callbackCapturado?.(usuarioFalso);

    await Promise.resolve();
    await Promise.resolve();
    httpMock
      .expectOne('/api/usuarios/me')
      .flush({ mensaje: 'No autorizado' }, { status: 403, statusText: 'Forbidden' });
    await servicio.esperarListo();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(servicio.usuarioActual()).toBeNull();
    expect(servicio.rol()).toBeNull();
  });
});
