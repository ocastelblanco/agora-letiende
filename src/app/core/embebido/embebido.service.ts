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

/**
 * Copia del criterio de `carta-visibilidad.ts` de letiende.co (ADR-024): la
 * carta (`/carta`) responde 404 en producción mientras no esté publicada.
 * Publicada el 19/10/2026 (T-0040 de letiende.co): `CARTA_PUBLICADA` es `true`
 * aquí, en letiende.co y en Babel; los tres cambian a la vez.
 */
export const CARTA_PUBLICADA = true;

const HOSTS_CARTA_VISIBLE = ['staging.letiende.co', 'localhost', '127.0.0.1'];

export function cartaVisibleEnHost(hostname: string, publicada = CARTA_PUBLICADA): boolean {
  return publicada || HOSTS_CARTA_VISIBLE.includes(hostname);
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
  private readonly hostname: string = this.obtenerHostname();

  readonly embebido: boolean = esEmbebido(this.hostname);

  /** Si el enlace "Carta" del menú embebido debe mostrarse (mismo criterio que letiende.co). */
  readonly cartaVisible: boolean = cartaVisibleEnHost(this.hostname);

  private obtenerHostname(): string {
    if (isPlatformBrowser(this.platformId)) {
      return window.location.hostname;
    }
    const host = this.request?.headers.get('x-le-tiende-host') ?? '';
    return host.split(':')[0];
  }
}
