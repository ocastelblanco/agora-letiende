import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { EventoPublico } from '../models/evento.model';
import { EventosPublicosService } from './eventos-publicos.service';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
  sillasTotales: 100,
  sillasDisponibles: 100,
  sillasReservadas: 0,
  etapas: [{ etapaId: 'et1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 }],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

describe('EventosPublicosService', () => {
  let httpMock: HttpTestingController;
  let servicio: EventosPublicosService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(EventosPublicosService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('cargarEventos', () => {
    it('resuelve el listado sin encabezado Authorization', async () => {
      const promesa = servicio.cargarEventos();
      const peticion = httpMock.expectOne('/api/eventos-publicos');
      expect(peticion.request.headers.get('Authorization')).toBeNull();
      peticion.flush([eventoEjemplo]);
      await promesa;

      expect(servicio.eventos()).toEqual([eventoEjemplo]);
      expect(servicio.error()).toBe(false);
    });

    it('deja eventos en [] y marca error cuando la API falla', async () => {
      const promesa = servicio.cargarEventos();
      httpMock
        .expectOne('/api/eventos-publicos')
        .flush({ mensaje: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });
      await promesa;

      expect(servicio.eventos()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });
  });

  describe('cargarEventoPorSlug', () => {
    it('devuelve el evento cuando la API responde 200', async () => {
      const promesa = servicio.cargarEventoPorSlug('concierto-jazz');
      httpMock.expectOne('/api/eventos-publicos/concierto-jazz').flush(eventoEjemplo);

      expect(await promesa).toEqual({ exito: true, evento: eventoEjemplo });
    });

    it('devuelve exito: false cuando la API responde 404', async () => {
      const promesa = servicio.cargarEventoPorSlug('inexistente');
      httpMock
        .expectOne('/api/eventos-publicos/inexistente')
        .flush({ mensaje: 'Evento no encontrado' }, { status: 404, statusText: 'Not Found' });

      expect(await promesa).toEqual({ exito: false, error: 'no_encontrado' });
    });
  });
});
