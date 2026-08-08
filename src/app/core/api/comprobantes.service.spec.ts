import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ComprobantesService } from './comprobantes.service';

function archivoDePrueba(): File {
  return new File(['contenido'], 'comprobante.png', { type: 'image/png' });
}

describe('ComprobantesService', () => {
  let httpMock: HttpTestingController;
  let servicio: ComprobantesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    servicio = TestBed.inject(ComprobantesService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('subirComprobante', () => {
    it('pide la URL prefirmada, sube el archivo directo a S3 y confirma, sin Authorization', async () => {
      const archivo = archivoDePrueba();
      const promesa = servicio.subirComprobante('token-abc', archivo);

      await Promise.resolve();
      const peticionUrlCarga = httpMock.expectOne('/api/comprobantes/token-abc/url-carga');
      expect(peticionUrlCarga.request.method).toBe('POST');
      expect(peticionUrlCarga.request.headers.has('Authorization')).toBe(false);
      expect(peticionUrlCarga.request.body).toEqual({ tipoMime: 'image/png', tamano: archivo.size });
      peticionUrlCarga.flush({ url: 'https://s3.amazonaws.com/presignada', key: 'compras/c1/comprobante-x.png' });

      await Promise.resolve();
      const peticionS3 = httpMock.expectOne('https://s3.amazonaws.com/presignada');
      expect(peticionS3.request.method).toBe('PUT');
      expect(peticionS3.request.headers.get('Content-Type')).toBe('image/png');
      expect(peticionS3.request.headers.has('Authorization')).toBe(false);
      peticionS3.flush(null);

      await Promise.resolve();
      const peticionConfirmar = httpMock.expectOne('/api/comprobantes/token-abc/confirmar');
      expect(peticionConfirmar.request.method).toBe('POST');
      peticionConfirmar.flush({ estado: 'en_revision' });

      const resultado = await promesa;
      expect(resultado).toEqual({ exito: true });
    });

    it('devuelve el mensaje de error del backend si el enlace ya venció', async () => {
      const promesa = servicio.subirComprobante('token-vencido', archivoDePrueba());

      const peticion = httpMock.expectOne('/api/comprobantes/token-vencido/url-carga');
      peticion.flush(
        { mensaje: 'Este enlace ya venció y la reserva se canceló. Puedes volver a intentar la compra.' },
        { status: 410, statusText: 'Gone' },
      );

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'Este enlace ya venció y la reserva se canceló. Puedes volver a intentar la compra.',
      });
    });

    it('devuelve el error del backend si el archivo no pasa la verificación de magic bytes', async () => {
      const archivo = archivoDePrueba();
      const promesa = servicio.subirComprobante('token-abc', archivo);

      const peticionUrlCarga = httpMock.expectOne('/api/comprobantes/token-abc/url-carga');
      peticionUrlCarga.flush({ url: 'https://s3.amazonaws.com/presignada', key: 'compras/c1/comprobante-x.png' });

      await Promise.resolve();
      const peticionS3 = httpMock.expectOne('https://s3.amazonaws.com/presignada');
      peticionS3.flush(null);

      await Promise.resolve();
      const peticionConfirmar = httpMock.expectOne('/api/comprobantes/token-abc/confirmar');
      peticionConfirmar.flush(
        { mensaje: 'El archivo subido no es una imagen o PDF válido. Intenta de nuevo.' },
        { status: 400, statusText: 'Bad Request' },
      );

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'El archivo subido no es una imagen o PDF válido. Intenta de nuevo.',
      });
    });

    it('devuelve un mensaje genérico si la respuesta de error no trae mensaje', async () => {
      const promesa = servicio.subirComprobante('token-abc', archivoDePrueba());

      const peticion = httpMock.expectOne('/api/comprobantes/token-abc/url-carga');
      peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo subir el comprobante. Intenta de nuevo.',
      });
    });
  });
});
