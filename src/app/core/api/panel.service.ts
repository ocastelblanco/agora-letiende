import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';

/** Respuesta de `GET /api/eventos/:eventoId/reportes?formato=xlsx`. */
export type ResultadoReporte = { exito: true; url: string } | { exito: false; error: string };

/** Fila de `GET /api/eventos/panel` (server/api/handlers/reportes.ts). */
export interface EventoPanel {
  eventoId: string;
  slug: string;
  nombre: string;
  fechaHora: string;
  estado: string;
}

/** Una etapa del arreglo `porEtapa` de `DetallePanel`. */
export interface MetricaEtapaPanel {
  etapaId: string;
  nombre: string;
  vendidas: number;
  recaudado: number;
}

/**
 * Una fila del arreglo `clientes` de `DetallePanel`. `nombre`/`telefono`/
 * `correo` son opcionales porque provienen de `compra.cliente` (siempre
 * presente en la práctica para una compra `aprobada`, pero no garantizado
 * por el tipo del backend — mismo criterio que `ClientePendiente` de
 * `AprobacionesService`).
 */
export interface ClientePanel {
  compraId: string;
  nombre?: string;
  telefono?: string;
  correo?: string;
  cantidad: number;
  montoTotal: number;
  etapaId: string;
  medioPago?: string;
  creadaEn: string;
}

/** Respuesta de `GET /api/eventos/:eventoId/panel`. */
export interface DetallePanel {
  nombreEvento: string;
  sillasTotales: number;
  sillasDisponibles: number;
  sillasVendidas: number;
  porEtapa: MetricaEtapaPanel[];
  /**
   * Vendidas/recaudado sobre TODAS las compras aprobadas, calculados sin
   * pasar por `etapas` — a diferencia de `porEtapa`, nunca pierden una
   * venta cuyo `etapaId` quedó huérfano (ver `handlers/reportes.ts`).
   */
  totalVendidas: number;
  totalRecaudado: number;
  ingresados: number;
  totalBoletas: number;
  faltanPorIngresar: number;
  clientes: ClientePanel[];
}

/**
 * Cliente de `/api/eventos/panel` y `/api/eventos/:eventoId/panel`
 * (`handlers/reportes.ts`, `TODO.md` Tarea 2 — Panel de control básico) —
 * las dos superficies exigen sesión de equipo (`exigirRol('productor')`,
 * mismo criterio que `AprobacionesService.cargarPendientes()`), a diferencia
 * de otros servicios de este proyecto que mezclan superficies públicas y
 * autenticadas en un mismo cliente.
 */
@Injectable({ providedIn: 'root' })
export class PanelService {
  private readonly http = inject(HttpClient);
  private readonly servicioAuth = inject(ServicioAuth);

  private readonly misEventosSignal = signal<EventoPanel[]>([]);
  /** Último listado resuelto por `cargarMisEventos()`. */
  readonly misEventos = this.misEventosSignal.asReadonly();

  private readonly errorMisEventosSignal = signal(false);
  readonly errorMisEventos = this.errorMisEventosSignal.asReadonly();

  private readonly detalleSignal = signal<DetallePanel | null>(null);
  /** Último detalle resuelto por `cargarDetalle()`. */
  readonly detalle = this.detalleSignal.asReadonly();

  private readonly errorDetalleSignal = signal(false);
  readonly errorDetalle = this.errorDetalleSignal.asReadonly();

  /**
   * Llama `GET /api/eventos/panel` con el ID Token actual — eventos del
   * productor autenticado (todos, sin filtrar, si es `administrador`).
   */
  async cargarMisEventos(): Promise<void> {
    this.errorMisEventosSignal.set(false);

    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      this.misEventosSignal.set([]);
      this.errorMisEventosSignal.set(true);
      return;
    }

    try {
      const eventos = await firstValueFrom(
        this.http.get<EventoPanel[]>('/api/eventos/panel', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.misEventosSignal.set(eventos);
    } catch {
      this.misEventosSignal.set([]);
      this.errorMisEventosSignal.set(true);
    }
  }

  /** Llama `GET /api/eventos/:eventoId/panel` con el ID Token actual. */
  async cargarDetalle(eventoId: string): Promise<void> {
    this.errorDetalleSignal.set(false);

    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      this.detalleSignal.set(null);
      this.errorDetalleSignal.set(true);
      return;
    }

    try {
      const detalle = await firstValueFrom(
        this.http.get<DetallePanel>(`/api/eventos/${eventoId}/panel`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.detalleSignal.set(detalle);
    } catch {
      this.detalleSignal.set(null);
      this.errorDetalleSignal.set(true);
    }
  }

  /**
   * Llama `GET /api/eventos/:eventoId/reportes?formato=xlsx` y devuelve la
   * URL prefirmada que ya arma el backend (`handlers/reportes.ts`,
   * `TODO.md` Tarea 2) — a diferencia de `EventosService.descargarQr()`, acá
   * no se pide `responseType: 'blob'`: la respuesta es JSON (`{ url }`), y
   * esa URL ya viene firmada por S3 con `expiresIn: 900`, así que no
   * necesita un segundo `fetch` autenticado — quien la reciba solo la abre
   * (`window.open`/`<a href>`) directo, sin encabezado `Authorization`
   * (`CLAUDE.md` §5, A02: la autorización real la dio ya la firma de la
   * URL, no un segundo chequeo del cliente).
   */
  async descargarReporte(eventoId: string): Promise<ResultadoReporte> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo generar el reporte. Intenta de nuevo.' };
    }

    try {
      const respuesta = await firstValueFrom(
        this.http.get<{ url: string }>(`/api/eventos/${eventoId}/reportes`, {
          params: { formato: 'xlsx' },
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      return { exito: true, url: respuesta.url };
    } catch (error) {
      const mensaje =
        error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
          ? error.error.mensaje
          : 'No se pudo generar el reporte. Intenta de nuevo.';
      return { exito: false, error: mensaje };
    }
  }

  /**
   * Resetea todos los signals a su valor inicial — `detalle()` guarda
   * `clientes` con datos personales (nombre/teléfono/correo) y debe
   * limpiarse al cerrar sesión (`CLAUDE.md` §5, A07). Se llama desde
   * `BarraNavegacionComponent.cerrarSesion()`, no desde `ServicioAuth`: este
   * servicio ya inyecta `ServicioAuth`, así que inyectar `PanelService` de
   * vuelta crearía una dependencia circular en el DI de Angular.
   */
  limpiar(): void {
    this.misEventosSignal.set([]);
    this.errorMisEventosSignal.set(false);
    this.detalleSignal.set(null);
    this.errorDetalleSignal.set(false);
  }
}
