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

/** `ActivatedRoute` real solo existe cuando el router navega a la ruta — aquí el componente se crea directo. */
function activatedRouteFake(boldOrderId: string | null) {
  return {
    snapshot: {
      queryParamMap: { get: (clave: string) => (clave === 'bold-order-id' ? boldOrderId : null) },
    },
  };
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
