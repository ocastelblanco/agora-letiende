import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import type { User } from 'firebase/auth';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { EventosService } from '../../../core/api/eventos.service';
import { routes } from '../../../app.routes';
import { EditarEventoComponent } from './editar-evento.component';

// Ver el mismo comentario en editar-evento.component.spec.ts:
// `servicio-auth.ts` importa el SDK real de Firebase a nivel de módulo.
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

/**
 * Extrae las entradas REALES de 'eventos/nuevo' y 'eventos/:id' de
 * `app.routes.ts` (mismo objeto `data`, mismo `canActivate`, mismo
 * `loadComponent`) — no una copia reescrita a mano. Así, si alguien borra
 * `id: 'nuevo'` de `data` en la ruta real (la causa exacta del bug
 * reportado: "Crear evento" navega a /mis-eventos/eventos/nuevo pero
 * `EditarEventoComponent` queda en modo edición con `id: undefined` y
 * muestra "No se encontró ese evento."), esta prueba lo detecta.
 *
 * Se montan como rutas de nivel raíz, sin el hub `MisEventosComponent`
 * (Angular Material Tabs) por encima: ese hub no participa en el mecanismo
 * bajo prueba (el enlace del parámetro `id` a un Signal input vía
 * `withComponentInputBinding()`, `RoutedComponentInputBinder`), y montarlo
 * obligaría a mockear `tabsVisiblesDeGrupo`/`ServicioAuth` para el hub sin
 * ganar cobertura real — mismo criterio de "réplica aislada de la mecánica
 * real del Router" que describe el docstring de `EditarEventoComponent`.
 */
function extraerRutasEventos() {
  const hubMisEventos = routes.find((ruta) => ruta.path === 'mis-eventos');
  const hijos = hubMisEventos?.children ?? [];
  const rutaNuevo = hijos.find((ruta) => ruta.path === 'eventos/nuevo');
  const rutaId = hijos.find((ruta) => ruta.path === 'eventos/:id');
  if (!rutaNuevo || !rutaId) {
    throw new Error('No se encontraron las rutas "eventos/nuevo" o "eventos/:id" en app.routes.ts');
  }
  return [rutaNuevo, rutaId];
}

describe('integración de Router — /eventos/nuevo enlaza el input `id` de EditarEventoComponent', () => {
  function configurarPrueba() {
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideRouter(extraerRutasEventos(), withComponentInputBinding()),
        {
          provide: ServicioAuth,
          useValue: {
            esperarListo: () => Promise.resolve(),
            usuarioActual: () => ({ uid: 'uid-1' }) as User,
            rol: () => 'administrador',
          },
        },
        {
          provide: EventosService,
          useValue: {
            eventos: () => [],
            error: () => false,
            cargarEventos: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    });
  }

  it('navegar a "eventos/nuevo" activa EditarEventoComponent en modo CREAR (regresión: antes quedaba en modo edición con `id` undefined y mostraba "No se encontró ese evento.")', async () => {
    configurarPrueba();
    const harness = await RouterTestingHarness.create();

    const componente = await harness.navigateByUrl('/eventos/nuevo', EditarEventoComponent);

    expect(componente['modoCrear']()).toBe(true);
    expect(componente['eventoId']()).toBeNull();
    expect(componente['eventoNoEncontrado']()).toBe(false);
  });
});
