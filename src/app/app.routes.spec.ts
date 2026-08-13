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
  // 'Eventos' pasó de exigir 'administrador' a 'productor' — cambio de
  // alcance deliberado de TODO.md Tarea 1 (T6): un productor asignado a un
  // evento ahora ve la lista y edita campos puntuales de ese evento.
  // 'eventos/nuevo' (crear) sigue siendo exclusivo de administrador —
  // hardcodeado en app.routes.ts, no derivado de GRUPOS_NAVEGACION (no hay
  // un tab separado de "crear evento").
  'mis-eventos/eventos': 'productor',
  'mis-eventos/eventos/nuevo': 'administrador',
  'mis-eventos/eventos/:id': 'productor',
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

describe('routes — orden de "eventos/nuevo" antes de "eventos/:id"', () => {
  // El Router de Angular hace matching de `children` por ORDEN DE ARREGLO,
  // no por especificidad de path. Si alguien invirtiera estas dos entradas
  // en app.routes.ts, la ruta paramétrica 'eventos/:id' capturaría 'nuevo'
  // como valor de `:id` — un productor asignado a un evento terminaría en
  // el componente en "modo crear" con el guard de 'eventos/:id'
  // (rolMinimo: 'productor') en vez del guard exclusivo de administrador de
  // 'eventos/nuevo'. Esta prueba mira el arreglo real, no un Map indexado
  // por path (que no distingue orden), para que sí atrape esa inversión.
  it('el índice de "eventos/nuevo" es menor que el de "eventos/:id" dentro de los children de "mis-eventos"', () => {
    const hubMisEventos = routes.find((ruta) => ruta.path === 'mis-eventos');
    expect(hubMisEventos?.children).toBeTruthy();

    const hijos = hubMisEventos!.children!;
    const indiceNuevo = hijos.findIndex((ruta) => ruta.path === 'eventos/nuevo');
    const indiceId = hijos.findIndex((ruta) => ruta.path === 'eventos/:id');

    expect(indiceNuevo).toBeGreaterThanOrEqual(0);
    expect(indiceId).toBeGreaterThanOrEqual(0);
    expect(indiceNuevo).toBeLessThan(indiceId);
  });
});
