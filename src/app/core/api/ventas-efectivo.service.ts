import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';

export interface DatosClienteEfectivo {
  nombre: string;
  telefono: string;
  correo: string;
}

export interface DatosNuevaVentaEfectivo {
  slug: string;
  cantidad: number;
  cliente: DatosClienteEfectivo;
  autorizacionDatos: boolean;
}

export interface VentaEfectivoRegistrada {
  compraId: string;
  estado: string;
  cantidad: number;
  montoTotal: number;
  boletas: number;
}

export type ResultadoCrearVentaEfectivo =
  | { exito: true; venta: VentaEfectivoRegistrada }
  | { exito: false; error: string };

/**
 * Cliente de `POST /api/ventas-efectivo` (`exigirRol('portero')`,
 * `tech-specs.md` §5.1, `TODO.md` Tarea 2) — autenticado, mismo criterio que
 * `ValidacionPuertaService`: a diferencia de `ComprasService` (público), sí
 * envía `Authorization`. El precio/total siempre lo calcula el backend a
 * partir de la etapa vigente real — este servicio nunca lo envía ni lo
 * valida, solo muestra el que el backend devuelve.
 */
@Injectable({ providedIn: 'root' })
export class VentasEfectivoService {
  private readonly http = inject(HttpClient);
  private readonly servicioAuth = inject(ServicioAuth);

  private mensajeError(error: unknown, mensajePorDefecto: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
      ? error.error.mensaje
      : mensajePorDefecto;
  }

  /** Llama `POST /api/ventas-efectivo` con el ID Token actual. */
  async crearVenta(datos: DatosNuevaVentaEfectivo): Promise<ResultadoCrearVentaEfectivo> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return { exito: false, error: 'No se pudo registrar la venta. Intenta de nuevo.' };
    }

    try {
      const venta = await firstValueFrom(
        this.http.post<VentaEfectivoRegistrada>('/api/ventas-efectivo', datos, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      );
      return { exito: true, venta };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo registrar la venta. Intenta de nuevo.'),
      };
    }
  }
}
