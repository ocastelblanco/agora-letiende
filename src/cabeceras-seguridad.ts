/**
 * Cabeceras de seguridad de las páginas que sirve el SSR (`server.ts`).
 * Funciones puras, sin dependencias de Node, para poder probarlas con el
 * runner de Angular.
 *
 * El nonce: `index.html` lleva `ngCspNonce` con este marcador fijo, y Angular
 * lo copia a cada `<script>` y `<style>` que genera en el SSR (incluido el
 * `ng-event-dispatch-contract` del event replay). `server.ts` reemplaza el
 * marcador por un nonce aleatorio en cada respuesta HTML.
 */
export const MARCADOR_NONCE = 'AGORA_CSP_NONCE';

/**
 * `'strict-dynamic'`: los scripts que cargan nuestros scripts con nonce
 * (checkout de Bold, Google Sign-In de Firebase, chunks diferidos) heredan
 * el permiso sin listar sus hosts. `https:` y `'unsafe-inline'` solo aplican
 * a navegadores sin soporte de nonce; los demás los ignoran.
 *
 * `style-src` no lleva nonce a propósito: con un nonce, el navegador ignora
 * `'unsafe-inline'`, y lo necesitan los atributos `style` del SSR y las
 * hojas que inyecta el checkout de Bold.
 */
export function politicaCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.amazonaws.com https://lh3.googleusercontent.com",
    "connect-src 'self' https://*.googleapis.com https://*.amazonaws.com https://*.bold.co",
    'frame-src https://*.bold.co https://comandante-letiende.firebaseapp.com https://accounts.google.com',
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.bold.co",
    "frame-ancestors 'self'",
  ].join('; ');
}

/**
 * Las rutas cuyo path lleva un token o el código de una boleta no envían
 * `Referer` a nadie (`CLAUDE.md` §5, A07). El resto, solo el origen fuera
 * del sitio. Recibe el path tal como llega a Express, con o sin
 * `/cartelera`.
 */
const RUTA_CON_TOKEN = /^(\/cartelera)?\/(comprobante|aprobaciones|boleta)\/[^/]+/;

export function politicaReferer(ruta: string): string {
  return RUTA_CON_TOKEN.test(ruta) ? 'no-referrer' : 'strict-origin-when-cross-origin';
}

/**
 * Detrás de `letiende.co/cartelera/*`, CloudFront reemplaza la cabecera
 * `Referrer-Policy` por la suya, así que en las rutas con token también va
 * un `<meta name="referrer">` al inicio del `<head>`: el navegador lo aplica
 * por encima de la cabecera.
 */
export function conMetaReferer(html: string, ruta: string): string {
  if (politicaReferer(ruta) !== 'no-referrer') {
    return html;
  }
  return html.replace(/<head(\s[^>]*)?>/i, (etiqueta) => `${etiqueta}<meta name="referrer" content="no-referrer">`);
}
