import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanelService } from '../../../core/api/panel.service';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

// Mismo filtro y mismo motivo que `SeleccionPuertaComponent`
// (`features/puerta/`, `TODO.md` Tarea 1, T8): `listarEventosPanel()` no
// filtra por `estado` a propósito (el panel de control sí quiere ver
// eventos en cualquier estado), así que este selector filtra localmente a
// los únicos dos estados donde vender en efectivo tiene sentido.
const ESTADOS_SELECCIONABLES = new Set(['publicado', 'agotado']);

/**
 * Ruta protegida `/taquilla/efectivo` (`guardiaRol`, mínimo `portero`, `TODO.md`
 * Tarea 2 — Venta en efectivo). `tech-specs.md` §4.2 solo define
 * `/evento/:slug/efectivo` (ya con el `slug` en la mano) sin especificar
 * cómo el equipo llega ahí — mismo hueco y misma solución que
 * `SeleccionPuertaComponent` (`features/puerta/`): un selector simple, sin
 * generalizar ambos componentes en uno solo — el riesgo de tocar
 * `SeleccionPuertaComponent` (ya en producción y probado) por una
 * duplicación de ~30 líneas de UI no vale el ahorro de DRY.
 *
 * Reutiliza `PanelService.cargarMisEventos()` (`GET /api/eventos/panel`,
 * `TODO.md` Tarea 1, T8) — antes usaba `EventosPublicosService.cargarEventos()`
 * (público, sin filtrar), lo que permitía a cualquier portero ver y navegar
 * hacia CUALQUIER evento publicado, no solo los suyos. `listarEventosPanel()`
 * ya filtra por `porteros`/`productores` (`tieneAccesoAlEvento`, generalizada
 * en esta misma tarea) — la autorización real de quién puede vender en
 * efectivo en cada evento la sigue verificando el backend en
 * `POST /api/ventas-efectivo`, este selector solo deja de ofrecer eventos
 * ajenos para no confundir.
 */
@Component({
  selector: 'app-seleccion-venta-efectivo',
  imports: [RouterLink],
  templateUrl: './seleccion-venta-efectivo.component.html',
})
export class SeleccionVentaEfectivoComponent implements OnInit {
  private readonly panelService = inject(PanelService);

  protected readonly eventos = computed(() =>
    this.panelService.misEventos().filter((evento) => ESTADOS_SELECCIONABLES.has(evento.estado)),
  );
  protected readonly error = this.panelService.errorMisEventos;

  ngOnInit(): void {
    void this.panelService.cargarMisEventos();
  }

  /** Fecha del evento en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }
}
