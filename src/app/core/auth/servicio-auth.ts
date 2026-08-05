import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { PerfilUsuario, Rol } from '../models/usuario.model';

/** Sesión de Google iniciada, pero sin autorización (o sin poder verificarla) en Ágora. */
export class ErrorInicioSesion extends Error {
  constructor(readonly razon: 'no-autorizado' | 'error') {
    super(
      razon === 'no-autorizado'
        ? 'Esta cuenta no tiene acceso a Ágora.'
        : 'No se pudo verificar tu acceso. Intenta de nuevo.',
    );
  }
}

type ResultadoResolucionRol = 'autorizado' | 'no-autorizado' | 'error';

/**
 * Autenticación con Google vía Firebase Authentication (proyecto compartido
 * `comandante-letiende`, ADR-010) + resolución del rol de Ágora contra
 * `GET /api/usuarios/me` (server/api/handlers/usuarios-me.ts). Estar
 * autenticado en el proyecto Firebase compartido no implica ninguna
 * autorización en Ágora (CLAUDE.md §5, A01/A07) — `rol()` solo queda en un
 * valor no nulo cuando el backend confirmó que el correo existe y está
 * activo en `agora-usuarios`.
 *
 * La app/Auth de Firebase solo se inicializa en el navegador: el SDK
 * cliente depende de almacenamiento del navegador (IndexedDB) para la
 * persistencia de sesión, que no existe durante el renderizado en servidor
 * (Lambda `ssr`). En servidor, los Signals simplemente permanecen en `null`.
 */
@Injectable({ providedIn: 'root' })
export class ServicioAuth {
  private readonly esNavegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);

  private readonly appFirebase: FirebaseApp | null = this.esNavegador
    ? initializeApp(environment.firebase)
    : null;
  private readonly auth: Auth | null = this.appFirebase ? getAuth(this.appFirebase) : null;

  private readonly usuarioActualSignal = signal<User | null>(null);
  /** Identidad de Firebase del usuario actual (o `null`). Sin implicación de autorización. */
  readonly usuarioActual = this.usuarioActualSignal.asReadonly();

  private readonly rolSignal = signal<Rol | null>(null);
  /** Rol resuelto por `GET /api/usuarios/me` (o `null` si no hay sesión o no está autorizado). */
  readonly rol = this.rolSignal.asReadonly();

  private readonly cargandoSignal = signal(true);
  /** `true` hasta que Firebase determina el estado inicial de sesión. */
  readonly cargando = this.cargandoSignal.asReadonly();

  /**
   * `onAuthStateChanged` es asíncrono incluso para restaurar una sesión ya
   * persistida (IndexedDB) — leer los Signals inmediatamente después de
   * cargar la página da un falso `null`. `GuardiaAuth`/`GuardiaRol` deben
   * esperar `esperarListo()` antes de decidir.
   */
  private readonly listoPromise: Promise<void>;
  private resolverListo!: () => void;

  constructor() {
    this.listoPromise = new Promise<void>((resolve) => {
      this.resolverListo = resolve;
    });

    if (this.auth) {
      onAuthStateChanged(this.auth, async (usuario) => {
        this.usuarioActualSignal.set(usuario);

        if (usuario) {
          const resultado = await this.resolverRol(usuario);
          // Un correo que quedó desactivado en agora-usuarios entre sesión y
          // sesión no debe seguir viendo la app como autenticada al volver.
          if (resultado === 'no-autorizado' && this.auth) {
            await signOut(this.auth);
            this.usuarioActualSignal.set(null);
          }
        } else {
          this.rolSignal.set(null);
        }

        this.cargandoSignal.set(false);
        this.resolverListo();
      });
    } else {
      this.cargandoSignal.set(false);
    }
  }

  async esperarListo(): Promise<void> {
    if (!this.auth) {
      return;
    }
    await this.listoPromise;
  }

  /** Llama `GET /api/usuarios/me` con el ID Token del usuario y actualiza `rol()`. Nunca lanza. */
  private async resolverRol(usuario: User): Promise<ResultadoResolucionRol> {
    const idToken = await usuario.getIdToken();

    try {
      const perfil = await firstValueFrom(
        this.http.get<PerfilUsuario>('/api/usuarios/me', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.rolSignal.set(perfil.rol);
      return 'autorizado';
    } catch (error) {
      this.rolSignal.set(null);
      if (error instanceof HttpErrorResponse && error.status === 403) {
        return 'no-autorizado';
      }
      return 'error';
    }
  }

  /**
   * Abre el popup de Google Sign-In y resuelve el rol contra
   * `GET /api/usuarios/me`. Si la cuenta no está autorizada en Ágora (o no
   * se pudo verificar), cierra la sesión de Firebase inmediatamente y
   * lanza `ErrorInicioSesion` — nunca deja una sesión "a medias" (con
   * identidad de Firebase pero sin rol resuelto).
   *
   * `onAuthStateChanged` también procesará este mismo cambio de sesión de
   * forma independiente (y llamará a `resolverRol` otra vez) — la llamada
   * a `GET /api/usuarios/me` se duplica una vez por login explícito, un
   * costo aceptable (Lambda + DynamoDB `PAY_PER_REQUEST`, sin tráfico
   * recurrente) a cambio de no depender de la carrera entre ambos flujos
   * para saber si el login fue exitoso.
   */
  async iniciarSesionConGoogle(): Promise<void> {
    if (!this.auth) {
      throw new Error('El inicio de sesión solo está disponible en el navegador.');
    }

    const proveedor = new GoogleAuthProvider();
    // Sin este parámetro, Google puede auto-seleccionar la sesión "activa"
    // sin preguntar — lo forzamos para poder elegir siempre entre cuentas.
    proveedor.setCustomParameters({ prompt: 'select_account' });
    const credencial = await signInWithPopup(this.auth, proveedor);

    const resultado = await this.resolverRol(credencial.user);
    if (resultado !== 'autorizado') {
      await signOut(this.auth);
      this.usuarioActualSignal.set(null);
      throw new ErrorInicioSesion(resultado === 'no-autorizado' ? 'no-autorizado' : 'error');
    }

    this.usuarioActualSignal.set(credencial.user);
  }

  /** Cierra la sesión de Firebase y limpia todo el estado reactivo del cliente (CLAUDE.md §5, A07). */
  async cerrarSesion(): Promise<void> {
    if (this.auth) {
      await signOut(this.auth);
    }
    this.usuarioActualSignal.set(null);
    this.rolSignal.set(null);
  }

  /**
   * ID Token de Firebase del usuario actual, para enviar como
   * `Authorization: Bearer <token>` a cualquier endpoint de `/api/*`
   * (CLAUDE.md §5, A01/A07). `null` si no hay sesión activa. Espera
   * `esperarListo()` primero, mismo motivo que el resto de la clase.
   */
  async obtenerIdToken(): Promise<string | null> {
    await this.esperarListo();
    const usuario = this.usuarioActualSignal();
    if (!usuario) {
      return null;
    }
    return usuario.getIdToken();
  }
}
