import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
 * Config del checkout personalizado de Bold (API JS `window.BoldCheckout`,
 * docs oficiales "Integración personalizada" — verificado 26/08/2026). Todos
 * los campos vienen tal cual de la respuesta del backend — nunca calculados
 * ni aceptados desde el cliente (CLAUDE.md §5, A08).
 */
interface ConfigBoldCheckout {
  orderId: string;
  currency: string;
  amount: string;
  apiKey: string;
  integritySignature: string;
  description: string;
  redirectionUrl: string;
  renderMode: 'embedded';
}

interface InstanciaBoldCheckout {
  open(): void;
}

type ConstructorBoldCheckout = new (config: ConfigBoldCheckout) => InstanciaBoldCheckout;

/** Lee `window.BoldCheckout` sin `any` ni `declare const` global. */
function obtenerBoldCheckout(): ConstructorBoldCheckout | undefined {
  return (window as unknown as { BoldCheckout?: ConstructorBoldCheckout }).BoldCheckout;
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly slug = input.required<string>();

  protected readonly evento = signal<EventoPublico | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noEncontrado = signal(false);
  protected readonly enviando = signal(false);
  protected readonly compraCreada = signal<CompraCreada | null>(null);
  /** Evita reiniciar el checkout de Bold si el efecto que lo dispara se vuelve a ejecutar. */
  private readonly widgetBoldInyectado = signal(false);
  protected readonly cargandoCheckoutBold = signal(false);
  protected readonly errorCheckoutBold = signal(false);
  protected readonly checkoutBold = signal<InstanciaBoldCheckout | null>(null);
  /** Guarda del botón manual "¿Ya pagaste?" — ver CLAUDE.md §7 (doble click/toque real). */
  protected readonly verificandoEstadoBold = signal(false);

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
      this.cargandoCheckoutBold.set(false);
      this.errorCheckoutBold.set(false);
      this.checkoutBold.set(null);
      this.verificandoEstadoBold.set(false);
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

    // Inicia el checkout de Bold una sola vez, cuando la compra queda en
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
      this.widgetBoldInyectado.set(true);
      void this.iniciarCheckoutBold(compra, evento);
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
    await this.actualizarEstadoCompra(compraId);
  }

  /**
   * Botón manual de respaldo "¿Ya pagaste?": Bold no documenta ningún
   * mecanismo de evento/callback para que esta página sepa cuándo terminó el
   * checkout embebido (verificado 26/08/2026 contra la documentación oficial
   * — ver docs/MEMORY.md), así que el propio cliente dispara la consulta real
   * al backend al volver del modal.
   */
  protected async verificarEstadoBold(compraId: string): Promise<void> {
    if (this.verificandoEstadoBold()) {
      return;
    }
    this.verificandoEstadoBold.set(true);
    try {
      await this.actualizarEstadoCompra(compraId);
    } finally {
      this.verificandoEstadoBold.set(false);
    }
  }

  /**
   * Consulta el estado real de la compra y actualiza la pantalla —
   * compartido por el regreso automático de Bold y el botón manual. Se
   * compara contra el `slug` vigente para descartar una respuesta tardía si
   * el cliente ya navegó a otro evento mientras esperábamos — el componente
   * reutiliza su instancia entre navegaciones. El slug se lee de
   * `route.snapshot.paramMap`, no del Signal input `slug()`: este método se
   * llama también desde `recuperarEstadoTrasBold()` en el constructor, antes
   * de que el router asigne ese input (requerido) — leerlo ahí lanza
   * `NG0950`. El snapshot de la ruta activa, en cambio, ya está resuelto por
   * Angular para cuando el componente se construye, así que la guarda
   * funciona igual de bien en los dos casos que comparten este método. Si
   * `slugAlIniciar` es `null` (el parámetro de ruta todavía no está
   * disponible en ese instante — no ocurre en producción, sí en la prueba
   * unitaria que crea el componente antes de fijar el `slug`), no hay nada
   * confiable con qué comparar y se procede igual que antes de esta guarda.
   */
  private async actualizarEstadoCompra(compraId: string): Promise<void> {
    const slugAlIniciar = this.route.snapshot.paramMap.get('slug');
    const resultado = await this.comprasService.consultarEstadoCompra(compraId);
    if (slugAlIniciar !== null && this.route.snapshot.paramMap.get('slug') !== slugAlIniciar) {
      return; // el cliente navegó a otro evento mientras esperábamos la respuesta.
    }
    if (resultado.exito) {
      this.compraCreada.set(resultado.compra);
    } else {
      this.snackBar.open(resultado.error, 'Cerrar', { duration: 8000 });
    }
  }

  /**
   * Carga la librería de Bold (`window.BoldCheckout`) siguiendo el patrón
   * oficial de eventos globales (docs "Integración personalizada",
   * verificado 26/08/2026) — cubre también el caso de que el script ya esté
   * en proceso de carga por un intento anterior en la misma sesión de SPA.
   * Una vez cargada queda disponible para siempre en la página: no hace
   * falta recargar ni reescanear el DOM para una segunda compra.
   */
  private cargarLibreriaBold(): Promise<boolean> {
    if (obtenerBoldCheckout()) {
      return Promise.resolve(true);
    }
    if (!document.querySelector(`script[src="${SRC_LIBRERIA_BOLD}"]`)) {
      const script = document.createElement('script');
      script.src = SRC_LIBRERIA_BOLD;
      script.onload = () => window.dispatchEvent(new Event('boldCheckoutLoaded'));
      script.onerror = () => window.dispatchEvent(new Event('boldCheckoutLoadFailed'));
      document.head.appendChild(script);
    }
    return new Promise<boolean>((resolve) => {
      const limpiar = () => {
        window.removeEventListener('boldCheckoutLoaded', alCargar);
        window.removeEventListener('boldCheckoutLoadFailed', alFallar);
      };
      const alCargar = () => {
        limpiar();
        resolve(true);
      };
      const alFallar = () => {
        limpiar();
        resolve(false);
      };
      window.addEventListener('boldCheckoutLoaded', alCargar);
      window.addEventListener('boldCheckoutLoadFailed', alFallar);
    });
  }

  /**
   * Instancia un `BoldCheckout` propio (API JS, no el widget declarativo con
   * el logo/gradiente de Bold) para que la plantilla lo abra desde un botón
   * 100% de Le Tiende. Todos los campos vienen tal cual de la respuesta del
   * backend — nunca calculados ni aceptados desde el cliente (CLAUDE.md §5,
   * A08).
   */
  private async iniciarCheckoutBold(compra: CompraCreada, evento: EventoPublico): Promise<void> {
    if (!compra.bold) {
      return;
    }
    this.cargandoCheckoutBold.set(true);
    this.errorCheckoutBold.set(false);
    const cargada = await this.cargarLibreriaBold();
    if (this.compraCreada() !== compra) {
      return; // el usuario navegó a otro evento/compra mientras esperábamos la librería de Bold.
    }
    this.cargandoCheckoutBold.set(false);
    const Constructor = cargada ? obtenerBoldCheckout() : undefined;
    if (!Constructor) {
      this.errorCheckoutBold.set(true);
      return;
    }
    this.checkoutBold.set(
      new Constructor({
        orderId: compra.compraId,
        currency: compra.bold.moneda,
        amount: String(compra.montoTotal),
        apiKey: compra.bold.llaveIdentidad,
        integritySignature: compra.bold.firma,
        description: `Boletas — ${evento.nombre}`.slice(0, 100),
        redirectionUrl: `${window.location.origin}${window.location.pathname}`,
        renderMode: 'embedded',
      }),
    );
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
    this.cargandoCheckoutBold.set(false);
    this.errorCheckoutBold.set(false);
    this.checkoutBold.set(null);
    this.verificandoEstadoBold.set(false);
    this.compraCreada.set(null);
    void this.cargarEvento(this.slug());
  }
}
