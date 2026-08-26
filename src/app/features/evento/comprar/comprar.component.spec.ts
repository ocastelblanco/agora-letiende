import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComprasService } from '../../../core/api/compras.service';
import { EventosPublicosService } from '../../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../../core/models/evento.model';
import { ComprarComponent } from './comprar.component';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [{ etapaId: 'et1', nombre: 'Preventa', precio: 45000, cierraEn: '2099-01-01T00:00:00.000Z', orden: 1 }],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

/**
 * `ActivatedRoute` real solo existe cuando el router navega a la ruta — aquí
 * el componente se crea directo. `slugActual` es mutable porque
 * `actualizarEstadoCompra()` lee `route.snapshot.paramMap` (no el Signal
 * input `slug()`, ver su docstring) para su guarda contra respuestas
 * tardías — `activarConSlug()` la mantiene sincronizada con cada `setInput`.
 */
function activatedRouteFake(boldOrderId: string | null) {
  const fake = {
    slugActual: null as string | null,
    snapshot: {
      queryParamMap: { get: (clave: string) => (clave === 'bold-order-id' ? boldOrderId : null) },
      get paramMap() {
        return { get: (clave: string) => (clave === 'slug' ? fake.slugActual : null) };
      },
    },
  };
  return fake;
}

function configurarPrueba(opciones: {
  evento?: EventoPublico;
  errorCarga?: boolean;
  crearCompraMock?: ReturnType<typeof vi.fn>;
  consultarEstadoCompraMock?: ReturnType<typeof vi.fn>;
  boldOrderId?: string | null;
}) {
  const cargarEventoPorSlugMock = opciones.errorCarga
    ? vi.fn().mockResolvedValue({ exito: false, error: 'no_encontrado' })
    : vi.fn().mockResolvedValue({ exito: true, evento: opciones.evento ?? eventoEjemplo });

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: activatedRouteFake(opciones.boldOrderId ?? null) },
      { provide: EventosPublicosService, useValue: { cargarEventoPorSlug: cargarEventoPorSlugMock } },
      {
        provide: ComprasService,
        useValue: {
          crearCompra: opciones.crearCompraMock ?? vi.fn(),
          consultarEstadoCompra: opciones.consultarEstadoCompraMock ?? vi.fn(),
        },
      },
    ],
  });

  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<ComprarComponent> = TestBed.createComponent(ComprarComponent);
  return { fixture, cargarEventoPorSlugMock, snackBarOpenMock };
}

async function activarConSlug(fixture: ComponentFixture<ComprarComponent>, slug: string) {
  const route = fixture.debugElement.injector.get(ActivatedRoute) as unknown as {
    slugActual: string | null;
  };
  route.slugActual = slug;
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function llenarFormularioValido(
  componente: ComprarComponent,
  cantidad = 2,
  medioPago: 'transferencia' | 'bold' | null = null,
) {
  componente['formulario'].setValue({
    cantidad,
    nombre: 'Ana Pérez',
    telefono: '3001234567',
    correo: 'ana@correo.com',
    autorizacionDatos: true,
    medioPago,
  });
}

/** Instala un `window.BoldCheckout` falso y devuelve las instancias creadas. */
function instalarBoldCheckoutFalso() {
  const instancias: { config: unknown; open: ReturnType<typeof vi.fn> }[] = [];
  class BoldCheckoutFalso {
    readonly open = vi.fn();
    constructor(public config: unknown) {
      instancias.push(this);
    }
  }
  (window as unknown as { BoldCheckout?: unknown }).BoldCheckout = BoldCheckoutFalso;
  return instancias;
}

/** Simula el `postMessage` interno que la librería de Bold usa para avisar el cierre de su modal. */
function dispararMensajeBold(origin: string, data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { origin, data }));
}

describe('ComprarComponent', () => {
  it('carga el evento por slug y muestra el formulario cuando está publicado con sillas disponibles', async () => {
    const { fixture, cargarEventoPorSlugMock } = configurarPrueba({});

    await activarConSlug(fixture, 'concierto-jazz');

    expect(cargarEventoPorSlugMock).toHaveBeenCalledWith('concierto-jazz');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('muestra "Evento no encontrado" si el servicio responde sin éxito', async () => {
    const { fixture } = configurarPrueba({ errorCarga: true });

    await activarConSlug(fixture, 'inexistente');

    expect(fixture.nativeElement.textContent).toContain('Evento no encontrado');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('el select de cantidad tiene min(maxBoletasPorCompra, sillasDisponibles) opciones', async () => {
    const { fixture } = configurarPrueba({});

    await activarConSlug(fixture, 'concierto-jazz');

    const opciones = fixture.nativeElement.querySelectorAll('select#cantidad option');
    expect(opciones.length).toBe(4);
  });

  it('el <select> de cantidad produce un valor number en el FormControl, no un string (regresión: bug real en staging con venta en efectivo)', async () => {
    const { fixture } = configurarPrueba({});
    await activarConSlug(fixture, 'concierto-jazz');

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select#cantidad');
    select.value = select.options[1].value; // selecciona la segunda opción (cantidad = 2)
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const valorCantidad = fixture.componentInstance['formulario'].controls.cantidad.value;
    expect(typeof valorCantidad).toBe('number');
    expect(valorCantidad).toBe(2);
  });

  it('no muestra el formulario si el evento está agotado', async () => {
    const { fixture } = configurarPrueba({
      evento: { ...eventoEjemplo, estado: 'agotado', sillasDisponibles: 0 },
    });

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('no tiene boletas disponibles');
  });

  it('calcula el total estimado con la etapa vigente y la cantidad, sin enviarlo al backend', async () => {
    const { fixture } = configurarPrueba({});
    await activarConSlug(fixture, 'concierto-jazz');
    const componente = fixture.componentInstance;

    componente['formulario'].controls.cantidad.setValue(3);
    fixture.detectChanges();

    expect(componente['totalEstimado']()).toBe(135000);
  });

  it('no envía el formulario si es inválido', async () => {
    const crearCompraMock = vi.fn();
    const { fixture } = configurarPrueba({ crearCompraMock });
    await activarConSlug(fixture, 'concierto-jazz');

    await fixture.componentInstance['comprar']();

    expect(crearCompraMock).not.toHaveBeenCalled();
  });

  it('envía slug, cantidad, cliente y autorizacionDatos — nunca un precio o total', async () => {
    const crearCompraMock = vi.fn().mockResolvedValue({
      exito: true,
      compra: {
        compraId: 'compra-1',
        estado: 'esperando_comprobante',
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
      },
    });
    const { fixture } = configurarPrueba({ crearCompraMock });
    await activarConSlug(fixture, 'concierto-jazz');
    llenarFormularioValido(fixture.componentInstance, 2);

    await fixture.componentInstance['comprar']();

    expect(crearCompraMock).toHaveBeenCalledWith({
      slug: 'concierto-jazz',
      cantidad: 2,
      cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
      autorizacionDatos: true,
    });
  });

  it('muestra la confirmación con el compraId y la fecha límite tras una compra exitosa', async () => {
    const crearCompraMock = vi.fn().mockResolvedValue({
      exito: true,
      compra: {
        compraId: 'compra-1',
        estado: 'esperando_comprobante',
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
      },
    });
    const { fixture } = configurarPrueba({ crearCompraMock });
    await activarConSlug(fixture, 'concierto-jazz');
    llenarFormularioValido(fixture.componentInstance);

    await fixture.componentInstance['comprar']();
    fixture.detectChanges();

    expect(fixture.componentInstance['compraCreada']()).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Revisa tu correo');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  // v2, roadmap #24 — boletería opcional: sin etapas, la adquisición se
  // resuelve de inmediato (estado 'aprobada'), sin plazo de comprobante.
  describe('evento sin etapas (boletería opcional)', () => {
    const eventoSinEtapas: EventoPublico = { ...eventoEjemplo, etapas: [] };

    it('muestra "Adquirir boletas" en el título y en el botón de envío', async () => {
      const { fixture } = configurarPrueba({ evento: eventoSinEtapas });
      await activarConSlug(fixture, 'concierto-jazz');

      expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Adquirir boletas');
      expect(fixture.nativeElement.querySelector('button[type="submit"]').textContent).toContain(
        'Adquirir',
      );
    });

    it('muestra la confirmación inmediata con la cantidad de boletas emitidas, sin fecha límite', async () => {
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 0, boletas: 2 },
      });
      const { fixture } = configurarPrueba({ evento: eventoSinEtapas, crearCompraMock });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();

      expect(fixture.componentInstance['compraCreada']()).not.toBeNull();
      expect(fixture.nativeElement.textContent).toContain('¡Listo!');
      expect(fixture.nativeElement.textContent).toContain('2 boleta(s)');
      expect(fixture.nativeElement.textContent).not.toContain('Debes hacerlo antes de las');
    });
  });

  it('muestra el error del backend en un snackbar y no borra el formulario ante un fallo (ej. aforo insuficiente)', async () => {
    const crearCompraMock = vi
      .fn()
      .mockResolvedValue({ exito: false, error: 'Aforo insuficiente: solo quedan 1 sillas disponibles' });
    const { fixture, snackBarOpenMock } = configurarPrueba({ crearCompraMock });
    await activarConSlug(fixture, 'concierto-jazz');
    llenarFormularioValido(fixture.componentInstance);

    await fixture.componentInstance['comprar']();

    expect(snackBarOpenMock).toHaveBeenCalledWith(
      'Aforo insuficiente: solo quedan 1 sillas disponibles',
      'Cerrar',
      expect.objectContaining({ duration: expect.any(Number) }),
    );
    expect(fixture.componentInstance['compraCreada']()).toBeNull();
  });

  // Roadmap #19 (Bold) — el cliente elige medio de pago solo cuando el evento
  // ofrece más de uno de los públicos ('efectivo' nunca es público).
  describe('medios de pago públicos (Bold)', () => {
    it('con transferencia y bold muestra el selector y envía el medio elegido', async () => {
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'esperando_comprobante', cantidad: 2, montoTotal: 90000 },
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['transferencia', 'bold'] },
        crearCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');

      expect(
        fixture.nativeElement.querySelectorAll('input[formcontrolname="medioPago"]').length,
      ).toBe(2);

      llenarFormularioValido(fixture.componentInstance, 2, 'bold');
      await fixture.componentInstance['comprar']();

      expect(crearCompraMock).toHaveBeenCalledWith(
        expect.objectContaining({ medioPago: 'bold' }),
      );
    });

    it('con solo bold no muestra selector pero envía medioPago: bold igual', async () => {
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'esperando_comprobante', cantidad: 2, montoTotal: 90000 },
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');

      expect(
        fixture.nativeElement.querySelectorAll('input[formcontrolname="medioPago"]').length,
      ).toBe(0);

      llenarFormularioValido(fixture.componentInstance, 2);
      await fixture.componentInstance['comprar']();

      expect(crearCompraMock).toHaveBeenCalledWith(expect.objectContaining({ medioPago: 'bold' }));
    });

    it('sin bold ni transferencia (solo efectivo) no muestra selector ni envía medioPago', async () => {
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'esperando_comprobante', cantidad: 2, montoTotal: 90000 },
      });
      const { fixture } = configurarPrueba({ crearCompraMock }); // eventoEjemplo: mediosPago ['efectivo']
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();

      expect(crearCompraMock).toHaveBeenCalledWith({
        slug: 'concierto-jazz',
        cantidad: 2,
        cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
        autorizacionDatos: true,
      });
    });

    it('una respuesta esperando_pago_bold muestra la tarjeta de confirmación de pago, no el formulario', async () => {
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: {
          compraId: 'compra-1',
          estado: 'esperando_pago_bold',
          cantidad: 2,
          montoTotal: 90000,
          expiraEn: '2026-08-08T00:10:00.000Z',
          bold: { llaveIdentidad: 'llave-prueba', firma: 'firmahex', moneda: 'COP' },
        },
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('form')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('Confirma tu pago');
    });
  });

  // Roadmap #19 (Bold) — checkout personalizado vía `window.BoldCheckout`
  // (API JS oficial), reemplaza el widget declarativo `<script data-bold-button>`
  // que nunca aparecía en staging (la librería escaneaba el DOM antes de que
  // el script del botón existiera).
  describe('checkout personalizado de Bold (window.BoldCheckout)', () => {
    afterEach(() => {
      // Consume cualquier listener de `message` que un test haya dejado
      // colgado (abrió el checkout pero nunca simuló su cierre) para que no
      // reaccione por accidente a un postMessage de un test posterior.
      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      delete (window as unknown as { BoldCheckout?: unknown }).BoldCheckout;
    });

    it('con BoldCheckout disponible en window, muestra "Pagar con Bold" y al hacer click abre el checkout, oculta los botones y muestra el mensaje de espera', async () => {
      const instancias = instalarBoldCheckoutFalso();

      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock: vi.fn().mockResolvedValue({
          exito: true,
          compra: {
            compraId: 'compra-1',
            estado: 'esperando_pago_bold',
            cantidad: 2,
            montoTotal: 90000,
            expiraEn: '2026-08-08T00:10:00.000Z',
            bold: { llaveIdentidad: 'llave-prueba', firma: 'firmahex', moneda: 'COP' },
          },
        }),
        // La limpieza del listener en el afterEach de este describe dispara un
        // 'BOLD_CHECKOUT_EVENT' de cierre si el test no lo consumió — este
        // mock evita que esa reconsulta de limpieza falle sobre un resultado
        // no configurado.
        consultarEstadoCompraMock: vi.fn().mockResolvedValue({
          exito: true,
          compra: { compraId: 'compra-1', estado: 'esperando_pago_bold', cantidad: 2, montoTotal: 90000 },
        }),
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const boton: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
      expect(boton).not.toBeNull();
      expect(boton!.textContent).toContain('Pagar con Bold');
      expect(instancias).toHaveLength(1);
      expect(instancias[0].config).toEqual(
        expect.objectContaining({
          orderId: 'compra-1',
          currency: 'COP',
          amount: '90000',
          apiKey: 'llave-prueba',
          integritySignature: 'firmahex',
          renderMode: 'embedded',
        }),
      );

      boton!.click();
      fixture.detectChanges();

      expect(instancias[0].open).toHaveBeenCalled();
      const botonesTrasAbrir: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      expect(botonesTrasAbrir.length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain(
        'Completa tu pago en la ventana de Bold',
      );
    });

    it('si el slug cambia mientras se espera la librería de Bold, no instala el checkout de la compra vieja (bug real: el cliente veía el botón de Bold de un evento anterior)', async () => {
      delete (window as unknown as { BoldCheckout?: unknown }).BoldCheckout;
      const crearCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: {
          compraId: 'compra-vieja',
          estado: 'esperando_pago_bold',
          cantidad: 2,
          montoTotal: 90000,
          expiraEn: '2026-08-08T00:10:00.000Z',
          bold: { llaveIdentidad: 'llave-vieja', firma: 'firma-vieja', moneda: 'COP' },
        },
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();
      // En este punto el efecto del constructor ya llamó a iniciarCheckoutBold(),
      // que quedó esperando el evento 'boldCheckoutLoaded' (el script "no ha cargado" aún).

      // El cliente navega a otro evento antes de que la librería termine de cargar.
      fixture.componentRef.setInput('slug', 'otro-evento');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['compraCreada']()).toBeNull();

      // La carga de la librería, iniciada para la compra vieja, "llega tarde".
      class BoldCheckoutFalso {
        readonly open = vi.fn();
        constructor(public config: unknown) {}
      }
      (window as unknown as { BoldCheckout?: unknown }).BoldCheckout = BoldCheckoutFalso;
      window.dispatchEvent(new Event('boldCheckoutLoaded'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['checkoutBold']()).toBeNull();
      expect(fixture.componentInstance['compraCreada']()).toBeNull();
    });

    it('si BoldCheckout no está disponible (falla la carga del script), muestra un mensaje de error y no el botón', async () => {
      delete (window as unknown as { BoldCheckout?: unknown }).BoldCheckout;

      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock: vi.fn().mockResolvedValue({
          exito: true,
          compra: {
            compraId: 'compra-1',
            estado: 'esperando_pago_bold',
            cantidad: 2,
            montoTotal: 90000,
            expiraEn: '2026-08-08T00:10:00.000Z',
            bold: { llaveIdentidad: 'llave-prueba', firma: 'firmahex', moneda: 'COP' },
          },
        }),
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();
      window.dispatchEvent(new Event('boldCheckoutLoadFailed'));
      await fixture.whenStable();
      fixture.detectChanges();

      const botones: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      expect(botones.some((b) => b.textContent?.includes('Pagar con Bold'))).toBe(false);
      expect(fixture.nativeElement.textContent).toContain(
        'No se pudo cargar la pasarela de pago de Bold',
      );
    });
  });

  // Bold no reporta ningún evento para "el cliente cerró el checkout sin
  // pagar" (verificado 26/08/2026 contra developers.bold.co/webhook) — el
  // propio frontend detecta el cierre vía el `postMessage` interno que la
  // librería de Bold usa para saber cuándo cerrar su modal, y reconsulta.
  describe('cierre del checkout de Bold detectado por postMessage', () => {
    function compraEsperandoPagoBold() {
      return {
        compraId: 'compra-1',
        estado: 'esperando_pago_bold' as const,
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
        bold: { llaveIdentidad: 'llave-prueba', firma: 'firmahex', moneda: 'COP' },
      };
    }

    /** Crea la compra, abre el checkout de Bold (click en "Pagar con Bold") y deja los mocks listos. */
    async function prepararCheckoutAbierto(consultarEstadoCompraMock: ReturnType<typeof vi.fn>) {
      const instancias = instalarBoldCheckoutFalso();
      const crearCompraMock = vi.fn().mockResolvedValue({ exito: true, compra: compraEsperandoPagoBold() });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
        consultarEstadoCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const botonPagar: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      botonPagar.click();
      fixture.detectChanges();

      return { fixture, instancias };
    }

    afterEach(() => {
      // Consume cualquier listener que un test haya dejado colgado.
      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      delete (window as unknown as { BoldCheckout?: unknown }).BoldCheckout;
    });

    it('un mensaje con origen no permitido o con type distinto no dispara ninguna reconsulta', async () => {
      // Resuelto (no un vi.fn() vacío) porque el afterEach de este describe
      // dispara un 'BOLD_CHECKOUT_EVENT' de limpieza al terminar, que sí
      // consumirá el listener que este test deja intacto.
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: compraEsperandoPagoBold(),
      });
      const { fixture } = await prepararCheckoutAbierto(consultarEstadoCompraMock);

      dispararMensajeBold('https://sitio-no-permitido.example.com', { type: 'BOLD_CHECKOUT_EVENT' });
      dispararMensajeBold(window.location.origin, { type: 'OTRO_TIPO_DE_EVENTO' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(consultarEstadoCompraMock).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('Completa tu pago en la ventana de Bold');
    });

    it('al detectar el cierre reconsulta el estado y, si quedó aprobada, muestra la confirmación', async () => {
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
      });
      const { fixture } = await prepararCheckoutAbierto(consultarEstadoCompraMock);

      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(consultarEstadoCompraMock).toHaveBeenCalledWith('compra-1');
      expect(fixture.componentInstance['compraCreada']()?.estado).toBe('aprobada');
      expect(fixture.nativeElement.textContent).toContain('¡Listo!');
    });

    it('si tras el cierre la reconsulta sigue esperando_pago_bold, muestra "Verificar estado" y "Reabrir el pago con Bold"', async () => {
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: compraEsperandoPagoBold(),
      });
      const { fixture } = await prepararCheckoutAbierto(consultarEstadoCompraMock);

      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      await fixture.whenStable();
      fixture.detectChanges();

      const botones: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      expect(botones.some((b) => b.textContent?.includes('Verificar estado'))).toBe(true);
      expect(botones.some((b) => b.textContent?.includes('Reabrir el pago con Bold'))).toBe(true);
    });

    it('un click real en "Verificar estado" (no solo invocar el método) consulta el estado y actualiza la pantalla', async () => {
      const consultarEstadoCompraMock = vi
        .fn()
        .mockResolvedValueOnce({ exito: true, compra: compraEsperandoPagoBold() })
        .mockResolvedValueOnce({
          exito: true,
          compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
        });
      const { fixture } = await prepararCheckoutAbierto(consultarEstadoCompraMock);

      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      await fixture.whenStable();
      fixture.detectChanges();

      const botonVerificar = Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((b) => b.textContent?.includes('Verificar estado'));
      expect(botonVerificar).toBeDefined();

      botonVerificar!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(consultarEstadoCompraMock).toHaveBeenCalledTimes(2);
      expect(fixture.nativeElement.textContent).toContain('¡Listo!');
    });

    it('dos clicks reales en "Pagar con Bold" antes del siguiente ciclo de detección de cambios solo abren el checkout una vez (CLAUDE.md §7, doble click/toque real)', async () => {
      const instancias = instalarBoldCheckoutFalso();
      const crearCompraMock = vi
        .fn()
        .mockResolvedValue({ exito: true, compra: compraEsperandoPagoBold() });
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: compraEsperandoPagoBold(),
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
        consultarEstadoCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const botonPagar: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      botonPagar.click();
      botonPagar.click(); // segundo toque real antes de que Angular repinte y oculte el botón.
      fixture.detectChanges();

      expect(instancias).toHaveLength(1);
      expect(instancias[0].open).toHaveBeenCalledTimes(1);

      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('"Reabrir el pago con Bold" vuelve a invocar open() sobre la misma instancia y vuelve a ocultar los botones', async () => {
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: compraEsperandoPagoBold(),
      });
      const { fixture, instancias } = await prepararCheckoutAbierto(consultarEstadoCompraMock);

      dispararMensajeBold(window.location.origin, { type: 'BOLD_CHECKOUT_EVENT' });
      await fixture.whenStable();
      fixture.detectChanges();

      const botonesAbiertos: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      const botonReabrir = botonesAbiertos.find((b) => b.textContent?.includes('Reabrir el pago con Bold'));
      expect(botonReabrir).toBeDefined();

      botonReabrir!.click();
      fixture.detectChanges();

      expect(instancias).toHaveLength(1); // misma instancia, ninguna reserva nueva.
      expect(instancias[0].open).toHaveBeenCalledTimes(2);
      const botonesTrasReabrir: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      );
      expect(botonesTrasReabrir.length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('Completa tu pago en la ventana de Bold');
    });
  });

  // Botón manual "Verificar estado", último recurso si el webhook llega con
  // retraso — reutilizado por la reconsulta automática tras el cierre.
  describe('verificarEstadoBold() (verificación manual del estado)', () => {
    function compraEsperandoPagoBold() {
      return {
        compraId: 'compra-1',
        estado: 'esperando_pago_bold' as const,
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
        bold: { llaveIdentidad: 'llave-prueba', firma: 'firmahex', moneda: 'COP' },
      };
    }

    it('al invocarse consulta el estado real y, si está aprobada, muestra la confirmación', async () => {
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
      });
      const crearCompraMock = vi.fn().mockResolvedValue({ exito: true, compra: compraEsperandoPagoBold() });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
        consultarEstadoCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();

      await fixture.componentInstance['verificarEstadoBold']('compra-1');
      fixture.detectChanges();

      expect(consultarEstadoCompraMock).toHaveBeenCalledWith('compra-1');
      expect(fixture.componentInstance['compraCreada']()?.estado).toBe('aprobada');
      expect(fixture.nativeElement.textContent).toContain('¡Listo!');
    });

    it('si la consulta falla, muestra el error en un snackbar y no cambia la pantalla', async () => {
      const consultarEstadoCompraMock = vi
        .fn()
        .mockResolvedValue({ exito: false, error: 'No se pudo consultar el estado de la compra.' });
      const crearCompraMock = vi.fn().mockResolvedValue({ exito: true, compra: compraEsperandoPagoBold() });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
        consultarEstadoCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();

      await fixture.componentInstance['verificarEstadoBold']('compra-1');
      fixture.detectChanges();

      expect(consultarEstadoCompraMock).toHaveBeenCalledWith('compra-1');
      expect(snackBarOpenMock).toHaveBeenCalledWith(
        'No se pudo consultar el estado de la compra.',
        'Cerrar',
        expect.objectContaining({ duration: expect.any(Number) }),
      );
      expect(fixture.componentInstance['compraCreada']()?.estado).toBe('esperando_pago_bold');
    });

    it('si el slug cambia mientras se espera la respuesta de verificarEstadoBold(), no sobrescribe el estado del evento nuevo con la compra vieja (bug real: carrera de navegación)', async () => {
      let resolverConsulta!: (valor: unknown) => void;
      const consultarEstadoCompraMock = vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolverConsulta = resolve;
        }),
      );
      const crearCompraMock = vi.fn().mockResolvedValue({ exito: true, compra: compraEsperandoPagoBold() });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        crearCompraMock,
        consultarEstadoCompraMock,
      });
      await activarConSlug(fixture, 'concierto-jazz');
      llenarFormularioValido(fixture.componentInstance, 2);

      await fixture.componentInstance['comprar']();
      fixture.detectChanges();

      void fixture.componentInstance['verificarEstadoBold']('compra-1');
      // verificarEstadoBold() ya llamó a consultarEstadoCompra() y quedó
      // esperando la respuesta (el mock no resuelve todavía).

      // El cliente navega a otro evento antes de que la consulta responda.
      const route = fixture.debugElement.injector.get(ActivatedRoute) as unknown as {
        slugActual: string | null;
      };
      route.slugActual = 'otro-evento';
      fixture.componentRef.setInput('slug', 'otro-evento');
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['compraCreada']()).toBeNull();

      // La respuesta tardía de la compra vieja llega después de la navegación.
      resolverConsulta({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
      });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance['compraCreada']()).toBeNull();
    });
  });

  // Roadmap #19 (Bold) — regreso del cliente desde el checkout de Bold.
  describe('regreso desde Bold (bold-order-id en la query string)', () => {
    it('consulta el estado real por compraId, nunca confía en bold-tx-status de la URL', async () => {
      const consultarEstadoCompraMock = vi.fn().mockResolvedValue({
        exito: true,
        compra: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
      });
      const { fixture } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        consultarEstadoCompraMock,
        boldOrderId: 'compra-1',
      });

      await activarConSlug(fixture, 'concierto-jazz');

      expect(consultarEstadoCompraMock).toHaveBeenCalledWith('compra-1');
      expect(fixture.componentInstance['compraCreada']()?.estado).toBe('aprobada');
    });

    it('muestra un snackbar si la consulta de estado falla (ej. red o compra ya expirada por TTL)', async () => {
      const consultarEstadoCompraMock = vi
        .fn()
        .mockResolvedValue({ exito: false, error: 'No se pudo consultar el estado de la compra.' });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        evento: { ...eventoEjemplo, mediosPago: ['bold'] },
        consultarEstadoCompraMock,
        boldOrderId: 'compra-1',
      });

      await activarConSlug(fixture, 'concierto-jazz');

      expect(consultarEstadoCompraMock).toHaveBeenCalledWith('compra-1');
      expect(snackBarOpenMock).toHaveBeenCalledWith(
        'No se pudo consultar el estado de la compra.',
        'Cerrar',
        expect.objectContaining({ duration: expect.any(Number) }),
      );
      expect(fixture.componentInstance['compraCreada']()).toBeNull();
    });
  });
});
