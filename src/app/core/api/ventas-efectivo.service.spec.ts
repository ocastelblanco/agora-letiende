import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DatosNuevaVentaEfectivo, VentasEfectivoService } from './ventas-efectivo.service';
import { ServicioAuth } from '../auth/servicio-auth';

const datosValidos: DatosNuevaVentaEfectivo = {
  slug: 'concierto-jazz',
  cantidad: 2,
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
  autorizacionDatos: true,
};

function configurarPrueba(idToken: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ServicioAuth, useValue: { obtenerIdToken: () => Promise.resolve(idToken) } },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const servicio = TestBed.inject(VentasEfectivoService);
  return { httpMock, servicio };
}

describe('VentasEfectivoService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('crearVenta', () => {
    it('devuelve error sin llamar la API si no hay ID Token', async () => {
      const { httpMock, servicio } = configurarPrueba(null);

      const resultado = await servicio.crearVenta(datosValidos);

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo registrar la venta. Intenta de nuevo.',
      });
      httpMock.expectNone('/api/ventas-efectivo');
    });

    it('llama POST /api/ventas-efectivo con Authorization', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.crearVenta(datosValidos);
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/ventas-efectivo');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      expect(peticion.request.body).toEqual(datosValidos);
      peticion.flush({ compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: true,
        venta: { compraId: 'compra-1', estado: 'aprobada', cantidad: 2, montoTotal: 90000, boletas: 2 },
      });
    });

    it('devuelve el mensaje de error del backend ante un fallo (ej. aforo insuficiente)', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.crearVenta(datosValidos);
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/ventas-efectivo');
      peticion.flush(
        { mensaje: 'Aforo insuficiente: solo quedan 1 sillas disponibles' },
        { status: 409, statusText: 'Conflict' },
      );

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'Aforo insuficiente: solo quedan 1 sillas disponibles',
      });
    });

    it('devuelve un mensaje genérico si la respuesta de error no trae mensaje', async () => {
      const { httpMock, servicio } = configurarPrueba('token-valido');

      const promesa = servicio.crearVenta(datosValidos);
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/ventas-efectivo');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo registrar la venta. Intenta de nuevo.',
      });
    });
  });
});
