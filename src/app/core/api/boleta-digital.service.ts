import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface BoletaDigital {
  boletaId: string;
  numeroEnCompra: number;
  estado: string;
  nombreEvento: string;
  descripcionEvento: string;
  fechaHora: string;
  direccion: string;
  logotipoUrl?: string;
  etapaNombre?: string;
  nombreCliente?: string;
  qrPng: string;
}

export type ResultadoObtenerBoleta =
  | { exito: true; boleta: BoletaDigital }
  | { exito: false; error: string };

/**
 * Cliente de `GET /api/boletas/:codigo` (`tech-specs.md` §5.1, `TODO.md`
 * Tarea 2) — público, sin `Authorization`: el código en la URL (con su
 * firma) es la única credencial, mismo criterio que `ComprobantesService`.
 */
@Injectable({ providedIn: 'root' })
export class BoletaDigitalService {
  private readonly http = inject(HttpClient);

  async obtenerBoleta(codigo: string): Promise<ResultadoObtenerBoleta> {
    try {
      const boleta = await firstValueFrom(this.http.get<BoletaDigital>(`/api/boletas/${codigo}`));
      return { exito: true, boleta };
    } catch (error) {
      const mensaje =
        error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
          ? error.error.mensaje
          : 'No se pudo cargar esta boleta. Intenta de nuevo.';
      return { exito: false, error: mensaje };
    }
  }
}
