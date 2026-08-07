import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ServicioAuth } from './core/auth/servicio-auth';
import { App } from './app';

// `App` ahora incluye `BarraNavegacionComponent`, que inyecta `ServicioAuth`
// — que a su vez importa el SDK real de Firebase a nivel de módulo. Se
// mockea aquí por el mismo motivo que en login.component.spec.ts.
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

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: ServicioAuth,
          useValue: {
            usuarioActual: () => null,
            rol: () => null,
            cerrarSesion: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
