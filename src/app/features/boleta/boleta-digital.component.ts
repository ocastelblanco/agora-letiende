import { Component, effect, inject, input, signal } from '@angular/core';
import { BoletaDigital, BoletaDigitalService } from '../../core/api/boleta-digital.service';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

/**
 * Ruta pública `/boleta/:codigo` (`TODO.md` Tarea 2, `PRD.md` §5.3) —
 * página que el cliente abre desde el correo de "boletas emitidas" (o
 * escanea directamente el QR impreso/guardado). Sin autenticación: el
 * `codigo` (`{boletaId}.{firma}`) en la URL es la única credencial, mismo
 * criterio que `ComprobanteComponent`/`RevisarAprobacionComponent`.
 *
 * Deliberadamente no valida el ingreso — eso es la pantalla de puerta
 * (roadmap #13, todavía sin implementar), que escanea este mismo QR.
 */
@Component({
  selector: 'app-boleta-digital',
  imports: [],
  templateUrl: './boleta-digital.component.html',
})
export class BoletaDigitalComponent {
  private readonly boletaDigitalService = inject(BoletaDigitalService);

  readonly codigo = input.required<string>();

  protected readonly cargando = signal(true);
  protected readonly boleta = signal<BoletaDigital | null>(null);
  protected readonly errorCarga = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.cargarBoleta(this.codigo());
    });
  }

  private async cargarBoleta(codigo: string): Promise<void> {
    this.cargando.set(true);
    this.errorCarga.set(null);
    this.boleta.set(null);

    const resultado = await this.boletaDigitalService.obtenerBoleta(codigo);
    if (!resultado.exito) {
      this.errorCarga.set(resultado.error);
      this.cargando.set(false);
      return;
    }
    this.boleta.set(resultado.boleta);
    this.cargando.set(false);
  }

  /** Fecha del evento en hora de Bogotá para mostrar en la boleta (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }
}
