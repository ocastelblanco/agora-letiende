import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../core/models/evento.model';
import { CarteleraComponent } from './cartelera.component';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  imagenUrl: 'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/e1/imagen-abc.png',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
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

  const fixture: ComponentFixture<CarteleraComponent> = TestBed.createComponent(CarteleraComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock };
}

describe('CarteleraComponent', () => {
  it('carga los eventos públicos al iniciar', () => {
    const { cargarEventosMock } = configurarPrueba({});

    expect(cargarEventosMock).toHaveBeenCalledTimes(1);
  });

  it('fechaLegible convierte el UTC ISO almacenado a hora de pared de Bogotá', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
    const componente = fixture.componentInstance;

    expect(componente['fechaLegible'](eventoEjemplo.fechaHora)).toBe('2026-09-14 20:00');
  });

  it('expone el listado y el error tal como los entrega el servicio', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo], error: false });
    const componente = fixture.componentInstance;

    expect(componente['eventos']()).toEqual([eventoEjemplo]);
    expect(componente['errorCarga']()).toBe(false);
  });

  it('renderiza un enlace a /evento/:slug por cada evento', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    const enlace = fixture.nativeElement.querySelector('a');
    expect(enlace.getAttribute('href')).toBe('/evento/concierto-jazz');
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
  });

  it('muestra el mensaje de error cuando la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar los eventos.');
  });

  it('no muestra ningún banner AGOTADO/CANCELADO cuando el evento está publicado', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    expect(fixture.nativeElement.textContent).not.toContain('AGOTADO');
    expect(fixture.nativeElement.textContent).not.toContain('CANCELADO');
  });

  it('muestra el banner "AGOTADO" cuando algún evento del listado está agotado', () => {
    const { fixture } = configurarPrueba({ eventos: [{ ...eventoEjemplo, estado: 'agotado' }] });

    expect(fixture.nativeElement.textContent).toContain('AGOTADO');
  });

  it('muestra el banner "CANCELADO" cuando algún evento del listado está cancelado', () => {
    const { fixture } = configurarPrueba({ eventos: [{ ...eventoEjemplo, estado: 'cancelado' }] });

    expect(fixture.nativeElement.textContent).toContain('CANCELADO');
  });

  it('muestra el banner "AGOTADO" aunque el evento no tenga imagenUrl', () => {
    const { fixture } = configurarPrueba({
      eventos: [{ ...eventoEjemplo, imagenUrl: undefined, estado: 'agotado' }],
    });

    expect(fixture.nativeElement.textContent).toContain('AGOTADO');
  });
});
