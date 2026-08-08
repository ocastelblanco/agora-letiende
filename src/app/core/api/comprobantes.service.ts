import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ResultadoSubidaComprobante = { exito: true } | { exito: false; error: string };

/**
 * Cliente de `/api/comprobantes/:token/*` (tech-specs.md §5.1, TODO.md
 * Tarea 2) — **público**: el token del enlace mágico en la URL es la única
 * credencial, nunca `Authorization` (mismo criterio que `ComprasService`).
 */
@Injectable({ providedIn: 'root' })
export class ComprobantesService {
  private readonly http = inject(HttpClient);

  private mensajeError(error: unknown, mensajePorDefecto: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
      ? error.error.mensaje
      : mensajePorDefecto;
  }

  /**
   * Pide la URL prefirmada (`POST .../url-carga`), sube el archivo directo
   * a S3 con ella (nunca pasa por nuestra API, mismo criterio que
   * `EventosService.subirActivo`) y confirma la carga (`POST
   * .../confirmar`), que es lo que transiciona la compra a `en_revision`.
   */
  async subirComprobante(token: string, archivo: File): Promise<ResultadoSubidaComprobante> {
    try {
      const { url } = await firstValueFrom(
        this.http.post<{ url: string; key: string }>(`/api/comprobantes/${token}/url-carga`, {
          tipoMime: archivo.type,
          tamano: archivo.size,
        }),
      );

      await firstValueFrom(
        this.http.put(url, archivo, { headers: { 'Content-Type': archivo.type } }),
      );

      await firstValueFrom(this.http.post(`/api/comprobantes/${token}/confirmar`, {}));

      return { exito: true };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo subir el comprobante. Intenta de nuevo.'),
      };
    }
  }
}
