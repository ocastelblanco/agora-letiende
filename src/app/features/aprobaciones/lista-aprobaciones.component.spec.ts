import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AprobacionesService, CompraPendiente } from '../../core/api/aprobaciones.service';
import { ListaAprobacionesComponent } from './lista-aprobaciones.component';

const compraEjemplo: CompraPendiente = {
  compraId: 'c1',
  nombreEvento: 'Concierto de jazz',
  cantidad: 2,
  montoTotal: 90000,
  creadaEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: { pendientes?: CompraPendiente[]; error?: boolean }) {
  const cargarPendientesMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      {
        provide: AprobacionesService,
        useValue: {
          pendientes: () => opciones.pendientes ?? [],
          error: () => opciones.error ?? false,
          cargarPendientes: cargarPendientesMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<ListaAprobacionesComponent> =
    TestBed.createComponent(ListaAprobacionesComponent);
  fixture.detectChanges();

  return { fixture, cargarPendientesMock };
}

describe('ListaAprobacionesComponent', () => {
  it('carga las aprobaciones pendientes al iniciar', () => {
    const { cargarPendientesMock } = configurarPrueba({});

    expect(cargarPendientesMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de vacío cuando no hay pendientes', () => {
    const { fixture } = configurarPrueba({ pendientes: [] });

    expect(fixture.nativeElement.textContent).toContain('No hay compras pendientes');
  });

  it('muestra el mensaje de error si la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
  });

  it('lista las compras pendientes con evento, cantidad, total y fecha en Bogotá', () => {
    const { fixture } = configurarPrueba({ pendientes: [compraEjemplo] });
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Concierto de jazz');
    expect(texto).toContain('90.000');
    expect(texto).toContain('2026-08-05 19:00');
  });

  it('no incluye ningún enlace de acción (aprobar/rechazar es solo por correo)', () => {
    const { fixture } = configurarPrueba({ pendientes: [compraEjemplo] });

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
