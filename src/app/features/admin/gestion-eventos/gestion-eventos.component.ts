import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { EventosService } from '../../../core/api/eventos.service';
import type { Evento } from '../../../core/models/evento.model';
import { ConfirmarDialogComponent } from '../../../shared/dialogos/confirmar-dialog.component';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

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
  imports: [RouterLink, MatTableModule, MatButtonModule],
  templateUrl: './gestion-eventos.component.html',
})
export class GestionEventosComponent implements OnInit {
  private readonly eventosService = inject(EventosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly servicioAuth = inject(ServicioAuth);

  /** Crear/eliminar eventos son exclusivos de administrador (TODO.md Tarea 1, T6). */
  protected readonly esAdministrador = computed(() => this.servicioAuth.rol() === 'administrador');

  protected readonly columnas = ['nombre', 'fechaHora', 'sillas', 'estado', 'acciones'];
  protected readonly errorCarga = this.eventosService.error;
  protected readonly eventos = this.eventosService.eventos;

  protected readonly eliminandoEventoId = signal<string | null>(null);

  ngOnInit(): void {
    void this.eventosService.cargarEventos();
  }

  /** Fecha de evento en hora de Bogotá para mostrar en la tabla (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
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
