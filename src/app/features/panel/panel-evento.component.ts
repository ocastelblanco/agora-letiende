import { Component, effect, inject, input, signal } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { PanelService } from '../../core/api/panel.service';
import { PrecioPipe } from '../../shared/pipes/precio.pipe';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/evento/:slug/panel` (`guardiaRol`, mínimo `productor`,
 * `TODO.md` Tarea 2 — Panel de control básico, `PRD.md` §5.6). Se llega acá
 * desde `SeleccionPanelComponent` (`/panel`) o por enlace directo.
 *
 * Resuelve `slug` → `eventoId` con `PanelService.misEventos()`
 * (`GET /api/eventos/panel`) — deliberadamente **no** con
 * `EventosPublicosService`, a diferencia de `PuertaComponent`/
 * `VentaEfectivoComponent`: el catálogo público
 * (`handlers/eventos-publicos.ts`) excluye `borrador`/`finalizado`/
 * `cancelado`, justo los estados en los que un productor querría revisar
 * este panel *después* de un evento (reconciliar ingresados vs. vendidos).
 * `GET /api/eventos/panel` ya devuelve los eventos del productor sin ese
 * filtro, así que reutilizarlo evita ese hueco sin inventar un endpoint
 * nuevo. Si el slug no aparece en `misEventos()` (evento inexistente o no
 * asignado a este productor), se trata como "sin acceso" — nunca se
 * distingue el motivo, mismo criterio de no dar pie a enumerar eventos.
 *
 * Pantalla 100% de solo lectura — ninguna acción que mute estado.
 */
@Component({
  selector: 'app-panel-evento',
  imports: [MatTableModule, PrecioPipe],
  templateUrl: './panel-evento.component.html',
})
export class PanelEventoComponent {
  private readonly panelService = inject(PanelService);

  readonly slug = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly sinAcceso = signal(false);

  protected readonly detalle = this.panelService.detalle;
  protected readonly errorDetalle = this.panelService.errorDetalle;

  protected readonly columnasEtapas = ['nombre', 'vendidas', 'recaudado'];
  protected readonly columnasClientes = [
    'nombre',
    'telefono',
    'correo',
    'cantidad',
    'montoTotal',
    'medioPago',
    'creadaEn',
  ];

  constructor() {
    effect(() => {
      const slug = this.slug();
      void this.cargarPanel(slug);
    });
  }

  private async cargarPanel(slug: string): Promise<void> {
    this.cargando.set(true);
    this.sinAcceso.set(false);

    await this.panelService.cargarMisEventos();
    const evento = this.panelService.misEventos().find((e) => e.slug === slug);
    if (!evento) {
      this.sinAcceso.set(true);
      this.cargando.set(false);
      return;
    }

    await this.panelService.cargarDetalle(evento.eventoId);
    this.cargando.set(false);
  }

  /** Fecha de creación de la compra en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(creadaEnIso: string): string {
    return paraInputBogota(creadaEnIso).replace('T', ' ');
  }
}
