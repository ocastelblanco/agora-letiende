import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ErrorInicioSesion, ServicioAuth } from '../../core/auth/servicio-auth';

/**
 * Pantalla de ingreso con Google (tech-specs.md §4.2, ruta pública
 * `/login`). El manejo de errores nunca expone detalles internos ni el
 * mensaje crudo del SDK de Firebase al usuario (CLAUDE.md §5, A05).
 */
@Component({
  selector: 'app-login',
  template: `
    <div class="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      <div
        class="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-[0_4px_16px_rgba(35,12,0,0.08)]"
      >
        <img src="/logo_negro_sin_fondo.svg" alt="Le Tiende" class="mx-auto mb-3 h-auto w-36" />
        <h1 class="mb-8 text-2xl font-bold text-primary">Ágora</h1>

        <button
          type="button"
          class="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-4 text-sm font-semibold tracking-wider text-neutral uppercase transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="cargando()"
          (click)="ingresarConGoogle()"
        >
          @if (cargando()) {
            <span
              class="h-5 w-5 animate-spin rounded-full border-2 border-neutral/30 border-t-neutral"
              aria-hidden="true"
            ></span>
          } @else {
            <svg class="h-5 w-5" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
              <path
                d="M473.16,221.48l-2.26-9.59H262.46v88.22H387c-12.93,61.4-72.93,93.72-121.94,93.72-35.66,0-73.25-15-98.13-39.11a140.08,140.08,0,0,1-41.8-98.88c0-37.16,16.7-74.33,41-98.78s61-38.13,97.49-38.13c41.79,0,71.74,22.19,82.94,32.31l62.69-62.36C390.86,72.72,340.34,32,261.6,32h0c-60.75,0-119,23.27-161.58,65.71C58,139.5,36.25,199.93,36.25,256S56.83,369.48,97.55,411.6C141.06,456.52,202.68,480,266.13,480c57.73,0,112.45-22.62,151.45-63.66,38.34-40.4,58.17-96.3,58.17-154.9C475.75,236.77,473.27,222.12,473.16,221.48Z"
              />
            </svg>
          }
          {{ cargando() ? 'Ingresando…' : 'Ingresar con Google' }}
        </button>

        @if (mensajeError()) {
          <p class="mt-4 text-sm text-danger">{{ mensajeError() }}</p>
        }
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly router = inject(Router);

  protected readonly cargando = signal(false);
  protected readonly mensajeError = signal<string | null>(null);

  protected async ingresarConGoogle(): Promise<void> {
    this.cargando.set(true);
    this.mensajeError.set(null);

    try {
      await this.servicioAuth.iniciarSesionConGoogle();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.mensajeError.set(
        error instanceof ErrorInicioSesion
          ? error.message
          : 'No se pudo iniciar sesión. Intenta de nuevo.',
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
