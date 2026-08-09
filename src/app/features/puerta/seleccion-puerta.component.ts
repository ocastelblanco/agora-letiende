import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/puerta` (`guardiaRol`, mínimo `portero`, `TODO.md`
 * Tarea 2 — Validación en puerta). `tech-specs.md` §4.2 solo define
 * `/evento/:slug/puerta` (ya con el `slug` en la mano) sin especificar cómo
 * un portero llega ahí — esta pantalla resuelve ese hueco con un selector
 * simple, mismo patrón de lista que `ListaAprobacionesComponent`.
 *
 * Reutiliza `EventosPublicosService.cargarEventos()` (ya existente, público)
 * en vez de crear un endpoint nuevo — la lista de eventos publicados no es
 * información sensible, y el portero de todas formas necesita sesión para
 * llegar hasta esta ruta (`guardiaRol`).
 */
@Component({
  selector: 'app-seleccion-puerta',
  imports: [RouterLink],
  templateUrl: './seleccion-puerta.component.html',
})
export class SeleccionPuertaComponent implements OnInit {
  private readonly eventosPublicosService = inject(EventosPublicosService);

  protected readonly eventos = this.eventosPublicosService.eventos;
  protected readonly error = this.eventosPublicosService.error;

  ngOnInit(): void {
    void this.eventosPublicosService.cargarEventos();
  }

  /** Fecha del evento en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }
}
