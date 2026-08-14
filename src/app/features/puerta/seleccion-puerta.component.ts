import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PanelService } from '../../core/api/panel.service';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

// Mismo criterio que `eventos-publicos.ts` (`ESTADOS_VISIBLES`): un evento
// `agotado` sigue siendo una función real que ocurre, así que un portero
// todavía necesita validar ingresos ahí — pero `borrador`/`finalizado`/
// `cancelado` no tiene sentido ofrecerlos en este selector (TODO.md Tarea 1,
// T8). El backend (`listarEventosPanel`) no filtra por `estado` a propósito
// — el panel de control sí quiere ver eventos en cualquier estado — así que
// este filtro vive acá, no ahí.
const ESTADOS_SELECCIONABLES = new Set(['publicado', 'agotado']);

/**
 * Ruta protegida `/taquilla/puerta` (`guardiaRol`, mínimo `portero`, `TODO.md`
 * Tarea 2 — Validación en puerta). `tech-specs.md` §4.2 solo define
 * `/evento/:slug/puerta` (ya con el `slug` en la mano) sin especificar cómo
 * un portero llega ahí — esta pantalla resuelve ese hueco con un selector
 * simple, mismo patrón de lista que `ListaAprobacionesComponent`.
 *
 * Reutiliza `PanelService.cargarMisEventos()` (`GET /api/eventos/panel`,
 * `TODO.md` Tarea 1, T8) — antes usaba `EventosPublicosService.cargarEventos()`
 * (público, sin filtrar), lo que permitía a cualquier portero ver y navegar
 * hacia CUALQUIER evento publicado, no solo los suyos. `listarEventosPanel()`
 * ya filtra por `porteros` (`tieneAccesoAlEvento`, generalizada en esta misma
 * tarea) — la autorización real de a quién se le permite validar boletas en
 * cada evento la sigue verificando el backend en `POST /api/boletas/:codigo/validar`,
 * este selector solo deja de ofrecer eventos ajenos para no confundir.
 */
@Component({
  selector: 'app-seleccion-puerta',
  imports: [RouterLink],
  templateUrl: './seleccion-puerta.component.html',
})
export class SeleccionPuertaComponent implements OnInit {
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
