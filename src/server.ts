import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Redirección 301 desde el dominio antiguo (`agora.letiende.co`).
 *
 * El build de esta app usa `baseHref: /cartelera/` (para que el proxy de
 * letiende.co funcione), lo que significa que el Router de Angular del
 * lado cliente espera que la URL real del navegador ya empiece con
 * `/cartelera`. Toda ruta que llegue por este dominio sin ese prefijo
 * recibe un 301 MISMO DOMINIO a `agora.letiende.co/cartelera/...` — el
 * staff sigue entrando por el dominio de siempre, solo se le antepone el
 * prefijo obligatorio para que el Router/baseHref de Angular resuelva bien.
 *
 * **Incidente real de producción (03/09/2026), reportado en vivo por el
 * humano:** la primera versión de este archivo (T-0013) redirigía `/` y
 * `/evento/:slug` en una rama aparte, CROSS-DOMAIN a
 * `letiende.co/cartelera/...`, para consolidar el SEO en un solo dominio
 * — decisión explícita, correcta como diseño final. Pero el cutover real
 * de producción de `letiende.co` (T-14/T-15, todavía pendiente,
 * `docs/MEMORY.md` §5 de ese repositorio) no había ocurrido: el dominio
 * `letiende.co` en producción sigue sirviendo el sitio estático VIEJO
 * (`E33QAN86FY24JZ`), que no tiene ninguna ruta `/cartelera`. El
 * resultado: `agora.letiende.co` — el único acceso público real hoy,
 * porque el contenedor nuevo aún no está en el dominio raíz — quedaba
 * roto, cayendo en el fallback del sitio viejo (`/eventos`). Mientras el
 * cutover no ocurra, **todas** las rutas de este dominio redirigen mismo
 * dominio con el prefijo, sin excepción — la rama cross-domain para `/` y
 * `/evento/:slug` se restaura cuando T-14/T-15 esté hecho, no antes.
 *
 * La condición `!req.path.startsWith('/cartelera')` es lo que evita el
 * bucle: la segunda petición (ya con el prefijo) cae al `next()` final.
 */
const HOST_ANTIGUO = 'agora.letiende.co';
const PREFIJO_CARTELERA = '/cartelera';

app.use((req, res, next) => {
  if (req.hostname !== HOST_ANTIGUO || req.path.startsWith(PREFIJO_CARTELERA)) {
    next();
    return;
  }
  res.redirect(301, `https://agora.letiende.co${PREFIJO_CARTELERA}${req.originalUrl}`);
});

/**
 * Serve static files from /browser.
 *
 * El build genera los archivos en una carpeta plana (sin subcarpeta
 * `cartelera/`), pero con `baseHref: /cartelera/` el HTML servido le pide
 * al navegador los assets bajo ese prefijo. Por eso se monta el estático
 * dos veces: bajo `/cartelera` (lo que el navegador realmente pide) y en
 * la raíz (compatibilidad, por si algo pide la ruta sin prefijo).
 */
const opcionesEstatico = {
  maxAge: '1y',
  index: false,
  redirect: false,
};
app.use(PREFIJO_CARTELERA, express.static(browserDistFolder, opcionesEstatico));
app.use(express.static(browserDistFolder, opcionesEstatico));

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

/**
 * Instancia de Express expuesta para que el wrapper de AWS Lambda
 * (`server/ssr/handler.mjs`, vía `@codegenie/serverless-express`) pueda
 * envolverla sin duplicar el bootstrap del motor SSR de Angular.
 */
export { app };
