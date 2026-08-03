import { HttpInterceptorFn } from '@angular/common/http';
import { REQUEST, inject } from '@angular/core';

/**
 * En el navegador, una URL relativa (`/api/...`) la resuelve el propio
 * navegador contra el origen actual. En SSR (Lambda `ssr`), el `fetch` de
 * Node no tiene noción de "origen actual" y una URL relativa rompe la
 * petición — gotcha ya verificado en producción en Babel (mismo stack
 * Angular SSR + Lambda). Se usa el token `REQUEST` (la petición HTTP
 * entrante que Angular expone durante SSR) para anteponer ese mismo
 * origen, ya que `ssr` y `usuariosMe`/`api` comparten dominio.
 */
export const absoluteUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const peticionEntrante = inject(REQUEST, { optional: true });
  if (!peticionEntrante || !req.url.startsWith('/')) {
    return next(req);
  }

  const origen = new URL(peticionEntrante.url).origin;
  return next(req.clone({ url: `${origen}${req.url}` }));
};
