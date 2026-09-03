import { Injectable, PLATFORM_ID, REQUEST, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * `true` cuando la app se sirve embebida a través del proxy de letiende.co
 * (Host `letiende.co` o `staging.letiende.co`), `false` cuando se sirve
 * directo por su propio dominio (`agora.letiende.co`, staging sin dominio
 * propio, `localhost`). Función pura y testeable, mismo patrón que
 * `debeCargarAnalytics(hostname)` del contenedor.
 */
export function esEmbebido(hostname: string): boolean {
  return hostname === 'letiende.co' || hostname === 'staging.letiende.co';
}

@Injectable({ providedIn: 'root' })
export class EmbebidoService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });

  /**
   * Se calcula una sola vez por instancia (una instancia por petición en
   * SSR, dado que `providedIn: 'root'` crea un injector nuevo por render
   * del lado servidor). En el navegador usa `window.location.hostname`
   * (autoritativo); en SSR usa el header `Host` de la petición real vía
   * `REQUEST` — `null` en rutas prerenderizadas (SSG) o durante el build,
   * caso en el que se asume `false` (comportamiento actual sin cambios,
   * el más seguro por defecto) y el navegador lo corrige en el primer
   * bootstrap del lado cliente.
   */
  readonly embebido: boolean = this.calcular();

  private calcular(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return esEmbebido(window.location.hostname);
    }
    const host = this.request?.headers.get('host') ?? '';
    return esEmbebido(host.split(':')[0]);
  }
}
