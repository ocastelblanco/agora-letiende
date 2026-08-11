import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanelService } from '../../core/api/panel.service';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/panel` (`guardiaRol`, mínimo `productor`, `TODO.md`
 * Tarea 2 — Panel de control básico). Decisión 1 (resuelta explícitamente,
 * no una ambigüedad a resolver después): un enlace en
 * `ListaAprobacionesComponent` no alcanza porque esa lista solo tiene filas
 * cuando hay compras `en_revision` — el caso de uso más urgente del panel
 * (contar ingresos el día del evento) típicamente ocurre sin ninguna compra
 * pendiente. Este selector nuevo, respaldado por `GET /api/eventos/panel`
 * (a diferencia de `SeleccionPuertaComponent`, que reutiliza
 * `EventosPublicosService`, público y sin filtrar), solo lista los eventos
 * donde el productor autenticado está asignado (todos si es
 * `administrador`).
 */
@Component({
  selector: 'app-seleccion-panel',
  imports: [RouterLink],
  templateUrl: './seleccion-panel.component.html',
})
export class SeleccionPanelComponent implements OnInit {
  private readonly panelService = inject(PanelService);

  protected readonly eventos = this.panelService.misEventos;
  protected readonly error = this.panelService.errorMisEventos;

  ngOnInit(): void {
    void this.panelService.cargarMisEventos();
  }

  /** Fecha del evento en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }
}
