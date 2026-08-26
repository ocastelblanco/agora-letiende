import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { CompraCreada, ComprasService } from '../../../core/api/compras.service';
import { EventosPublicosService } from '../../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../../core/models/evento.model';
import { PrecioPipe } from '../../../shared/pipes/precio.pipe';
import { etapaVigenteParaMostrar } from '../../../shared/utilidades/etapa-vigente';
import { paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

/** Medio de pago elegible por un cliente sin autenticar — nunca 'efectivo' (venta presencial). */
type MedioPagoPublico = 'transferencia' | 'bold';

/** Medios de pago que un cliente sin autenticar puede elegir — nunca 'efectivo' (venta presencial). */
const MEDIOS_PAGO_PUBLICOS: readonly MedioPagoPublico[] = ['transferencia', 'bold'];

const SRC_LIBRERIA_BOLD = 'https://checkout.bold.co/library/boldPaymentButton.js';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  readonly slug = input.required<string>();

  protected readonly evento = signal<EventoPublico | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noEncontrado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly compraCreada = signal<CompraCreada | null>(null);
  /** Evita reinyectar el widget de Bold si el efecto que lo dispara se vuelve a ejecutar. */
  private readonly widgetBoldInyectado = signal(false);

  protected readonly contenedorWidgetBold = viewChild<ElementRef<HTMLDivElement>>('contenedorWidgetBold');

  protected readonly formulario = this.fb.nonNullable.group({
    cantidad: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
    nombre: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    telefono: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(20)]),
    correo: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    autorizacionDatos: this.fb.nonNullable.control(false, [Validators.requiredTrue]),
    // Solo se exige (ver el effect del constructor) cuando el evento ofrece
    // ambos medios de pago públicos — si ofrece 0 o 1, queda sin validar.
    medioPago: this.fb.control<MedioPagoPublico | null>(null),
  });

  /**
   * Intersección de `evento.mediosPago` con los medios que un cliente sin
   * autenticar puede elegir — nunca incluye 'efectivo' (exclusivo de venta
   * presencial por un `productor`/`portero`).
   */
  protected readonly mediosPagoPublicos = computed(() => {
    const evento = this.evento();
    if (!evento) {
      return [];
    }
    return MEDIOS_PAGO_PUBLICOS.filter((medio) => evento.mediosPago.includes(medio));
  });

  protected readonly etapaVigente = computed(() => {
    const evento = this.evento();
    return evento ? etapaVigenteParaMostrar(evento.etapas) : null;
  });

  protected readonly puedeComprar = computed(() => {
    const evento = this.evento();
    return !!evento && evento.estado === 'publicado' && evento.sillasDisponibles > 0;
  });

  /**
   * Opciones del `<select>` de cantidad: 1..min(maxBoletasPorCompra, sillasDisponibles).
   * Si `maxBoletasPorCompra` fuera 0 con sillas disponibles, el resultado es un
   * `<select>` vacío — configuración de evento inválida, no responsabilidad de
   * este componente (no se agrega manejo defensivo extra).
   */
  protected readonly opcionesCantidad = computed(() => {
    const evento = this.evento();
    if (!evento) {
      return [];
    }
    const maximo = Math.min(evento.maxBoletasPorCompra, evento.sillasDisponibles);
    return Array.from({ length: maximo }, (_, indice) => indice + 1);
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.cargando.set(true);
      this.noEncontrado.set(false);
      this.evento.set(null);
      this.compraCreada.set(null);
      this.widgetBoldInyectado.set(false);
      void this.cargarEvento(slug);
    });

    // Exige elegir medio de pago solo cuando hay 2 opciones públicas — con 0
    // o 1, el control queda sin validadores y su valor se resuelve solo.
    effect(() => {
      const dosOpciones = this.mediosPagoPublicos().length === 2;
      const control = this.formulario.controls.medioPago;
      control.setValidators(dosOpciones ? Validators.required : null);
      control.updateValueAndValidity({ emitEvent: false });
    });

    // Regreso desde el checkout embebido/redirección de Bold: `bold-order-id`
    // es el mismo `compraId` que Ágora envió como `data-order-id` (ver
    // comprar.component.ts arriba). Nunca se confía en `bold-tx-status` de la
    // URL — la fuente de verdad es esta consulta al backend.
    const boldOrderId = this.route.snapshot.queryParamMap.get('bold-order-id');
    if (boldOrderId) {
      void this.recuperarEstadoTrasBold(boldOrderId);
    }

    // Inyecta el widget de Bold una sola vez, cuando la compra queda en
    // 'esperando_pago_bold' (recién creada o recuperada al volver de Bold).
    effect(() => {
      const compra = this.compraCreada();
      const evento = this.evento();
      if (
        !evento ||
        !compra?.bold ||
        compra.estado !== 'esperando_pago_bold' ||
        this.widgetBoldInyectado()
      ) {
        return;
      }
      afterNextRender(() => this.inyectarWidgetBold(compra, evento), { injector: this.injector });
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

  private async recuperarEstadoTrasBold(compraId: string): Promise<void> {
    // Limpia la query string de inmediato para que un refresh no reprocese
    // esta consulta contra un estado ya viejo.
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    const resultado = await this.comprasService.consultarEstadoCompra(compraId);
    if (resultado.exito) {
      this.compraCreada.set(resultado.compra);
    } else {
      this.snackBar.open(resultado.error, 'Cerrar', { duration: 8000 });
    }
  }

  /**
   * Inyecta el `<script>` del botón de Bold (docs oficiales, "Botón de
   * pagos") dentro del contenedor de la plantilla. Todos los `data-*` vienen
   * tal cual de la respuesta del backend — nunca calculados ni aceptados
   * desde el cliente (CLAUDE.md §5, A08).
   */
  private inyectarWidgetBold(compra: CompraCreada, evento: EventoPublico): void {
    if (this.widgetBoldInyectado() || !compra.bold) {
      return;
    }
    const contenedor = this.contenedorWidgetBold()?.nativeElement;
    if (!contenedor) {
      return;
    }
    this.widgetBoldInyectado.set(true);
    const bold = compra.bold;

    const insertarBotonBold = (): void => {
      const scriptBoton = document.createElement('script');
      scriptBoton.setAttribute('data-bold-button', 'dark-L');
      scriptBoton.setAttribute('data-api-key', bold.llaveIdentidad);
      scriptBoton.setAttribute('data-order-id', compra.compraId);
      scriptBoton.setAttribute('data-amount', String(compra.montoTotal));
      scriptBoton.setAttribute('data-currency', bold.moneda);
      scriptBoton.setAttribute('data-integrity-signature', bold.firma);
      scriptBoton.setAttribute('data-description', `Boletas — ${evento.nombre}`.slice(0, 100));
      scriptBoton.setAttribute(
        'data-redirection-url',
        `${window.location.origin}${window.location.pathname}`,
      );
      scriptBoton.setAttribute('data-render-mode', 'embedded');
      contenedor.appendChild(scriptBoton);
    };

    if (document.querySelector(`script[src="${SRC_LIBRERIA_BOLD}"]`)) {
      insertarBotonBold();
      return;
    }
    const scriptLibreria = document.createElement('script');
    scriptLibreria.src = SRC_LIBRERIA_BOLD;
    scriptLibreria.onload = insertarBotonBold;
    document.body.appendChild(scriptLibreria);
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

  /**
   * Resuelve qué `medioPago` va en el payload de `crearCompra()`: ausente si
   * el evento no ofrece ninguno público, el único disponible si solo hay
   * uno, o el elegido en el radio si el cliente tuvo que escoger entre dos.
   */
  private medioPagoParaPayload(): MedioPagoPublico | undefined {
    const medios = this.mediosPagoPublicos();
    if (medios.length === 0) {
      return undefined;
    }
    if (medios.length === 1) {
      return medios[0];
    }
    return this.formulario.controls.medioPago.value ?? undefined;
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
      const medioPago = this.medioPagoParaPayload();
      const resultado = await this.comprasService.crearCompra({
        slug: evento.slug,
        cantidad: valores.cantidad,
        cliente: { nombre: valores.nombre, telefono: valores.telefono, correo: valores.correo },
        autorizacionDatos: valores.autorizacionDatos,
        ...(medioPago ? { medioPago } : {}),
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

  /** 'rechazada'/'expirada': no hay boletas ni forma de reintentar el pago automáticamente. */
  protected reintentar(): void {
    this.widgetBoldInyectado.set(false);
    this.compraCreada.set(null);
    void this.cargarEvento(this.slug());
  }
}
