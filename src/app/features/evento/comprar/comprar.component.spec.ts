import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
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

function configurarPrueba(opciones: {
  evento?: EventoPublico;
  errorCarga?: boolean;
  crearCompraMock?: ReturnType<typeof vi.fn>;
}) {
  const cargarEventoPorSlugMock = opciones.errorCarga
    ? vi.fn().mockResolvedValue({ exito: false, error: 'no_encontrado' })
    : vi.fn().mockResolvedValue({ exito: true, evento: opciones.evento ?? eventoEjemplo });

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      { provide: EventosPublicosService, useValue: { cargarEventoPorSlug: cargarEventoPorSlugMock } },
      { provide: ComprasService, useValue: { crearCompra: opciones.crearCompraMock ?? vi.fn() } },
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

function llenarFormularioValido(componente: ComprarComponent, cantidad = 2) {
  componente['formulario'].setValue({
    cantidad,
    nombre: 'Ana Pérez',
    telefono: '3001234567',
    correo: 'ana@correo.com',
    autorizacionDatos: true,
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
});
