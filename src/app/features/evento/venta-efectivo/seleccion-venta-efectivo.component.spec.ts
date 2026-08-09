import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventosPublicosService } from '../../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../../core/models/evento.model';
import { SeleccionVentaEfectivoComponent } from './seleccion-venta-efectivo.component';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: { eventos?: EventoPublico[]; error?: boolean }) {
  const cargarEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: EventosPublicosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => opciones.error ?? false,
          cargarEventos: cargarEventosMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<SeleccionVentaEfectivoComponent> =
    TestBed.createComponent(SeleccionVentaEfectivoComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock };
}

describe('SeleccionVentaEfectivoComponent', () => {
  it('carga los eventos al iniciar', () => {
    const { cargarEventosMock } = configurarPrueba({});

    expect(cargarEventosMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de vacío cuando no hay eventos', () => {
    const { fixture } = configurarPrueba({ eventos: [] });

    expect(fixture.nativeElement.textContent).toContain('No hay eventos publicados');
  });

  it('muestra el mensaje de error si la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
  });

  it('lista los eventos con enlace a /evento/:slug/efectivo', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    const enlace = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
    expect(enlace.getAttribute('href')).toBe('/evento/concierto-jazz/efectivo');
  });
});
