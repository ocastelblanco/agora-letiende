import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { EventosService } from '../../../core/api/eventos.service';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/admin/eventos` (`guardiaRol`, `data: { rolMinimo: 'administrador' }`
 * en `app.routes.ts`; `tech-specs.md` §4.2, `TODO.md` Tarea 1) — lista de
 * `agora-eventos`. La creación y edición viven en `EditarEventoComponent`
 * (`/admin/eventos/nuevo` y `/admin/eventos/:id`).
 */
@Component({
  selector: 'app-gestion-eventos',
  imports: [RouterLink, MatTableModule, MatButtonModule],
  templateUrl: './gestion-eventos.component.html',
})
export class GestionEventosComponent implements OnInit {
  private readonly eventosService = inject(EventosService);

  protected readonly columnas = ['nombre', 'fechaHora', 'sillas', 'estado', 'acciones'];
  protected readonly errorCarga = this.eventosService.error;
  protected readonly eventos = this.eventosService.eventos;

  ngOnInit(): void {
    void this.eventosService.cargarEventos();
  }

  /** Fecha de evento en hora de Bogotá para mostrar en la tabla (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }
}
