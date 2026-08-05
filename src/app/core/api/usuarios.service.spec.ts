import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ServicioAuth } from '../auth/servicio-auth';
import type { Usuario } from '../models/usuario.model';
import { UsuariosService } from './usuarios.service';

// `servicio-auth.ts` (importado arriba solo como token de DI) importa el
// SDK real de Firebase a nivel de módulo. Se mockea aquí (igual que en
// servicio-auth.spec.ts) para que este archivo nunca lo cargue de verdad y
// "envenene" el registro de módulos compartido entre archivos de prueba.
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

const usuarioEjemplo: Usuario = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador',
  activo: true,
  creadoEn: '2026-08-05T00:00:00.000Z',
};

describe('UsuariosService', () => {
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
    return TestBed.inject(UsuariosService);
  }

  afterEach(() => {
    httpMock.verify();
  });

  describe('cargarUsuarios', () => {
    it('deja usuarios en [] y marca error cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      await servicio.cargarUsuarios();

      expect(servicio.usuarios()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });

    it('resuelve el listado y actualiza el Signal cuando la API responde 200', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.cargarUsuarios();
      await Promise.resolve();
      const peticion = httpMock.expectOne('/api/usuarios');
      expect(peticion.request.headers.get('Authorization')).toBe('Bearer token-valido');
      peticion.flush([usuarioEjemplo]);
      await promesa;

      expect(servicio.usuarios()).toEqual([usuarioEjemplo]);
      expect(servicio.error()).toBe(false);
    });

    it('deja usuarios en [] y marca error cuando la API responde 403', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.cargarUsuarios();
      await Promise.resolve();
      httpMock
        .expectOne('/api/usuarios')
        .flush({ mensaje: 'No autorizado en Ágora' }, { status: 403, statusText: 'Forbidden' });
      await promesa;

      expect(servicio.usuarios()).toEqual([]);
      expect(servicio.error()).toBe(true);
    });
  });

  describe('crearUsuario', () => {
    it('devuelve error sin llamar a la API cuando no hay ID Token', async () => {
      const servicio = configurarPrueba(null);

      const resultado = await servicio.crearUsuario({
        email: 'nuevo@letiende.co',
        nombre: 'Nuevo',
        rol: 'portero',
      });

      expect(resultado).toEqual({
        exito: false,
        error: 'No se pudo crear el usuario. Intenta de nuevo.',
      });
    });

    it('crea el usuario, recarga el listado y devuelve éxito cuando la API responde 201', async () => {
      const servicio = configurarPrueba('token-valido');
      const usuarioCreado: Usuario = {
        ...usuarioEjemplo,
        email: 'nuevo@letiende.co',
        rol: 'portero',
      };

      const promesa = servicio.crearUsuario({
        email: 'nuevo@letiende.co',
        nombre: 'Nuevo',
        rol: 'portero',
      });
      await Promise.resolve();
      const peticionCrear = httpMock.expectOne('/api/usuarios');
      expect(peticionCrear.request.method).toBe('POST');
      peticionCrear.flush(usuarioCreado, { status: 201, statusText: 'Created' });

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/usuarios').flush([usuarioCreado]);

      expect(await promesa).toEqual({ exito: true });
      expect(servicio.usuarios()).toEqual([usuarioCreado]);
    });

    it('devuelve el mensaje de error del backend cuando la API responde 409', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.crearUsuario({
        email: 'admin@letiende.co',
        nombre: 'Admin',
        rol: 'administrador',
      });
      await Promise.resolve();
      httpMock
        .expectOne('/api/usuarios')
        .flush(
          { mensaje: 'Ya existe un usuario registrado con ese correo' },
          { status: 409, statusText: 'Conflict' },
        );

      expect(await promesa).toEqual({
        exito: false,
        error: 'Ya existe un usuario registrado con ese correo',
      });
    });
  });

  describe('actualizarUsuario', () => {
    it('actualiza el usuario, recarga el listado y devuelve éxito cuando la API responde 200', async () => {
      const servicio = configurarPrueba('token-valido');
      const usuarioActualizado: Usuario = { ...usuarioEjemplo, nombre: 'Otro nombre' };

      const promesa = servicio.actualizarUsuario('admin@letiende.co', { nombre: 'Otro nombre' });
      await Promise.resolve();
      const peticionActualizar = httpMock.expectOne('/api/usuarios/admin@letiende.co');
      expect(peticionActualizar.request.method).toBe('PUT');
      peticionActualizar.flush(usuarioActualizado);

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/usuarios').flush([usuarioActualizado]);

      expect(await promesa).toEqual({ exito: true });
    });

    it('devuelve el mensaje de la salvaguarda de autodegradación cuando la API responde 400', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.actualizarUsuario('admin@letiende.co', { rol: 'portero' });
      await Promise.resolve();
      httpMock.expectOne('/api/usuarios/admin@letiende.co').flush(
        {
          mensaje:
            'No puedes degradar tu propio rol de administrador. Pídele a otro administrador que lo haga.',
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(await promesa).toEqual({
        exito: false,
        error:
          'No puedes degradar tu propio rol de administrador. Pídele a otro administrador que lo haga.',
      });
    });
  });

  describe('eliminarUsuario', () => {
    it('elimina el usuario, recarga el listado y devuelve éxito cuando la API responde 204', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.eliminarUsuario('otro@letiende.co');
      await Promise.resolve();
      const peticionEliminar = httpMock.expectOne('/api/usuarios/otro@letiende.co');
      expect(peticionEliminar.request.method).toBe('DELETE');
      peticionEliminar.flush(null, { status: 204, statusText: 'No Content' });

      await Promise.resolve();
      await Promise.resolve();
      httpMock.expectOne('/api/usuarios').flush([]);

      expect(await promesa).toEqual({ exito: true });
    });

    it('devuelve el mensaje de la salvaguarda de autoeliminación cuando la API responde 400', async () => {
      const servicio = configurarPrueba('token-valido');

      const promesa = servicio.eliminarUsuario('admin@letiende.co');
      await Promise.resolve();
      httpMock
        .expectOne('/api/usuarios/admin@letiende.co')
        .flush(
          { mensaje: 'No puedes eliminarte a ti mismo. Pídele a otro administrador que lo haga.' },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(await promesa).toEqual({
        exito: false,
        error: 'No puedes eliminarte a ti mismo. Pídele a otro administrador que lo haga.',
      });
    });
  });
});
