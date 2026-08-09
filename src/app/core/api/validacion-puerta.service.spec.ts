import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ValidacionPuertaService } from './validacion-puerta.service';
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
  const servicio = TestBed.inject(ValidacionPuertaService);
  return { httpMock, servicio };
}

describe('ValidacionPuertaService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('devuelve null sin llamar la API si no hay ID Token', async () => {
    const { httpMock, servicio } = configurarPrueba(null);

    const resultado = await servicio.validarBoleta('bol-1.firma', 'evt-1');

    expect(resultado).toBeNull();
    httpMock.expectNone('/api/boletas/bol-1.firma/validar');
  });

  it('llama POST /api/boletas/:codigo/validar con Authorization y el eventoId', async () => {
    const { httpMock, servicio } = configurarPrueba('token-valido');

    const promesa = servicio.validarBoleta('bol-1.firma', 'evt-1');
    await Promise.resolve();
    const peticion = httpMock.expectOne('/api/boletas/bol-1.firma/validar');
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
    expect(peticion.request.body).toEqual({ eventoId: 'evt-1' });
    peticion.flush({ veredicto: 'VALIDA', boletaId: 'bol-1', numeroEnCompra: 1 });

    const resultado = await promesa;
    expect(resultado).toEqual({ veredicto: 'VALIDA', boletaId: 'bol-1', numeroEnCompra: 1 });
  });

  it('devuelve null si la petición falla (error de red, distinto de un veredicto)', async () => {
    const { httpMock, servicio } = configurarPrueba('token-valido');

    const promesa = servicio.validarBoleta('bol-1.firma', 'evt-1');
    await Promise.resolve();
    const peticion = httpMock.expectOne('/api/boletas/bol-1.firma/validar');
    peticion.flush(null, { status: 500, statusText: 'Internal Server Error' });

    const resultado = await promesa;
    expect(resultado).toBeNull();
  });
});
