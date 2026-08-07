import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { EventoPublico } from '../models/evento.model';

export type ResultadoEventoPublico =
  | { exito: true; evento: EventoPublico }
  | { exito: false; error: string };

/**
 * Cliente de `/api/eventos-publicos` (tech-specs.md §5.1, TODO.md Tarea 1) —
 * público, sin autenticación: a diferencia de `EventosService`, nunca usa
 * `ServicioAuth`/`obtenerIdToken` ni envía `Authorization`. Nunca lanza:
 * ante error de red o 404, deja `eventos` en `[]` y marca `error`, o
 * devuelve `{ exito: false, error }` en `cargarEventoPorSlug()`.
 */
@Injectable({ providedIn: 'root' })
export class EventosPublicosService {
  private readonly http = inject(HttpClient);

  private readonly eventosSignal = signal<EventoPublico[]>([]);
  /** Último listado resuelto por `cargarEventos()`. */
  readonly eventos = this.eventosSignal.asReadonly();

  private readonly errorSignal = signal(false);
  /** `true` si la última llamada a `cargarEventos()` falló. */
  readonly error = this.errorSignal.asReadonly();

  /** Llama `GET /api/eventos-publicos`. */
  async cargarEventos(): Promise<void> {
    this.errorSignal.set(false);

    try {
      const eventos = await firstValueFrom(
        this.http.get<EventoPublico[]>('/api/eventos-publicos'),
      );
      this.eventosSignal.set(eventos);
    } catch {
      this.eventosSignal.set([]);
      this.errorSignal.set(true);
    }
  }

  /**
   * Llama `GET /api/eventos-publicos/:slug`. Devuelve
   * `{ exito: false, error: 'no_encontrado' }` ante un 404 (evento
   * inexistente o en un estado no público) para que el componente muestre un
   * estado de "no encontrado" simple, sin redirigir agresivamente.
   */
  async cargarEventoPorSlug(slug: string): Promise<ResultadoEventoPublico> {
    try {
      const evento = await firstValueFrom(
        this.http.get<EventoPublico>(`/api/eventos-publicos/${slug}`),
      );
      return { exito: true, evento };
    } catch {
      return { exito: false, error: 'no_encontrado' };
    }
  }
}
