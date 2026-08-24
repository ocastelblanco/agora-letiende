import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface DatosCliente {
  nombre: string;
  telefono: string;
  correo: string;
}

export interface DatosNuevaCompra {
  slug: string;
  cantidad: number;
  cliente: DatosCliente;
  autorizacionDatos: boolean;
}

export interface CompraCreada {
  compraId: string;
  estado: string;
  cantidad: number;
  montoTotal: number;
  // v2 (roadmap #24) — ausente cuando el evento no tiene etapas: la
  // adquisición se resuelve de inmediato, sin plazo de comprobante.
  expiraEn?: string;
  // v2 (roadmap #24) — presente solo en ese mismo caso: cuántas boletas ya
  // se emitieron en la misma respuesta.
  boletas?: number;
}

export type ResultadoCrearCompra =
  | { exito: true; compra: CompraCreada }
  | { exito: false; error: string };

/**
 * Cliente de `/api/compras` (tech-specs.md §5.1, TODO.md Tarea 2) —
 * **público**: a diferencia de `EventosService`, nunca usa `ServicioAuth`
 * ni envía `Authorization` (mismo criterio que `EventosPublicosService`).
 * El precio/total siempre lo calcula el backend a partir de la etapa
 * vigente real — este servicio nunca lo envía ni lo valida, solo muestra
 * el que el backend devuelve.
 */
@Injectable({ providedIn: 'root' })
export class ComprasService {
  private readonly http = inject(HttpClient);

  private mensajeError(error: unknown, mensajePorDefecto: string): string {
    return error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string'
      ? error.error.mensaje
      : mensajePorDefecto;
  }

  /** Llama `POST /api/compras`. */
  async crearCompra(datos: DatosNuevaCompra): Promise<ResultadoCrearCompra> {
    try {
      const compra = await firstValueFrom(this.http.post<CompraCreada>('/api/compras', datos));
      return { exito: true, compra };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo iniciar la compra. Intenta de nuevo.'),
      };
    }
  }
}
