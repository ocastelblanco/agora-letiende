import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CompraCreada, ComprasService } from '../../../core/api/compras.service';
import { EventosPublicosService } from '../../../core/api/eventos-publicos.service';
import type { EtapaBoleteria, EventoPublico } from '../../../core/models/evento.model';
import { PrecioPipe } from '../../../shared/pipes/precio.pipe';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

/**
 * Etapa vigente **solo para mostrar un estimado en pantalla** — mismo
 * criterio que usa `compras.ts` en el backend (primera etapa por `orden`
 * cuyo `cierraEn` no ha pasado), pero el total real siempre lo calcula y
 * devuelve el servidor (`TODO.md` Tarea 2, `CLAUDE.md` §5 A08): este
 * cálculo nunca se envía ni se acepta como el precio final.
 */
function etapaVigenteParaMostrar(etapas: EtapaBoleteria[]): EtapaBoleteria | null {
  const ahora = Date.now();
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  return ordenadas.find((etapa) => new Date(etapa.cierraEn).getTime() > ahora) ?? null;
}

/**
 * Ruta pública `/evento/:slug/comprar` (`TODO.md` Tarea 2, `PRD.md` §5.3) —
 * formulario de compra con reserva temporal de sillas. Sin autenticación:
 * usa `ComprasService`/`EventosPublicosService`, nunca `ServicioAuth`. El
 * parámetro `slug` es Signal input, mismo criterio que
 * `DetalleEventoComponent` (reutilización de instancia entre navegaciones).
 */
@Component({
  selector: 'app-comprar',
  imports: [ReactiveFormsModule, MatButtonModule, PrecioPipe],
  templateUrl: './comprar.component.html',
})
export class ComprarComponent {
  private readonly fb = inject(FormBuilder);
  private readonly eventosPublicosService = inject(EventosPublicosService);
  private readonly comprasService = inject(ComprasService);
  private readonly snackBar = inject(MatSnackBar);

  readonly slug = input.required<string>();

  protected readonly evento = signal<EventoPublico | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noEncontrado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly compraCreada = signal<CompraCreada | null>(null);

  protected readonly formulario = this.fb.nonNullable.group({
    cantidad: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
    nombre: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    telefono: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(20)]),
    correo: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    autorizacionDatos: this.fb.nonNullable.control(false, [Validators.requiredTrue]),
  });

  protected readonly etapaVigente = computed(() => {
    const evento = this.evento();
    return evento ? etapaVigenteParaMostrar(evento.etapas) : null;
  });

  protected readonly puedeComprar = computed(() => {
    const evento = this.evento();
    return !!evento && evento.estado === 'publicado' && evento.sillasDisponibles > 0;
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.cargando.set(true);
      this.noEncontrado.set(false);
      this.evento.set(null);
      this.compraCreada.set(null);
      void this.cargarEvento(slug);
    });
  }

  private async cargarEvento(slug: string): Promise<void> {
    const resultado = await this.eventosPublicosService.cargarEventoPorSlug(slug);
    if (!resultado.exito) {
      this.noEncontrado.set(true);
      this.cargando.set(false);
      return;
    }
    this.evento.set(resultado.evento);
    this.cargando.set(false);
  }

  /** Total mostrado en pantalla — solo referencia, nunca se envía al backend. */
  protected totalEstimado(): number {
    const etapa = this.etapaVigente();
    const cantidad = this.formulario.controls.cantidad.value;
    return etapa && cantidad > 0 ? etapa.precio * cantidad : 0;
  }

  protected fechaLimiteLegible(expiraEnIso: string): string {
    return paraInputBogota(expiraEnIso).replace('T', ' ');
  }

  protected async comprar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    const evento = this.evento();
    if (!evento) {
      return;
    }

    this.enviando.set(true);
    try {
      const valores = this.formulario.getRawValue();
      const resultado = await this.comprasService.crearCompra({
        slug: evento.slug,
        cantidad: valores.cantidad,
        cliente: { nombre: valores.nombre, telefono: valores.telefono, correo: valores.correo },
        autorizacionDatos: valores.autorizacionDatos,
      });

      if (!resultado.exito) {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 8000 });
        return;
      }

      this.compraCreada.set(resultado.compra);
    } finally {
      this.enviando.set(false);
    }
  }
}
