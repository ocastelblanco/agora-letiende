import { Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AprobacionesService, DetalleAprobacion } from '../../core/api/aprobaciones.service';
import { PrecioPipe } from '../../shared/pipes/precio.pipe';

type Resolucion = 'aprobada' | 'rechazada';

/**
 * Ruta pública `/aprobaciones/:token` (`TODO.md` Tarea 2, `tech-specs.md`
 * §5.1) — página que abre el productor desde el enlace mágico de
 * `aviso_comprobante`. Sin autenticación: el `token` en la URL es la única
 * credencial, mismo criterio que `ComprobanteComponent`. Un solo enlace es
 * compartido por todos los productores del evento (`CLAUDE.md` §5 A07,
 * `aprobaciones.ts` en el backend), así que esta pantalla no distingue
 * quién de ellos actúa — el primero en aprobar o rechazar bloquea a los
 * demás con un mensaje explícito (CU-10).
 */
@Component({
  selector: 'app-revisar-aprobacion',
  imports: [ReactiveFormsModule, MatButtonModule, PrecioPipe],
  templateUrl: './revisar-aprobacion.component.html',
})
export class RevisarAprobacionComponent {
  private readonly aprobacionesService = inject(AprobacionesService);
  private readonly fb = inject(FormBuilder);

  readonly token = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly detalle = signal<DetalleAprobacion | null>(null);
  protected readonly errorCarga = signal<string | null>(null);

  protected readonly enviando = signal(false);
  protected readonly errorAccion = signal<string | null>(null);
  protected readonly resolucion = signal<Resolucion | null>(null);

  protected readonly formularioRechazo = this.fb.nonNullable.group({
    motivo: this.fb.nonNullable.control('', [Validators.maxLength(500)]),
  });

  constructor() {
    effect(() => {
      void this.cargarDetalle(this.token());
    });
  }

  private async cargarDetalle(token: string): Promise<void> {
    this.cargando.set(true);
    this.errorCarga.set(null);
    this.detalle.set(null);

    const resultado = await this.aprobacionesService.obtenerDetalle(token);
    if (!resultado.exito) {
      this.errorCarga.set(resultado.error);
      this.cargando.set(false);
      return;
    }
    this.detalle.set(resultado.detalle);
    this.cargando.set(false);
  }

  protected async aprobar(): Promise<void> {
    this.enviando.set(true);
    this.errorAccion.set(null);
    try {
      const resultado = await this.aprobacionesService.aprobar(this.token());
      if (!resultado.exito) {
        this.errorAccion.set(resultado.error);
        return;
      }
      this.resolucion.set('aprobada');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async rechazar(): Promise<void> {
    this.enviando.set(true);
    this.errorAccion.set(null);
    try {
      const motivo = this.formularioRechazo.controls.motivo.value.trim();
      const resultado = await this.aprobacionesService.rechazar(
        this.token(),
        motivo.length > 0 ? motivo : undefined,
      );
      if (!resultado.exito) {
        this.errorAccion.set(resultado.error);
        return;
      }
      this.resolucion.set('rechazada');
    } finally {
      this.enviando.set(false);
    }
  }
}
