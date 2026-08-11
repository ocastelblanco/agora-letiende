import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PanelService } from './panel.service';
import { ServicioAuth } from '../auth/servicio-auth';

function configurarPrueba(idToken: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ServicioAuth, useValue: { obtenerIdToken: () => Promise.resolve(idToken) } },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const servicio = TestBed.inject(PanelService);
  return { httpMock, servicio };
}

describe('PanelService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('cargarMisEventos', () => {
    it('deja misEventos en [] y marca error si no hay ID Token', async () => {
      const { servicio } = configurarPrueba(null);

      await servicio.cargarMisEventos();

      expect(servicio.misEventos()).toEqual([]);
      expect(servicio.errorMisEventos()).toBe(true);
    });

    it('llama GET /api/eventos/panel con Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarMisEventos();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/eventos/panel');
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush([
        {
          eventoId: 'evt-1',
          slug: 'concierto-jazz',
          nombre: 'Concierto de jazz',
          fechaHora: '2026-09-01T00:00:00.000Z',
          estado: 'publicado',
        },
      ]);
      await promesa;

      expect(servicio.misEventos().length).toBe(1);
      expect(servicio.errorMisEventos()).toBe(false);
    });

    it('marca error si la petición falla', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarMisEventos();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/eventos/panel');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });
      await promesa;

      expect(servicio.misEventos()).toEqual([]);
      expect(servicio.errorMisEventos()).toBe(true);
    });
  });

  describe('cargarDetalle', () => {
    it('deja detalle en null y marca error si no hay ID Token', async () => {
      const { servicio } = configurarPrueba(null);

      await servicio.cargarDetalle('evt-1');

      expect(servicio.detalle()).toBeNull();
      expect(servicio.errorDetalle()).toBe(true);
    });

    it('llama GET /api/eventos/:eventoId/panel con Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarDetalle('evt-1');
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/eventos/evt-1/panel');
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush({
        nombreEvento: 'Concierto de jazz',
        sillasTotales: 100,
        sillasDisponibles: 40,
        sillasVendidas: 55,
        porEtapa: [{ etapaId: 'et-1', nombre: 'Preventa', vendidas: 2, recaudado: 90000 }],
        ingresados: 2,
        totalBoletas: 3,
        faltanPorIngresar: 1,
        clientes: [],
      });
      await promesa;

      expect(servicio.detalle()?.nombreEvento).toBe('Concierto de jazz');
      expect(servicio.errorDetalle()).toBe(false);
    });

    it('marca error si la petición falla (ej. 403 no autorizado para este evento)', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarDetalle('evt-ajeno');
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/eventos/evt-ajeno/panel');
      peticion.flush({ mensaje: 'No autorizado para este evento' }, { status: 403, statusText: 'Forbidden' });
      await promesa;

      expect(servicio.detalle()).toBeNull();
      expect(servicio.errorDetalle()).toBe(true);
    });
  });

  describe('limpiar', () => {
    it('resetea misEventos, detalle y sus banderas de error a su valor inicial', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesaEventos = servicio.cargarMisEventos();
      await Promise.resolve();
      httpMock.expectOne('/api/eventos/panel').flush([
        {
          eventoId: 'evt-1',
          slug: 'concierto-jazz',
          nombre: 'Concierto de jazz',
          fechaHora: '2026-09-01T00:00:00.000Z',
          estado: 'publicado',
        },
      ]);
      await promesaEventos;

      const promesaDetalle = servicio.cargarDetalle('evt-1');
      await Promise.resolve();
      httpMock.expectOne('/api/eventos/evt-1/panel').flush({
        nombreEvento: 'Concierto de jazz',
        sillasTotales: 100,
        sillasDisponibles: 40,
        sillasVendidas: 55,
        porEtapa: [],
        totalVendidas: 3,
        totalRecaudado: 150000,
        ingresados: 2,
        totalBoletas: 3,
        faltanPorIngresar: 1,
        clientes: [{ compraId: 'c1', nombre: 'Ana Pérez', cantidad: 2, montoTotal: 90000, etapaId: 'et-1', creadaEn: '2026-08-08T00:00:00.000Z' }],
      });
      await promesaDetalle;

      expect(servicio.misEventos().length).toBe(1);
      expect(servicio.detalle()).not.toBeNull();

      servicio.limpiar();

      expect(servicio.misEventos()).toEqual([]);
      expect(servicio.errorMisEventos()).toBe(false);
      expect(servicio.detalle()).toBeNull();
      expect(servicio.errorDetalle()).toBe(false);
    });
  });
});
