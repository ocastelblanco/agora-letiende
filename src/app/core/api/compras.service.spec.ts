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
    it('envía una Idempotency-Key UUID v4, la reutiliza en un reintento y la renueva tras un éxito', async () => {
      const primera = servicio.crearCompra(datosValidos);
      const peticion1 = httpMock.expectOne('/api/compras');
      const clave = peticion1.request.headers.get('Idempotency-Key');
      expect(clave).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      peticion1.flush({ mensaje: 'Error interno' }, { status: 500, statusText: 'Error' });
      await primera;

      const reintento = servicio.crearCompra(datosValidos);
      const peticion2 = httpMock.expectOne('/api/compras');
      expect(peticion2.request.headers.get('Idempotency-Key')).toBe(clave);
      peticion2.flush({ compraId: 'compra-1', estado: 'esperando_comprobante', cantidad: 2, montoTotal: 90000 });
      await reintento;

      const nueva = servicio.crearCompra(datosValidos);
      const peticion3 = httpMock.expectOne('/api/compras');
      expect(peticion3.request.headers.get('Idempotency-Key')).not.toBe(clave);
      peticion3.flush({ compraId: 'compra-2', estado: 'esperando_comprobante', cantidad: 2, montoTotal: 90000 });
      await nueva;
    });

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

  describe('consultarEstadoCompra', () => {
    it('llama GET /api/compras/:compraId/estado', async () => {
      const promesa = servicio.consultarEstadoCompra('compra-1');

      const peticion = httpMock.expectOne('/api/compras/compra-1/estado');
      expect(peticion.request.method).toBe('GET');
      peticion.flush({
        compraId: 'compra-1',
        estado: 'esperando_pago_bold',
        cantidad: 2,
        montoTotal: 90000,
        expiraEn: '2026-08-08T00:10:00.000Z',
      });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: true,
        compra: {
          compraId: 'compra-1',
          estado: 'esperando_pago_bold',
          cantidad: 2,
          montoTotal: 90000,
          expiraEn: '2026-08-08T00:10:00.000Z',
        },
      });
    });

    it('devuelve el mensaje de error del backend ante un fallo (mismo manejo que crearCompra)', async () => {
      const promesa = servicio.consultarEstadoCompra('compra-1');

      const peticion = httpMock.expectOne('/api/compras/compra-1/estado');
      peticion.flush({ mensaje: 'Compra no encontrada' }, { status: 404, statusText: 'Not Found' });

      const resultado = await promesa;
      expect(resultado).toEqual({ exito: false, error: 'Compra no encontrada' });
    });

    it('devuelve un mensaje genérico si la respuesta de error no trae mensaje', async () => {
      const promesa = servicio.consultarEstadoCompra('compra-1');

      const peticion = httpMock.expectOne('/api/compras/compra-1/estado');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo consultar el estado de la compra.',
      });
    });
  });
});
