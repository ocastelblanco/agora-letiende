import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventosPublicosService } from '../../../core/api/eventos-publicos.service';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/efectivo` (`guardiaRol`, mínimo `portero`, `TODO.md`
 * Tarea 2 — Venta en efectivo). `tech-specs.md` §4.2 solo define
 * `/evento/:slug/efectivo` (ya con el `slug` en la mano) sin especificar
 * cómo el equipo llega ahí — mismo hueco y misma solución que
 * `SeleccionPuertaComponent` (`features/puerta/`): un selector simple, sin
 * generalizar ambos componentes en uno solo — el riesgo de tocar
 * `SeleccionPuertaComponent` (ya en producción y probado) por una
 * duplicación de ~30 líneas de UI no vale el ahorro de DRY.
 *
 * Reutiliza `EventosPublicosService.cargarEventos()` (ya existente,
 * público) en vez de crear un endpoint nuevo — la lista de eventos
 * publicados no es información sensible, y el equipo de todas formas
 * necesita sesión para llegar hasta esta ruta (`guardiaRol`).
 */
@Component({
  selector: 'app-seleccion-venta-efectivo',
  imports: [RouterLink],
  templateUrl: './seleccion-venta-efectivo.component.html',
})
export class SeleccionVentaEfectivoComponent implements OnInit {
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
