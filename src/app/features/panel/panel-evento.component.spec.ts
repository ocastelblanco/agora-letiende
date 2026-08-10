import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DetallePanel, EventoPanel, PanelService } from '../../core/api/panel.service';
import { PanelEventoComponent } from './panel-evento.component';

const eventoPropio: EventoPanel = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  estado: 'publicado',
};

const detalleEjemplo: DetallePanel = {
  nombreEvento: 'Concierto de jazz',
  sillasTotales: 100,
  sillasDisponibles: 40,
  sillasVendidas: 55,
  porEtapa: [
    { etapaId: 'et-1', nombre: 'Preventa', vendidas: 2, recaudado: 90000 },
    { etapaId: 'et-2', nombre: 'General', vendidas: 1, recaudado: 60000 },
  ],
  ingresados: 2,
  totalBoletas: 3,
  faltanPorIngresar: 1,
  clientes: [
    {
      compraId: 'c1',
      nombre: 'Ana Pérez',
      telefono: '3001234567',
      correo: 'ana@correo.com',
      cantidad: 2,
      montoTotal: 90000,
      etapaId: 'et-1',
      medioPago: 'efectivo',
      creadaEn: '2026-08-08T00:00:00.000Z',
    },
  ],
};

function configurarPrueba(opciones: {
  misEventos?: EventoPanel[];
  detalle?: DetallePanel | null;
  errorDetalle?: boolean;
  cargarDetalleMock?: ReturnType<typeof vi.fn>;
}) {
  const cargarMisEventosMock = vi.fn().mockResolvedValue(undefined);
  const cargarDetalleMock = opciones.cargarDetalleMock ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      {
        provide: PanelService,
        useValue: {
          misEventos: () => opciones.misEventos ?? [],
          detalle: () => opciones.detalle ?? null,
          errorDetalle: () => opciones.errorDetalle ?? false,
          cargarMisEventos: cargarMisEventosMock,
          cargarDetalle: cargarDetalleMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<PanelEventoComponent> = TestBed.createComponent(PanelEventoComponent);
  return { fixture, cargarMisEventosMock, cargarDetalleMock };
}

/**
 * `cargarPanel()` encadena dos `await` (`cargarMisEventos()` y
 * `cargarDetalle()`) — a diferencia de `PuertaComponent`/
 * `VentaEfectivoComponent` (un solo `await`), hace falta un segundo ciclo
 * de `whenStable()` para que el segundo `await` ya haya resuelto antes de
 * inspeccionar el DOM.
 */
async function activarConSlug(fixture: ComponentFixture<PanelEventoComponent>, slug: string) {
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PanelEventoComponent', () => {
  it('resuelve el eventoId por slug con misEventos() y carga el detalle con ese eventoId', async () => {
    const cargarDetalleMock = vi.fn().mockResolvedValue(undefined);
    const { fixture, cargarDetalleMock: mock } = configurarPrueba({
      misEventos: [eventoPropio],
      detalle: detalleEjemplo,
      cargarDetalleMock,
    });

    await activarConSlug(fixture, 'concierto-jazz');

    expect(mock).toHaveBeenCalledWith('evt-1');
  });

  it('muestra "sin acceso" si el slug no aparece en misEventos (inexistente o no asignado)', async () => {
    const { fixture, cargarDetalleMock } = configurarPrueba({ misEventos: [] });

    await activarConSlug(fixture, 'inexistente');

    expect(fixture.nativeElement.textContent).toContain('No tienes acceso al panel de este evento');
    expect(cargarDetalleMock).not.toHaveBeenCalled();
  });

  it('muestra el mensaje de error si cargarDetalle falla', async () => {
    const { fixture } = configurarPrueba({ misEventos: [eventoPropio], detalle: null, errorDetalle: true });

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar las métricas');
  });

  it('muestra ingresados, faltan por ingresar, aforo y las tablas de etapas y clientes', async () => {
    const { fixture } = configurarPrueba({ misEventos: [eventoPropio], detalle: detalleEjemplo });

    await activarConSlug(fixture, 'concierto-jazz');

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Concierto de jazz');
    expect(texto).toContain('Preventa');
    expect(texto).toContain('General');
    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('$90.000');
    // Métricas más urgentes el día del evento (PRD.md §5.6).
    const tarjetas = fixture.nativeElement.querySelectorAll('.grid .text-2xl');
    expect(tarjetas[0].textContent).toContain('2'); // ingresados
    expect(tarjetas[1].textContent).toContain('1'); // faltan por ingresar
  });

  it('no muestra ningún botón de acción que mute estado (pantalla 100% de solo lectura)', async () => {
    const { fixture } = configurarPrueba({ misEventos: [eventoPropio], detalle: detalleEjemplo });

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});
