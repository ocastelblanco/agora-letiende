import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ComprasService, DatosNuevaCompra } from './compras.service';

const datosValidos: DatosNuevaCompra = {
  slug: 'concierto-jazz',
  cantidad: 2,
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
  autorizacionDatos: true,
};

describe('ComprasService', () => {
  let httpMock: HttpTestingController;
  let servicio: ComprasService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(ComprasService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('crearCompra', () => {
    it('llama POST /api/compras sin encabezado Authorization', async () => {
      const promesa = servicio.crearCompra(datosValidos);

      const peticion = httpMock.expectOne('/api/compras');
      expect(peticion.request.method).toBe('POST');
      expect(peticion.request.headers.has('Authorization')).toBe(false);
      expect(peticion.request.body).toEqual(datosValidos);
      peticion.flush({
        compraId: 'compra-1',
        estado: 'esperando_comprobante',
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
      });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: true,
        compra: {
          compraId: 'compra-1',
          estado: 'esperando_comprobante',
          cantidad: 2,
          montoTotal: 90000,
          expiraEn: '2026-08-08T00:10:00.000Z',
        },
      });
    });

    it('devuelve el mensaje de error del backend ante un fallo (ej. aforo insuficiente)', async () => {
      const promesa = servicio.crearCompra(datosValidos);

      const peticion = httpMock.expectOne('/api/compras');
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
      const promesa = servicio.crearCompra(datosValidos);

      const peticion = httpMock.expectOne('/api/compras');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo iniciar la compra. Intenta de nuevo.',
      });
    });
  });
});
