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
   * (autoritativo); en SSR usa el header `x-le-tiende-host`.
   *
   * Hallazgo real, no el diseño original: el header `Host` real del
   * visitante NUNCA llega aquí. La política de origen
   * `AllViewerExceptHostHeader` que exige API Gateway (si no, 403 —
   * tech-specs.md §7.2 del contenedor) reenvía todos los encabezados del
   * visitante EXCEPTO `Host` — este SSR siempre vería el hostname crudo de
   * `execute-api`, nunca `letiende.co`/`staging.letiende.co`. La
   * distribución de CloudFront del contenedor copia el `Host` real a
   * `x-le-tiende-host` con una CloudFront Function antes de reenviar
   * (`FuncionInyectarHostVisitante`, repo `letiende.co`) — ese es el
   * encabezado que hay que leer. `null`/vacío en rutas prerenderizadas
   * (SSG), durante el build, o si se accede fuera del proxy (directo por
   * `agora.letiende.co`, sin esa CloudFront Function delante) — en ese
   * caso se asume `false` (comportamiento actual sin cambios, el más
   * seguro por defecto) y el navegador lo corrige en el primer bootstrap
   * del lado cliente.
   */
  readonly embebido: boolean = this.calcular();

  private calcular(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return esEmbebido(window.location.hostname);
    }
    const host = this.request?.headers.get('x-le-tiende-host') ?? '';
    return esEmbebido(host.split(':')[0]);
  }
}
