import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PanelService, EventoPanel } from '../../core/api/panel.service';
import { SeleccionPanelComponent } from './seleccion-panel.component';

const eventoEjemplo: EventoPanel = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  estado: 'publicado',
};

function configurarPrueba(opciones: { eventos?: EventoPanel[]; error?: boolean }) {
  const cargarMisEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PanelService,
        useValue: {
          misEventos: () => opciones.eventos ?? [],
          errorMisEventos: () => opciones.error ?? false,
          cargarMisEventos: cargarMisEventosMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<SeleccionPanelComponent> = TestBed.createComponent(SeleccionPanelComponent);
  fixture.detectChanges();

  return { fixture, cargarMisEventosMock };
}

describe('SeleccionPanelComponent', () => {
  it('carga los eventos propios al iniciar', () => {
    const { cargarMisEventosMock } = configurarPrueba({});

    expect(cargarMisEventosMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de vacío cuando no hay eventos asignados', () => {
    const { fixture } = configurarPrueba({ eventos: [] });

    expect(fixture.nativeElement.textContent).toContain('No tienes eventos asignados');
  });

  it('muestra el mensaje de error si la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
  });

  it('lista los eventos con enlace a /evento/:slug/panel', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    const enlace = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
    expect(enlace.getAttribute('href')).toBe('/evento/concierto-jazz/panel');
  });
});
