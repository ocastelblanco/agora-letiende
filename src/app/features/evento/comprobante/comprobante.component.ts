import { Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComprobantesService } from '../../../core/api/comprobantes.service';

const TIPOS_MIME_COMPROBANTE_VALIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/**
 * Ruta pública `/comprobante/:token` (`TODO.md` Tarea 2, `PRD.md` §5.3) —
 * página mínima que el cliente abre desde el correo de "Compra y reserva
 * de sillas" para cargar su comprobante de pago. Sin autenticación: el
 * `token` en la URL es la única credencial. `tech-specs.md` §5.1 no define
 * un `GET` para consultar datos de la compra por este token — esta página
 * deliberadamente no muestra más que el propio formulario de carga.
 */
@Component({
  selector: 'app-comprobante',
  imports: [MatButtonModule],
  templateUrl: './comprobante.component.html',
})
export class ComprobanteComponent {
  private readonly comprobantesService = inject(ComprobantesService);
  private readonly snackBar = inject(MatSnackBar);

  readonly token = input.required<string>();

  protected readonly archivoSeleccionado = signal<File | null>(null);
  protected readonly enviando = signal(false);
  protected readonly subido = signal(false);

  protected seleccionarArchivo(evento: Event): void {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) {
      return;
    }
    if (!TIPOS_MIME_COMPROBANTE_VALIDOS.has(archivo.type)) {
      this.snackBar.open('Solo se permiten imágenes JPEG, PNG, WEBP o archivos PDF.', 'Cerrar', {
        duration: 6000,
      });
      return;
    }
    this.archivoSeleccionado.set(archivo);
  }

  protected async subir(): Promise<void> {
    const archivo = this.archivoSeleccionado();
    if (!archivo) {
      return;
    }

    this.enviando.set(true);
    try {
      const resultado = await this.comprobantesService.subirComprobante(this.token(), archivo);
      if (!resultado.exito) {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 8000 });
        return;
      }
      this.subido.set(true);
    } finally {
      this.enviando.set(false);
    }
  }
}
