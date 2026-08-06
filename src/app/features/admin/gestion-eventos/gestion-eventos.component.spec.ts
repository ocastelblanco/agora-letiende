import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventosService } from '../../../core/api/eventos.service';
import type { Evento } from '../../../core/models/evento.model';
import { GestionEventosComponent } from './gestion-eventos.component';

const eventoEjemplo: Evento = {
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
  productores: [],
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: { eventos?: Evento[]; error?: boolean }) {
  const cargarEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: EventosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => opciones.error ?? false,
          cargarEventos: cargarEventosMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<GestionEventosComponent> =
    TestBed.createComponent(GestionEventosComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock };
}

describe('GestionEventosComponent', () => {
  it('carga los eventos al iniciar', () => {
    const { cargarEventosMock } = configurarPrueba({});

    expect(cargarEventosMock).toHaveBeenCalledTimes(1);
  });

  it('fechaLegible convierte el UTC ISO almacenado a hora de pared de Bogotá', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
    const componente = fixture.componentInstance;

    expect(componente['fechaLegible'](eventoEjemplo.fechaHora)).toBe('2026-09-14 20:00');
  });

  it('expone el listado y el error tal como los entrega el servicio', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
    const componente = fixture.componentInstance;

    expect(componente['eventos']()).toEqual([eventoEjemplo]);
    expect(componente['errorCarga']()).toBe(false);
  });
});
