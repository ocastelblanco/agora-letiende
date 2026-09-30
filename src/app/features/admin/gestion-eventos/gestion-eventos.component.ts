import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { EventosService } from '../../../core/api/eventos.service';
import type { EstadoEvento, Evento } from '../../../core/models/evento.model';
import { ConfirmarDialogComponent } from '../../../shared/dialogos/confirmar-dialog.component';
import { FiltroPeriodoComponent } from '../../../shared/filtros/filtro-periodo.component';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';
import {
  esAnclaValida,
  estaEnPeriodo,
  ordenarEventos,
  periodoDe,
  type CampoOrden,
  type Periodo,
  type SentidoOrden,
  type TipoPeriodo,
} from '../../../shared/utilidades/periodo-eventos';

/** Presentación de cada estado: chip circular con ícono (DESIGN.md §10). Clases completas para que Tailwind las detecte. */
const ESTADOS: { valor: EstadoEvento; etiqueta: string; icono: string; clases: string }[] = [
  { valor: 'borrador', etiqueta: 'Borrador', icono: 'draft', clases: 'bg-estado-borrador text-white' },
  { valor: 'publicado', etiqueta: 'Publicado', icono: 'check_circle', clases: 'bg-estado-publicado text-white' },
  { valor: 'agotado', etiqueta: 'Agotado', icono: 'group_off', clases: 'bg-estado-agotado text-white' },
  { valor: 'finalizado', etiqueta: 'Finalizado', icono: 'history', clases: 'bg-estado-finalizado text-primary' },
  { valor: 'cancelado', etiqueta: 'Cancelado', icono: 'cancel', clases: 'bg-danger text-white' },
];

const TIPOS_PERIODO: readonly TipoPeriodo[] = ['todos', 'mes', 'semana'];
const ORDEN_POR_DEFECTO: CampoOrden = 'fecha';
const SENTIDO_POR_DEFECTO: SentidoOrden = 'desc';

/**
 * Ruta protegida `/mis-eventos/eventos` (`guardiaRol`,
 * `data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') }` = `'productor'`
 * en `app.routes.ts`; `tech-specs.md` §4.2, `TODO.md` Tarea 1, T6) — lista de
 * `agora-eventos`. Un `administrador` ve todos los eventos; un `productor`
 * solo los suyos (el backend ya filtra, `listarEventos()` en
 * `server/api/handlers/eventos.ts`). La creación y edición viven en
 * `EditarEventoComponent` (`/mis-eventos/eventos/nuevo`, exclusiva de
 * administrador, y `/mis-eventos/eventos/:id`).
 *
 * `MatDialogModule` deliberadamente NO está en los `imports` de este
 * componente: su propia plantilla nunca usa directivas `mat-dialog-*` (esas
 * viven en `ConfirmarDialogComponent`, el que el diálogo abre) — importarla
 * aquí sin necesidad rompe la intercepción de `MatDialog` en las pruebas
 * (gotcha real, ver `MEMORY.md` §7).
 */
@Component({
  selector: 'app-gestion-eventos',
  imports: [
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatSortModule,
    MatTooltipModule,
    FiltroPeriodoComponent,
  ],
  templateUrl: './gestion-eventos.component.html',
})
export class GestionEventosComponent implements OnInit {
  private readonly eventosService = inject(EventosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  /** Crear/eliminar eventos son exclusivos de administrador (TODO.md Tarea 1, T6). */
  protected readonly esAdministrador = computed(() => this.servicioAuth.rol() === 'administrador');

  protected readonly columnas = ['nombre', 'fechaHora', 'acciones'];
  protected readonly estadosDisponibles = ESTADOS;
  protected readonly errorCarga = this.eventosService.error;
  protected readonly eventos = this.eventosService.eventos;

  protected readonly eliminandoEventoId = signal<string | null>(null);

  // Orden y filtros (roadmap #27): viven en la URL para sobrevivir a la ida y
  // vuelta a la edición de un evento. Por defecto, la fecha más reciente primero.
  protected readonly orden = signal<CampoOrden>(ORDEN_POR_DEFECTO);
  protected readonly sentido = signal<SentidoOrden>(SENTIDO_POR_DEFECTO);
  protected readonly periodo = signal<Periodo>(periodoDe('todos', Date.now()));
  protected readonly estadosFiltrados = signal<EstadoEvento[]>([]);

  protected readonly hayFiltros = computed(
    () => this.periodo().tipo !== 'todos' || this.estadosFiltrados().length > 0,
  );

  protected readonly eventosVisibles = computed(() => {
    const estados = this.estadosFiltrados();
    const filtrados = this.eventos().filter(
      (evento) =>
        (estados.length === 0 || estados.includes(evento.estado)) &&
        estaEnPeriodo(evento.fechaHora, this.periodo()),
    );
    return ordenarEventos(filtrados, this.orden(), this.sentido());
  });

  constructor() {
    this.leerParametrosDeUrl();
    effect(() => this.escribirParametrosEnUrl());
  }

  ngOnInit(): void {
    void this.eventosService.cargarEventos();
  }

  /** Fecha de evento en hora de Bogotá para mostrar en la tabla (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }

  protected presentacionEstado(estado: EstadoEvento) {
    return ESTADOS.find((e) => e.valor === estado) ?? ESTADOS[0];
  }

  protected columnaOrdenActiva(): string {
    return this.orden() === 'nombre' ? 'nombre' : 'fechaHora';
  }

  protected cambiarOrden(cambio: Sort): void {
    if (!cambio.direction) {
      // Tercer clic de MatSort (sin dirección): vuelve al orden por defecto.
      this.orden.set(ORDEN_POR_DEFECTO);
      this.sentido.set(SENTIDO_POR_DEFECTO);
      return;
    }
    this.orden.set(cambio.active === 'nombre' ? 'nombre' : 'fecha');
    this.sentido.set(cambio.direction);
  }

  protected limpiarFiltros(): void {
    this.periodo.set(periodoDe('todos', Date.now()));
    this.estadosFiltrados.set([]);
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
    const tipo = parametros.get('periodo') as TipoPeriodo | null;
    const ancla = parametros.get('ancla');
    if (tipo && TIPOS_PERIODO.includes(tipo) && esAnclaValida(ancla)) {
      this.periodo.set({ tipo, ancla });
    }
    const estados = (parametros.get('estados') ?? '')
      .split(',')
      .filter((valor): valor is EstadoEvento => ESTADOS.some((e) => e.valor === valor));
    this.estadosFiltrados.set(estados);
  }

  private escribirParametrosEnUrl(): void {
    const periodo = this.periodo();
    const estados = this.estadosFiltrados();
    const filtraPorPeriodo = periodo.tipo !== 'todos';
    void this.router.navigate([], {
      relativeTo: this.ruta,
      replaceUrl: true,
      queryParams: {
        orden: this.orden() === ORDEN_POR_DEFECTO ? null : this.orden(),
        sentido: this.sentido() === SENTIDO_POR_DEFECTO ? null : this.sentido(),
        periodo: filtraPorPeriodo ? periodo.tipo : null,
        ancla: filtraPorPeriodo ? periodo.ancla : null,
        estados: estados.length > 0 ? estados.join(',') : null,
      },
    });
  }

  protected async eliminar(evento: Evento): Promise<void> {
    const referenciaDialogo = this.dialog.open(ConfirmarDialogComponent, {
      data: {
        titulo: 'Eliminar evento',
        mensaje: `¿Eliminar "${evento.nombre}"? Esta acción no se puede deshacer.`,
      },
    });
    const confirmado = await firstValueFrom(referenciaDialogo.afterClosed());
    if (confirmado !== true) {
      return;
    }

    this.eliminandoEventoId.set(evento.eventoId);
    try {
      const resultado = await this.eventosService.eliminarEvento(evento.eventoId);
      if (resultado.exito) {
        this.snackBar.open('Evento eliminado correctamente.', 'Cerrar', { duration: 4000 });
      } else {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
      }
    } finally {
      this.eliminandoEventoId.set(null);
    }
  }
}
