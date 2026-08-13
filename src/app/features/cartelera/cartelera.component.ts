import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../core/models/evento.model';
import { avisoEstadoEvento } from '../../shared/utilidades/aviso-estado-evento';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta pública `/` (tech-specs.md §4.5, TODO.md Tarea 1) — cartelera de
 * eventos publicados y agotados. Sin guardia: cualquier visitante la ve sin
 * autenticarse. Carga diferida obligatoria (`loadComponent` en
 * `app.routes.ts`) para que el código del panel administrativo nunca llegue
 * al bundle de esta ruta.
 */
@Component({
  selector: 'app-cartelera',
  imports: [RouterLink],
  templateUrl: './cartelera.component.html',
})
export class CarteleraComponent implements OnInit {
  private readonly eventosPublicosService = inject(EventosPublicosService);

  protected readonly eventos = this.eventosPublicosService.eventos;
  protected readonly errorCarga = this.eventosPublicosService.error;

  ngOnInit(): void {
    void this.eventosPublicosService.cargarEventos();
  }

  /** Fecha de evento en hora de Bogotá para mostrar en la tarjeta (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }

  /**
   * Texto del banner diagonal AGOTADO/CANCELADO para la tarjeta de un evento
   * (`docs/plan-pre-producción.md` T3) — mismo utilitario que usa
   * `DetalleEventoComponent`.
   */
  protected avisoEstado(evento: EventoPublico): 'AGOTADO' | 'CANCELADO' | null {
    return avisoEstadoEvento(evento.estado);
  }
}
