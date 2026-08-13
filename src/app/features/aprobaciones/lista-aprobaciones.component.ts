import { Component, OnInit, inject } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { AprobacionesService } from '../../core/api/aprobaciones.service';
import { PrecioPipe } from '../../shared/pipes/precio.pipe';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta protegida `/mis-eventos/aprobaciones` (`guardiaRol`,
 * `data: { rolMinimo: 'productor' }` en `app.routes.ts`; `tech-specs.md`
 * §5.1, `TODO.md` Tarea 2) — panel **de solo lectura** con las compras
 * `en_revision` de los eventos donde el usuario actual es productor.
 *
 * Deliberadamente sin acciones aquí: `GET /api/aprobaciones` nunca expone
 * el token del enlace mágico (solo se persiste su hash, `CLAUDE.md` §5
 * A02/A07), así que esta lista no puede enlazar a `/aprobaciones/:token`.
 * Aprobar o rechazar sigue haciéndose desde el enlace que ya llegó por
 * correo (`aviso_comprobante`) — este panel solo da visibilidad de qué hay
 * pendiente, no reemplaza ese flujo.
 */
@Component({
  selector: 'app-lista-aprobaciones',
  imports: [MatTableModule, PrecioPipe],
  templateUrl: './lista-aprobaciones.component.html',
})
export class ListaAprobacionesComponent implements OnInit {
  private readonly aprobacionesService = inject(AprobacionesService);

  protected readonly columnas = ['nombreEvento', 'cantidad', 'montoTotal', 'creadaEn'];
  protected readonly pendientes = this.aprobacionesService.pendientes;
  protected readonly error = this.aprobacionesService.error;

  ngOnInit(): void {
    void this.aprobacionesService.cargarPendientes();
  }

  /** Fecha de creación de la compra en hora de Bogotá (`CLAUDE.md` §4). */
  protected fechaLegible(creadaEnIso: string): string {
    return paraInputBogota(creadaEnIso).replace('T', ' ');
  }
}
