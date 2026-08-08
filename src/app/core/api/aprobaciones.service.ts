import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';

export interface CompraPendiente {
  compraId: string;
  nombreEvento: string;
  cantidad: number;
  montoTotal: number;
  creadaEn: string;
}

export interface ClienteCompra {
  nombre: string;
  telefono: string;
  correo: string;
}

export interface DetalleAprobacion {
  compraId: string;
  cantidad: number;
  montoTotal: number;
  cliente?: ClienteCompra;
  urlComprobante?: string;
}

export type ResultadoObtenerDetalle =
  | { exito: true; detalle: DetalleAprobacion }
  | { exito: false; error: string };

export type ResultadoResolverAprobacion = { exito: true } | { exito: false; error: string };

function mensajeError(error: unknown, mensajePorDefecto: string): string {
  return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
    ? error.error.mensaje
    : mensajePorDefecto;
}

/**
 * Cliente de `/api/aprobaciones` (tech-specs.md §5.1, TODO.md Tarea 2) —
 * dos superficies distintas en el mismo servicio: `cargarPendientes()`
 * exige sesión de equipo (mismo criterio que `EventosService`), mientras
 * que `obtenerDetalle`/`aprobar`/`rechazar` son públicos — el token del
 * enlace mágico en la URL es la única credencial, nunca `Authorization`
 * (mismo criterio que `ComprobantesService`).
 */
@Injectable({ providedIn: 'root' })
export class AprobacionesService {
  private readonly http = inject(HttpClient);
  private readonly servicioAuth = inject(ServicioAuth);

  private readonly pendientesSignal = signal<CompraPendiente[]>([]);
  readonly pendientes = this.pendientesSignal.asReadonly();

  private readonly errorSignal = signal(false);
  readonly error = this.errorSignal.asReadonly();

  /** Llama `GET /api/aprobaciones` con el ID Token actual. */
  async cargarPendientes(): Promise<void> {
    this.errorSignal.set(false);

    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      this.pendientesSignal.set([]);
      this.errorSignal.set(true);
      return;
    }

    try {
      const pendientes = await firstValueFrom(
        this.http.get<CompraPendiente[]>('/api/aprobaciones', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.pendientesSignal.set(pendientes);
    } catch {
      this.pendientesSignal.set([]);
      this.errorSignal.set(true);
    }
  }

  /** Llama `GET /api/aprobaciones/:token`. Público. */
  async obtenerDetalle(token: string): Promise<ResultadoObtenerDetalle> {
    try {
      const detalle = await firstValueFrom(
        this.http.get<DetalleAprobacion>(`/api/aprobaciones/${token}`),
      );
      return { exito: true, detalle };
    } catch (error) {
      return { exito: false, error: mensajeError(error, 'No se pudo cargar esta compra. Intenta de nuevo.') };
    }
  }

  /** Llama `POST /api/aprobaciones/:token/aprobar`. Público. */
  async aprobar(token: string): Promise<ResultadoResolverAprobacion> {
    try {
      await firstValueFrom(this.http.post(`/api/aprobaciones/${token}/aprobar`, {}));
      return { exito: true };
    } catch (error) {
      return { exito: false, error: mensajeError(error, 'No se pudo aprobar la compra. Intenta de nuevo.') };
    }
  }

  /** Llama `POST /api/aprobaciones/:token/rechazar`. Público. */
  async rechazar(token: string, motivo?: string): Promise<ResultadoResolverAprobacion> {
    try {
      await firstValueFrom(
        this.http.post(`/api/aprobaciones/${token}/rechazar`, motivo ? { motivo } : {}),
      );
      return { exito: true };
    } catch (error) {
      return { exito: false, error: mensajeError(error, 'No se pudo rechazar la compra. Intenta de nuevo.') };
    }
  }
}
