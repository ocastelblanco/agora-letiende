import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AprobacionesService } from './aprobaciones.service';
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
  const servicio = TestBed.inject(AprobacionesService);
  return { httpMock, servicio };
}

describe('AprobacionesService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('cargarPendientes', () => {
    it('deja pendientes en [] y marca error si no hay ID Token', async () => {
      const { servicio } = configurarPrueba(null);

      await servicio.cargarPendientes();

      expect(servicio.pendientes()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });

    it('llama GET /api/aprobaciones con Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarPendientes();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/aprobaciones');
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush([
        { compraId: 'c1', nombreEvento: 'Concierto de jazz', cantidad: 2, montoTotal: 90000, creadaEn: '2026-08-08T00:00:00.000Z' },
      ]);
      await promesa;

      expect(servicio.pendientes().length).toBe(1);
      expect(servicio.error()).toBe(false);
    });

    it('marca error si la petición falla', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.cargarPendientes();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/aprobaciones');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });
      await promesa;

      expect(servicio.pendientes()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });
  });

  describe('obtenerDetalle', () => {
    it('llama GET /api/aprobaciones/:token sin Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const promesa = servicio.obtenerDetalle('token-x');
      const peticion = httpMock.expectOne('/api/aprobaciones/token-x');
      expect(peticion.request.method).toBe('GET');
      expect(peticion.request.headers.has('Authorization')).toBe(false);
      peticion.flush({
        compraId: 'c1',
        cantidad: 2,
        montoTotal: 90000,
        cliente: { nombre: 'Ana', telefono: '300', correo: 'ana@correo.com' },
        urlComprobante: 'https://s3.amazonaws.com/x',
      });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: true,
        detalle: {
          compraId: 'c1',
          cantidad: 2,
          montoTotal: 90000,
          cliente: { nombre: 'Ana', telefono: '300', correo: 'ana@correo.com' },
          urlComprobante: 'https://s3.amazonaws.com/x',
        },
      });
    });

    it('devuelve el error del backend (ej. ya fue resuelta por otro productor)', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const promesa = servicio.obtenerDetalle('token-x');
      const peticion = httpMock.expectOne('/api/aprobaciones/token-x');
      peticion.flush(
        { mensaje: 'Esta compra ya fue resuelta por otro miembro del equipo.' },
        { status: 409, statusText: 'Conflict' },
      );

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'Esta compra ya fue resuelta por otro miembro del equipo.',
      });
    });
  });

  describe('aprobar', () => {
    it('llama POST /api/aprobaciones/:token/aprobar sin Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const promesa = servicio.aprobar('token-x');
      const peticion = httpMock.expectOne('/api/aprobaciones/token-x/aprobar');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.headers.has('Authorization')).toBe(false);
      peticion.flush({ estado: 'aprobada' });

      expect(await promesa).toEqual({ exito: true });
    });
  });

  describe('rechazar', () => {
    it('envía el motivo cuando se da', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const promesa = servicio.rechazar('token-x', 'No corresponde el monto');
      const peticion = httpMock.expectOne('/api/aprobaciones/token-x/rechazar');
      expect(peticion.request.body).toEqual({ motivo: 'No corresponde el monto' });
      peticion.flush({ estado: 'rechazada' });

      expect(await promesa).toEqual({ exito: true });
    });

    it('envía cuerpo vacío cuando no hay motivo', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const promesa = servicio.rechazar('token-x');
      const peticion = httpMock.expectOne('/api/aprobaciones/token-x/rechazar');
      expect(peticion.request.body).toEqual({});
      peticion.flush({ estado: 'rechazada' });

      await promesa;
    });
  });
});
