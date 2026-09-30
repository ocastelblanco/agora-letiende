import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import {
  cambiarTipoPeriodo,
  etiquetaPeriodo,
  moverPeriodo,
  type Periodo,
  type TipoPeriodo,
} from '../utilidades/periodo-eventos';

/**
 * Control de periodo de las listas de administración (roadmap #27 y #29):
 * "Todos / Mes / Semana" y, al elegir mes o semana, flechas para recorrer los
 * periodos anteriores y siguientes. Solo edita el `Periodo` (enlace
 * bidireccional); el filtrado lo hace quien lo usa con `estaEnPeriodo()`.
 */
@Component({
  selector: 'app-filtro-periodo',
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule],
  template: `
    <div class="flex flex-wrap items-center gap-3">
      <mat-button-toggle-group
        aria-label="Filtrar por periodo"
        hideSingleSelectionIndicator
        [value]="periodo().tipo"
        (change)="cambiarTipo($event.value)"
      >
        <mat-button-toggle value="todos">Todos</mat-button-toggle>
        <mat-button-toggle value="mes">Mes</mat-button-toggle>
        <mat-button-toggle value="semana">Semana</mat-button-toggle>
      </mat-button-toggle-group>

      @if (periodo().tipo !== 'todos') {
        <div class="flex items-center gap-1">
          <button mat-icon-button type="button" aria-label="Periodo anterior" (click)="mover(-1)">
            <mat-icon fontSet="material-symbols-outlined">chevron_left</mat-icon>
          </button>
          <span class="min-w-44 text-center text-sm font-semibold text-primary" aria-live="polite">
            {{ etiqueta() }}
          </span>
          <button mat-icon-button type="button" aria-label="Periodo siguiente" (click)="mover(1)">
            <mat-icon fontSet="material-symbols-outlined">chevron_right</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class FiltroPeriodoComponent {
  readonly periodo = model.required<Periodo>();

  protected readonly etiqueta = computed(() => etiquetaPeriodo(this.periodo()));

  protected cambiarTipo(tipo: TipoPeriodo): void {
    this.periodo.set(cambiarTipoPeriodo(this.periodo(), tipo));
  }

  protected mover(delta: number): void {
    this.periodo.set(moverPeriodo(this.periodo(), delta));
  }
}
