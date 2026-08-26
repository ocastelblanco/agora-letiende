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
  // Roadmap #19 (Bold) — se envía explícito cuando el evento ofrece 1 o 2
  // medios de pago públicos (con 1 solo, sin selector, ya resuelto; con 2,
  // el elegido por el cliente); ausente solo cuando ofrece 0 (ver el mismo
  // criterio documentado en comprar.component.ts).
  medioPago?: 'transferencia' | 'bold';
}

/** Mismo set que `EstadoCompra` del backend (`server/api/handlers/compras.ts`). */
export type EstadoCompra =
  | 'esperando_comprobante'
  | 'esperando_pago_bold'
  | 'en_revision'
  | 'aprobada'
  | 'rechazada'
  | 'expirada';

export interface CompraCreada {
  compraId: string;
  estado: EstadoCompra;
  cantidad: number;
  montoTotal: number;
  // v2 (roadmap #24) — ausente cuando el evento no tiene etapas: la
  // adquisición se resuelve de inmediato, sin plazo de comprobante.
  expiraEn?: string;
  // v2 (roadmap #24) — presente solo en ese mismo caso: cuántas boletas ya
  // se emitieron en la misma respuesta.
  boletas?: number;
  // Roadmap #19 (Bold) — presente solo cuando `estado === 'esperando_pago_bold'`.
  // Estos campos alimentan la instanciación de `window.BoldCheckout` en el
  // frontend (objeto de config en camelCase, no atributos `data-*`) tal cual
  // llegan del backend, nunca calculados en el cliente.
  bold?: { llaveIdentidad: string; firma: string; moneda: string };
}

export type ResultadoCrearCompra =
  | { exito: true; compra: CompraCreada }
  | { exito: false; error: string };

/** `GET /api/compras/:compraId/estado` devuelve el mismo shape sin datos personales. */
export type ResultadoConsultarEstadoCompra =
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

  /** Llama `GET /api/compras/:compraId/estado` — público, sin datos personales. */
  async consultarEstadoCompra(compraId: string): Promise<ResultadoConsultarEstadoCompra> {
    try {
      const compra = await firstValueFrom(
        this.http.get<CompraCreada>(`/api/compras/${compraId}/estado`),
      );
      return { exito: true, compra };
    } catch (error) {
      return {
        exito: false,
        error: this.mensajeError(error, 'No se pudo consultar el estado de la compra.'),
      };
    }
  }
}
