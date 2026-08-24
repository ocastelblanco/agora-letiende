import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ServicioAuth } from '../auth/servicio-auth';
import type { Evento } from '../models/evento.model';
import { EventosService } from './eventos.service';

// Mismo motivo que en usuarios.service.spec.ts: `servicio-auth.ts` importa
// el SDK real de Firebase a nivel de módulo.
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(function () {
    return { setCustomParameters: vi.fn() };
  }),
}));

const eventoEjemplo: Evento = {
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
  productores: [],
  porteros: [],
  estado: 'borrador',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

describe('EventosService', () => {
  let httpMock: HttpTestingController;
  let obtenerIdTokenMock: ReturnType<typeof vi.fn>;

  function configurarPrueba(idTokenResuelto: string | null) {
    obtenerIdTokenMock = vi.fn().mockResolvedValue(idTokenResuelto);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ServicioAuth, useValue: { obtenerIdToken: obtenerIdTokenMock } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(EventosService);
  }

  afterEach(() => {
    httpMock.verify();
  });

  describe('cargarEventos', () => {
    it('deja eventos en [] y marca error cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      await servicio.cargarEventos();

      expect(servicio.eventos()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });

    it('resuelve el listado y actualiza el Signal cuando la API responde 200', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.cargarEventos();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/eventos');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush([eventoEjemplo]);
      await promesa;

      expect(servicio.eventos()).toEqual([eventoEjemplo]);
      expect(servicio.error()).toBe(false);
    });

    it('deja eventos en [] y marca error cuando la API responde 403', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.cargarEventos();
      await Promise.resolve();
      httpMock
        .expectOne('/api/eventos')
        .flush({ mensaje: 'No autorizado en Ágora' }, { status: 403, statusText: 'Forbidden' });
      await promesa;

      expect(servicio.eventos()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });
  });

  describe('crearEvento', () => {
    it('devuelve error sin llamar a la API cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      const resultado = await servicio.crearEvento({
        slug: 'x',
        nombre: 'X',
        descripcion: 'X',
        fechaHora: '2026-09-15T01:00:00.000Z',
        administradoPorLeTiende: true,
        sillasTotales: 10,
        maxBoletasPorCompra: 4,
        etapas: [],
        mediosPago: ['efectivo'],
        productores: [],
      });

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo crear el evento. Intenta de nuevo.',
      });
    });

    it('crea el evento, recarga el listado y devuelve éxito cuando la API responde 201', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.crearEvento({
        slug: eventoEjemplo.slug,
        nombre: eventoEjemplo.nombre,
        descripcion: eventoEjemplo.descripcion,
        fechaHora: eventoEjemplo.fechaHora,
        administradoPorLeTiende: true,
        sillasTotales: eventoEjemplo.sillasTotales,
        maxBoletasPorCompra: eventoEjemplo.maxBoletasPorCompra,
        etapas: [{ nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 }],
        mediosPago: ['efectivo'],
        productores: [],
      });
      await Promise.resolve();
      const peticionCrear = httpMock.expectOne('/api/eventos');
      expect(peticionCrear.request.method).toBe('POST');
      expect(peticionCrear.request.body.eventoId).toBeUndefined();
      peticionCrear.flush(eventoEjemplo, { status: 201, statusText: 'Created' });

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/eventos').flush([eventoEjemplo]);

      expect(await promesa).toEqual({ exito: true, evento: eventoEjemplo });
      expect(servicio.eventos()).toEqual([eventoEjemplo]);
    });

    it('devuelve el mensaje de error del backend cuando la API responde 400', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.crearEvento({
        slug: 'x',
        nombre: 'X',
        descripcion: 'X',
        fechaHora: '2026-09-15T01:00:00.000Z',
        administradoPorLeTiende: true,
        sillasTotales: 10,
        maxBoletasPorCompra: 4,
        etapas: [],
        mediosPago: ['efectivo'],
        productores: [],
      });
      await Promise.resolve();
      httpMock
        .expectOne('/api/eventos')
        .flush({ mensaje: 'etapas debe ser un arreglo con al menos una etapa válida' }, { status: 400, statusText: 'Bad Request' });

      expect(await promesa).toEqual({
        exito: false,
        error: 'etapas debe ser un arreglo con al menos una etapa válida',
      });
    });
  });

  describe('actualizarEvento', () => {
    it('actualiza el evento, recarga el listado y devuelve éxito cuando la API responde 200', async () => {
      const servicio = configurarPrueba('token-valido');
      const eventoActualizado: Evento = { ...eventoEjemplo, nombre: 'Otro nombre' };

      const promesa = servicio.actualizarEvento('e1', { nombre: 'Otro nombre' });
      await Promise.resolve();
      const peticionActualizar = httpMock.expectOne('/api/eventos/e1');
      expect(peticionActualizar.request.method).toBe('PUT');
      peticionActualizar.flush(eventoActualizado);

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/eventos').flush([eventoActualizado]);

      expect(await promesa).toEqual({ exito: true, evento: eventoActualizado });
    });
  });

  describe('eliminarEvento', () => {
    it('elimina el evento, recarga el listado y devuelve éxito cuando la API responde 204', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.eliminarEvento('e1');
      await Promise.resolve();
      const peticionEliminar = httpMock.expectOne('/api/eventos/e1');
      expect(peticionEliminar.request.method).toBe('DELETE');
      peticionEliminar.flush(null, { status: 204, statusText: 'No Content' });

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/eventos').flush([]);

      expect(await promesa).toEqual({ exito: true });
    });

    it('devuelve error sin llamar a la API cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      const resultado = await servicio.eliminarEvento('e1');

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo eliminar el evento. Intenta de nuevo.',
      });
    });

    it('devuelve el mensaje de error del backend cuando la API responde 404', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.eliminarEvento('inexistente');
      await Promise.resolve();
      httpMock
        .expectOne('/api/eventos/inexistente')
        .flush({ mensaje: 'No existe un evento con ese eventoId' }, { status: 404, statusText: 'Not Found' });

      expect(await promesa).toEqual({
        exito: false,
        error: 'No existe un evento con ese eventoId',
      });
    });
  });

  describe('subirActivo', () => {
    it('devuelve error sin llamar a la API cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      const resultado = await servicio.subirActivo(
        'e1',
        'imagen',
        new File(['contenido'], 'foto.png', { type: 'image/png' }),
      );

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo subir el archivo. Intenta de nuevo.',
      });
    });

    it('pide la URL prefirmada y sube el archivo directo a S3, sin encabezado Authorization', async () => {
      const servicio = configurarPrueba('token-valido');
      const archivo = new File(['contenido'], 'foto.png', { type: 'image/png' });

      const promesa = servicio.subirActivo('e1', 'imagen', archivo);
      await Promise.resolve();
      const peticionUrl = httpMock.expectOne('/api/eventos/e1/activos/url-carga');
      expect(peticionUrl.request.method).toBe('POST');
      expect(peticionUrl.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticionUrl.flush({ url: 'https://s3.example.com/presignada', key: 'eventos/e1/imagen-abc.png' });

      await Promise.resolve();
      const peticionS3 = httpMock.expectOne('https://s3.example.com/presignada');
      expect(peticionS3.request.method).toBe('PUT');
      expect(peticionS3.request.headers.get('Authorization')).toBeNull();
      expect(peticionS3.request.headers.get('Content-Type')).toBe('image/png');
      peticionS3.flush(null);

      expect(await promesa).toEqual({ exito: true, key: 'eventos/e1/imagen-abc.png' });
    });
  });

  describe('descargarQr', () => {
    it('devuelve error sin llamar a la API cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      const resultado = await servicio.descargarQr('e1', 'svg');

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo descargar el QR. Intenta de nuevo.',
      });
    });

    it('pide el formato correcto y usa el nombre de archivo del header Content-Disposition', async () => {
      const servicio = configurarPrueba('token-valido');
      const contenidoSvg = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });

      const promesa = servicio.descargarQr('e1', 'svg');
      await Promise.resolve();
      const peticion = httpMock.expectOne(
        (r) => r.url === '/api/eventos/e1/qr' && r.params.get('formato') === 'svg',
      );
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush(contenidoSvg, {
        headers: { 'Content-Disposition': 'attachment; filename="qr-concierto-jazz.svg"' },
      });

      const resultado = await promesa;
      expect(resultado).toEqual({
        exito: true,
        blob: contenidoSvg,
        nombreArchivo: 'qr-concierto-jazz.svg',
      });
    });

    it('usa un nombre de archivo genérico si el backend no envía Content-Disposition', async () => {
      const servicio = configurarPrueba('token-valido');
      const contenidoPng = new Blob(['png'], { type: 'image/png' });

      const promesa = servicio.descargarQr('e1', 'png');
      await Promise.resolve();
      httpMock
        .expectOne((r) => r.url === '/api/eventos/e1/qr' && r.params.get('formato') === 'png')
        .flush(contenidoPng);

      const resultado = await promesa;
      expect(resultado).toEqual({ exito: true, blob: contenidoPng, nombreArchivo: 'qr-evento.png' });
    });

    it('devuelve el mensaje de error por defecto cuando la API falla', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.descargarQr('inexistente', 'svg');
      await Promise.resolve();
      httpMock
        .expectOne(
          (r) => r.url === '/api/eventos/inexistente/qr' && r.params.get('formato') === 'svg',
        )
        .flush(new Blob(), { status: 404, statusText: 'Not Found' });

      expect(await promesa).toEqual({
        exito: false,
        error: 'No se pudo descargar el QR. Intenta de nuevo.',
      });
    });
  });
});
