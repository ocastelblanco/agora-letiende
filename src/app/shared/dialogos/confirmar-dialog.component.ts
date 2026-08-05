import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DatosConfirmarDialog {
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
}

/**
 * Diálogo de confirmación destructiva reutilizable (`docs/DESIGN.md` §7,
 * ej. "¿Eliminar este usuario/evento?"). Devuelve `true` por
 * `afterClosed()` si se confirma, `undefined` si se cancela o se cierra
 * sin elegir — quien lo abre debe tratar cualquier valor distinto de
 * `true` como cancelación.
 */
@Component({
  selector: 'app-confirmar-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content>{{ datos.mensaje }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ datos.textoCancelar ?? 'Cancelar' }}</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">
        {{ datos.textoConfirmar ?? 'Eliminar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmarDialogComponent {
  protected readonly datos: DatosConfirmarDialog = inject(MAT_DIALOG_DATA);
}
