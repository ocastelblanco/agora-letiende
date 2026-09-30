import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { PanelService } from '../../core/api/panel.service';
import { FiltroPeriodoComponent } from '../../shared/filtros/filtro-periodo.component';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';
import {
  estaEnPeriodo,
  ordenarEventos,
  ordenarPorProximidad,
  periodoDe,
  periodoDesdeParametros,
  type CampoOrden,
  type Periodo,
  type SentidoOrden,
} from '../../shared/utilidades/periodo-eventos';

// Roadmap #29 — por defecto, el evento más próximo primero (ver
// `ordenarPorProximidad`). Es distinto del valor por defecto de la lista de
// eventos de administración (fecha más reciente primero): aquí se elige el
// evento de hoy o de los próximos días, no se revisa el historial.
const ORDEN_POR_DEFECTO: CampoOrden = 'fecha';
const SENTIDO_POR_DEFECTO: SentidoOrden = 'asc';

/**
 * Ruta protegida `/mis-eventos/panel` (`guardiaRol`, mínimo `productor`, `TODO.md`
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
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    FiltroPeriodoComponent,
  ],
  templateUrl: './seleccion-panel.component.html',
})
export class SeleccionPanelComponent implements OnInit {
  private readonly panelService = inject(PanelService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly eventos = this.panelService.misEventos;
  protected readonly error = this.panelService.errorMisEventos;

  // Orden y periodo viven en la URL (mismos nombres de parámetro que la lista
  // de eventos de administración), para conservarlos al volver de un panel.
  protected readonly orden = signal<CampoOrden>(ORDEN_POR_DEFECTO);
  protected readonly sentido = signal<SentidoOrden>(SENTIDO_POR_DEFECTO);
  protected readonly periodo = signal<Periodo>(periodoDe('todos', Date.now()));

  protected readonly eventosVisibles = computed(() => {
    const delPeriodo = this.eventos().filter((evento) => estaEnPeriodo(evento.fechaHora, this.periodo()));
    if (this.orden() === 'fecha' && this.sentido() === 'asc') {
      return ordenarPorProximidad(delPeriodo, Date.now());
    }
    return ordenarEventos(delPeriodo, this.orden(), this.sentido());
  });

  /** Texto del botón de sentido: dice qué hace el orden actual, no solo una flecha. */
  protected readonly etiquetaSentido = computed(() => {
    const ascendente = this.sentido() === 'asc';
    if (this.orden() === 'nombre') {
      return ascendente ? 'A → Z' : 'Z → A';
    }
    return ascendente ? 'Próximos primero' : 'Fecha más lejana primero';
  });

  constructor() {
    this.leerParametrosDeUrl();
    effect(() => this.escribirParametrosEnUrl());
  }

  ngOnInit(): void {
    void this.panelService.cargarMisEventos();
  }

  /** Fecha del evento en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }

  protected cambiarOrden(campo: CampoOrden): void {
    this.orden.set(campo);
    // Cada campo arranca en su sentido natural: fecha → próximos primero, nombre → A → Z.
    this.sentido.set('asc');
  }

  protected invertirSentido(): void {
    this.sentido.update((actual) => (actual === 'asc' ? 'desc' : 'asc'));
  }

  private leerParametrosDeUrl(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const orden = parametros.get('orden');
    if (orden === 'nombre' || orden === 'fecha') {
      this.orden.set(orden);
    }
    const sentido = parametros.get('sentido');
    if (sentido === 'asc' || sentido === 'desc') {
      this.sentido.set(sentido);
    }
    const periodo = periodoDesdeParametros(parametros.get('periodo'), parametros.get('ancla'));
    if (periodo) {
      this.periodo.set(periodo);
    }
  }

  private escribirParametrosEnUrl(): void {
    const periodo = this.periodo();
    const filtraPorPeriodo = periodo.tipo !== 'todos';
    void this.router.navigate([], {
      relativeTo: this.ruta,
      replaceUrl: true,
      queryParams: {
        orden: this.orden() === ORDEN_POR_DEFECTO ? null : this.orden(),
        sentido: this.sentido() === SENTIDO_POR_DEFECTO ? null : this.sentido(),
        periodo: filtraPorPeriodo ? periodo.tipo : null,
        ancla: filtraPorPeriodo ? periodo.ancla : null,
      },
    });
  }
}
