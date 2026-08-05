import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';
import { DatosNuevoUsuario, DatosUsuario, Usuario } from '../models/usuario.model';

/**
 * Resultado de una operación de escritura (`crearUsuario`/`actualizarUsuario`/`eliminarUsuario`):
 * nunca lanza, pero necesita devolver un mensaje específico para mostrarlo
 * en `GestionUsuariosComponent` (ej. el 400 de la salvaguarda de
 * autodegradación/autoeliminación de `server/api/handlers/usuarios.ts`).
 */
export type ResultadoOperacionUsuario = { exito: true } | { exito: false; error: string };

/**
 * Cliente de `/api/usuarios` (tech-specs.md §5.1, TODO.md Tarea 1) — CRUD
 * exclusivo de `administrador`, siempre revalidado en el backend
 * (`CLAUDE.md` §5, A01). Nunca lanza: ante error de red o de autorización,
 * deja `usuarios` en `[]` y marca `error`, o devuelve
 * `{ exito: false, error }` en las operaciones de escritura.
 */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly http = inject(HttpClient);

  private readonly usuariosSignal = signal<Usuario[]>([]);
  /** Último listado resuelto por `cargarUsuarios()`. */
  readonly usuarios = this.usuariosSignal.asReadonly();

  private readonly errorSignal = signal(false);
  /** `true` si la última llamada a `cargarUsuarios()` falló. */
  readonly error = this.errorSignal.asReadonly();

  /** Llama `GET /api/usuarios` con el ID Token actual. */
  async cargarUsuarios(): Promise<void> {
    this.errorSignal.set(false);

    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      this.usuariosSignal.set([]);
      this.errorSignal.set(true);
      return;
    }

    try {
      const usuarios = await firstValueFrom(
        this.http.get<Usuario[]>('/api/usuarios', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      this.usuariosSignal.set(usuarios);
    } catch {
      this.usuariosSignal.set([]);
      this.errorSignal.set(true);
    }
  }

  private mensajeError(error: unknown, mensajePorDefecto: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
      ? error.error.mensaje
      : mensajePorDefecto;
  }

  /**
   * Llama `POST /api/usuarios`. Tras un `201` exitoso, recarga `usuarios`
   * con `cargarUsuarios()`. Devuelve `{ exito: false, error }` ante sesión
   * ausente, `403` (rol insuficiente), `409` (correo ya registrado),
   * `400` (datos inválidos) o error de red.
   */
  async crearUsuario(datos: DatosNuevoUsuario): Promise<ResultadoOperacionUsuario> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo crear el usuario. Intenta de nuevo.' };
    }

    try {
      await firstValueFrom(
        this.http.post<Usuario>('/api/usuarios', datos, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarUsuarios();
      return { exito: true };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo crear el usuario. Intenta de nuevo.'),
      };
    }
  }

  /**
   * Llama `PUT /api/usuarios/{email}`. Tras un `200` exitoso, recarga
   * `usuarios`. Devuelve `{ exito: false, error }` ante sesión ausente,
   * `403`, `404` (correo inexistente) o el `400` de la salvaguarda de
   * autodegradación (un administrador no puede cambiar su propio rol vía
   * este endpoint).
   */
  async actualizarUsuario(email: string, datos: DatosUsuario): Promise<ResultadoOperacionUsuario> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo actualizar el usuario. Intenta de nuevo.' };
    }

    try {
      await firstValueFrom(
        this.http.put<Usuario>(`/api/usuarios/${email}`, datos, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarUsuarios();
      return { exito: true };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo actualizar el usuario. Intenta de nuevo.'),
      };
    }
  }

  /**
   * Llama `DELETE /api/usuarios/{email}`. Tras un `204` exitoso, recarga
   * `usuarios`. Devuelve `{ exito: false, error }` ante sesión ausente,
   * `403`, `404` o el `400` de la salvaguarda de autoeliminación (un
   * administrador no puede eliminarse a sí mismo vía este endpoint).
   */
  async eliminarUsuario(email: string): Promise<ResultadoOperacionUsuario> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo eliminar el usuario. Intenta de nuevo.' };
    }

    try {
      await firstValueFrom(
        this.http.delete<void>(`/api/usuarios/${email}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      await this.cargarUsuarios();
      return { exito: true };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo eliminar el usuario. Intenta de nuevo.'),
      };
    }
  }
}
