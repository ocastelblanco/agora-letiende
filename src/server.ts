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
 * Redirección 301 desde el dominio antiguo, SOLO para las dos rutas con
 * valor de SEO real (`/` y `/evento/:slug`) — decisión explícita del
 * humano: el resto de la app (login, panel, compra, puerta, admin) sigue
 * funcionando idéntica en agora.letiende.co, porque el staff entra
 * directo por ese dominio, nunca a través de letiende.co/cartelera.
 */
const HOST_ANTIGUO = 'agora.letiende.co';
const RUTA_DETALLE_EVENTO = /^\/evento\/[^/]+$/;

app.use((req, res, next) => {
  if (req.hostname !== HOST_ANTIGUO) {
    next();
    return;
  }
  const esRaiz = req.path === '/';
  const esDetalleEvento = RUTA_DETALLE_EVENTO.test(req.path);
  if (esRaiz || esDetalleEvento) {
    res.redirect(301, `https://letiende.co/cartelera${req.originalUrl}`);
    return;
  }
  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

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
