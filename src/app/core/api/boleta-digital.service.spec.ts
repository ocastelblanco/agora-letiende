import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BoletaDigitalService } from './boleta-digital.service';

function configurarPrueba() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const servicio = TestBed.inject(BoletaDigitalService);
  return { httpMock, servicio };
}

describe('BoletaDigitalService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('llama GET /api/boletas/:codigo sin Authorization', async () => {
    const { httpMock, servicio } = configurarPrueba();

    const promesa = servicio.obtenerBoleta('bol-1.firma123');
    const peticion = httpMock.expectOne('/api/boletas/bol-1.firma123');
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.headers.has('Authorization')).toBe(false);
    peticion.flush({
      boletaId: 'bol-1',
      numeroEnCompra: 1,
      estado: 'valida',
      nombreEvento: 'Concierto de jazz',
      descripcionEvento: 'Una noche de jazz',
      fechaHora: '2026-09-15T01:00:00.000Z',
      direccion: 'Bogotá, Colombia',
      etapaNombre: 'Preventa',
      nombreCliente: 'Ana Pérez',
      qrPng: 'aGVsbG8=',
    });

    const resultado = await promesa;
    expect(resultado).toEqual({
      exito: true,
      boleta: {
        boletaId: 'bol-1',
        numeroEnCompra: 1,
        estado: 'valida',
        nombreEvento: 'Concierto de jazz',
        descripcionEvento: 'Una noche de jazz',
        fechaHora: '2026-09-15T01:00:00.000Z',
        direccion: 'Bogotá, Colombia',
        etapaNombre: 'Preventa',
        nombreCliente: 'Ana Pérez',
        qrPng: 'aGVsbG8=',
      },
    });
  });

  it('devuelve el error del backend (ej. boleta inválida o inexistente)', async () => {
    const { httpMock, servicio } = configurarPrueba();

    const promesa = servicio.obtenerBoleta('bol-x.firma-mala');
    const peticion = httpMock.expectOne('/api/boletas/bol-x.firma-mala');
    peticion.flush({ mensaje: 'Boleta inválida o inexistente' }, { status: 404, statusText: 'Not Found' });

    const resultado = await promesa;
    expect(resultado).toEqual({ exito: false, error: 'Boleta inválida o inexistente' });
  });
});
