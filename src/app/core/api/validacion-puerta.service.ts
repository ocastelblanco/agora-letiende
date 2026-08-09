import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ServicioAuth } from '../auth/servicio-auth';

export type VeredictoValidacion = 'VALIDA' | 'YA_USADA' | 'OTRO_EVENTO' | 'NO_EXISTE';

export interface ResultadoValidacion {
  veredicto: VeredictoValidacion;
  boletaId?: string;
  numeroEnCompra?: number;
  ingresoEn?: string;
}

/**
 * Cliente de `POST /api/boletas/:codigo/validar` (`exigirRol('portero')`,
 * `tech-specs.md` §5.1, `TODO.md` Tarea 2) — autenticado, mismo criterio
 * que `AprobacionesService.cargarPendientes`. Sin token de enlace mágico:
 * el `codigo` escaneado de la boleta es el identificador, el `Authorization`
 * del portero es la credencial.
 */
@Injectable({ providedIn: 'root' })
export class ValidacionPuertaService {
  private readonly http = inject(HttpClient);
  private readonly servicioAuth = inject(ServicioAuth);

  /**
   * Devuelve `null` (nunca lanza) si no hay sesión o la petición falla —
   * el componente lo trata como un error de red distinto de los cuatro
   * veredictos de negocio, que siempre llegan en un `200`.
   */
  async validarBoleta(codigo: string, eventoId: string): Promise<ResultadoValidacion | null> {
    const idToken = await this.servicioAuth.obtenerIdToken();
    if (!idToken) {
      return null;
    }

    try {
      return await firstValueFrom(
        this.http.post<ResultadoValidacion>(
          `/api/boletas/${codigo}/validar`,
          { eventoId },
          { headers: { Authorization: `Bearer ${idToken}` } },
        ),
      );
    } catch {
      return null;
    }
  }
}
