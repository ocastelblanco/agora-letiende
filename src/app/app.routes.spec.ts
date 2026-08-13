import type { Route } from '@angular/router';
import type { Rol } from './core/models/usuario.model';
import { routes } from './app.routes';

/**
 * Tabla literal esperada de `rolMinimo` por ruta de personal — a propósito
 * NO se deriva de `rolMinimoDeRuta`/`GRUPOS_NAVEGACION`
 * (`secciones-navegacion.ts`), la misma fuente que `app.routes.ts` usa para
 * poblar `data.rolMinimo` en la mayoría de estas rutas. Si esta tabla se
 * derivara de esa fuente, la prueba compararía el código consigo mismo y no
 * protegería contra nada: un typo real entre dos rutas VÁLIDAS (ej. usar por
 * accidente `rolMinimoDeRuta('/mis-eventos/panel')` en la ruta `eventos`)
 * compilaría y las pruebas seguirían en verde, relajando silenciosamente la
 * autorización de "Eventos" de `administrador` a `productor` sin que nada lo
 * detecte.
 */
const ROL_MINIMO_ESPERADO: Record<string, Rol> = {
  'taquilla/efectivo': 'portero',
  'taquilla/puerta': 'portero',
  'mis-eventos/panel': 'productor',
  'mis-eventos/eventos': 'administrador',
  'mis-eventos/eventos/:id': 'administrador',
  'mis-eventos/aprobaciones': 'productor',
  usuarios: 'administrador',
};

/** Aplana `routes` (incluidas las rutas hijas de los hubs `taquilla`/`mis-eventos`) a pares `[pathCompleto, ruta]`. */
function aplanarRutas(rutas: Route[], prefijo = ''): [string, Route][] {
  return rutas.flatMap((ruta) => {
    if (ruta.path === undefined) {
      return [];
    }
    const pathCompleto = prefijo ? `${prefijo}/${ruta.path}` : ruta.path;
    const propia: [string, Route] = [pathCompleto, ruta];
    const hijas = ruta.children ? aplanarRutas(ruta.children, pathCompleto) : [];
    return [propia, ...hijas];
  });
}

describe('routes — rolMinimo de las rutas de personal', () => {
  const rutasAplanadas = new Map(aplanarRutas(routes));

  for (const [pathCompleto, rolEsperado] of Object.entries(ROL_MINIMO_ESPERADO)) {
    it(`"${pathCompleto}" exige rolMinimo "${rolEsperado}"`, () => {
      const ruta = rutasAplanadas.get(pathCompleto);
      expect(ruta).toBeTruthy();

      const data = ruta?.data as { rolMinimo?: Rol } | undefined;
      expect(data?.rolMinimo).toBe(rolEsperado);
    });
  }
});
