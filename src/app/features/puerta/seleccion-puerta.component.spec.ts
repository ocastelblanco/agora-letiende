import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PanelService } from '../../core/api/panel.service';
import type { EventoPanel } from '../../core/api/panel.service';
import { SeleccionPuertaComponent } from './seleccion-puerta.component';

const eventoEjemplo: EventoPanel = {
  eventoId: 'e1',
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

  const fixture: ComponentFixture<SeleccionPuertaComponent> =
    TestBed.createComponent(SeleccionPuertaComponent);
  fixture.detectChanges();

  return { fixture, cargarMisEventosMock };
}

describe('SeleccionPuertaComponent', () => {
  it('carga los eventos al iniciar', () => {
    const { cargarMisEventosMock } = configurarPrueba({});

    expect(cargarMisEventosMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de vacío cuando no hay eventos', () => {
    const { fixture } = configurarPrueba({ eventos: [] });

    expect(fixture.nativeElement.textContent).toContain('No hay eventos publicados');
  });

  it('muestra el mensaje de error si la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
  });

  it('lista los eventos con enlace a /evento/:slug/puerta', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    const enlace = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
    expect(enlace.getAttribute('href')).toBe('/evento/concierto-jazz/puerta');
  });

  it('excluye eventos que no están publicados ni agotados (filtro local, TODO.md Tarea 1 T8)', () => {
    const eventoBorrador: EventoPanel = { ...eventoEjemplo, eventoId: 'e2', estado: 'borrador' };
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo, eventoBorrador] });

    const enlaces = fixture.nativeElement.querySelectorAll('a');
    expect(enlaces.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
  });
});
