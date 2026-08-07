import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';
import { DatosEditarEvento, DatosNuevoEvento, Evento } from '../models/evento.model';

export type ResultadoOperacionEvento = { exito: true; evento: Evento } | { exito: false; error: string };
export type ResultadoSubidaActivo = { exito: true; key: string } | { exito: false; error: string };
export type ResultadoEliminarEvento = { exito: true } | { exito: false; error: string };
export type ResultadoDescargaQr =
  | { exito: true; blob: Blob; nombreArchivo: string }
  | { exito: false; error: string };

/**
 * Cliente de `/api/eventos` (tech-specs.md §5.1, TODO.md Tarea 1) — CRUD
 * exclusivo de `administrador`, siempre revalidado en el backend
 * (`CLAUDE.md` §5, A01). Nunca lanza: ante error de red o de autorización,
 * deja `eventos` en `[]` y marca `error`, o devuelve
 * `{ exito: false, error }` en las operaciones de escritura.
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly http = inject(HttpClient);

  private readonly eventosSignal = signal<Evento[]>([]);
  /** Último listado resuelto por `cargarEventos()`. */
  readonly eventos = this.eventosSignal.asReadonly();

  private readonly errorSignal = signal(false);
  /** `true` si la última llamada a `cargarEventos()` falló. */
  readonly error = this.errorSignal.asReadonly();

  private mensajeError(error: unknown, mensajePorDefecto: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
      ? error.error.mensaje
      : mensajePorDefecto;
  }

  /** Llama `GET /api/eventos` con el ID Token actual. */
  async cargarEventos(): Promise<void> {
    this.errorSignal.set(false);

    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      this.eventosSignal.set([]);
      this.errorSignal.set(true);
      return;
    }

    try {
      const eventos = await firstValueFrom(
        this.http.get<Evento[]>('/api/eventos', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.eventosSignal.set(eventos);
    } catch {
      this.eventosSignal.set([]);
      this.errorSignal.set(true);
    }
  }

  /**
   * Llama `POST /api/eventos`. El `eventoId` y `sillasDisponibles` siempre
   * los genera/inicializa el backend — este método nunca los envía.
   */
  async crearEvento(datos: DatosNuevoEvento): Promise<ResultadoOperacionEvento> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo crear el evento. Intenta de nuevo.' };
    }

    try {
      const evento = await firstValueFrom(
        this.http.post<Evento>('/api/eventos', datos, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarEventos();
      return { exito: true, evento };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo crear el evento. Intenta de nuevo.'),
      };
    }
  }

  /** Llama `PUT /api/eventos/{eventoId}`. Edición parcial — nunca incluye campos de aforo. */
  async actualizarEvento(
    eventoId: string,
    datos: DatosEditarEvento,
  ): Promise<ResultadoOperacionEvento> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo actualizar el evento. Intenta de nuevo.' };
    }

    try {
      const evento = await firstValueFrom(
        this.http.put<Evento>(`/api/eventos/${eventoId}`, datos, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarEventos();
      return { exito: true, evento };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo actualizar el evento. Intenta de nuevo.'),
      };
    }
  }

  /** Llama `DELETE /api/eventos/{eventoId}`. Tras un `204` exitoso, recarga `eventos`. */
  async eliminarEvento(eventoId: string): Promise<ResultadoEliminarEvento> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo eliminar el evento. Intenta de nuevo.' };
    }

    try {
      await firstValueFrom(
        this.http.delete<void>(`/api/eventos/${eventoId}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarEventos();
      return { exito: true };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo eliminar el evento. Intenta de nuevo.'),
      };
    }
  }

  /**
   * Sube una imagen/logotipo de evento: pide una URL prefirmada de S3
   * (`POST /api/eventos/:eventoId/activos/url-carga`) y sube el archivo
   * directo a S3 con ella — el backend nunca descarga el archivo
   * (`CLAUDE.md` §5, A10). Devuelve la `key` resultante para guardarla con
   * `actualizarEvento()` (`imagenKey`/`logotipoKey`).
   */
  async subirActivo(
    eventoId: string,
    tipo: 'imagen' | 'logotipo',
    archivo: File,
  ): Promise<ResultadoSubidaActivo> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo subir el archivo. Intenta de nuevo.' };
    }

    try {
      const { url, key } = await firstValueFrom(
        this.http.post<{ url: string; key: string }>(
          `/api/eventos/${eventoId}/activos/url-carga`,
          { tipo, tipoMime: archivo.type, tamano: archivo.size },
          { headers: { Authorization: `Bearer ${idToken}` } },
        ),
      );

      // Subida directa a S3 con la URL prefirmada — nunca lleva el
      // encabezado Authorization de nuestra API (CLAUDE.md §5, A02).
      await firstValueFrom(
        this.http.put(url, archivo, { headers: { 'Content-Type': archivo.type } }),
      );

      return { exito: true, key };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo subir el archivo. Intenta de nuevo.'),
      };
    }
  }

  /**
   * Descarga el QR de marketing del evento (`GET /api/eventos/:eventoId/qr`)
   * — un archivo, no JSON, así que se pide como `Blob` con
   * `observe: 'response'` para leer el nombre real (con el slug) del header
   * `Content-Disposition` que ya arma el backend, en vez de reconstruirlo
   * en el cliente.
   */
  async descargarQr(eventoId: string, formato: 'svg' | 'png'): Promise<ResultadoDescargaQr> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo descargar el QR. Intenta de nuevo.' };
    }

    try {
      const respuesta = await firstValueFrom(
        this.http.get(`/api/eventos/${eventoId}/qr`, {
          params: { formato },
          headers: { Authorization: `Bearer ${idToken}` },
          responseType: 'blob',
          observe: 'response',
        }),
      );

      const blob = respuesta.body ?? new Blob();
      const nombreArchivo =
        this.extraerNombreArchivo(respuesta.headers.get('Content-Disposition')) ??
        `qr-evento.${formato}`;
      return { exito: true, blob, nombreArchivo };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo descargar el QR. Intenta de nuevo.'),
      };
    }
  }

  private extraerNombreArchivo(contentDisposition: string | null): string | null {
    if (!contentDisposition) {
      return null;
    }
    const coincidencia = /filename="([^"]+)"/.exec(contentDisposition);
    return coincidencia ? coincidencia[1] : null;
  }
}
