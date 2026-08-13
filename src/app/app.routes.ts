import { Routes } from '@angular/router';
import { guardiaInvitado } from './core/guardias/guardia-invitado';
import { guardiaRol } from './core/guardias/guardia-rol';
import { rolMinimoDeRuta } from './shared/navegacion/secciones-navegacion';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/cartelera/cartelera.component').then((m) => m.CarteleraComponent),
    title: 'Cartelera — Ágora',
  },
  {
    path: 'evento/:slug',
    loadComponent: () =>
      import('./features/evento/detalle-evento.component').then((m) => m.DetalleEventoComponent),
    // Sin `title` fijo aquí: DetalleEventoComponent lo establece dinámicamente
    // con `Title.setTitle()` en cuanto carga el evento (ver su docstring).
  },
  {
    path: 'evento/:slug/comprar',
    loadComponent: () =>
      import('./features/evento/comprar/comprar.component').then((m) => m.ComprarComponent),
    // RenderMode.Client (app.routes.server.ts): formulario interactivo sin
    // valor de SEO, mismo criterio que las rutas protegidas de personal
    // (TODO.md Tarea 2).
    title: 'Comprar boletas — Ágora',
  },
  {
    path: 'evento/:slug/puerta',
    loadComponent: () =>
      import('./features/puerta/puerta.component').then((m) => m.PuertaComponent),
    canActivate: [guardiaRol],
    // No usa rolMinimoDeRuta: es una ruta dinámica por evento, no un tab
    // fijo de GRUPOS_NAVEGACION (ese es /taquilla/puerta, el selector).
    data: { rolMinimo: 'portero' },
    title: 'Puerta — Ágora',
  },
  {
    path: 'evento/:slug/efectivo',
    loadComponent: () =>
      import('./features/evento/venta-efectivo/venta-efectivo.component').then(
        (m) => m.VentaEfectivoComponent,
      ),
    canActivate: [guardiaRol],
    // Mismo criterio que /evento/:slug/puerta: ruta dinámica por evento, no
    // un tab fijo de GRUPOS_NAVEGACION (ese es /taquilla/efectivo, el
    // selector, TODO.md Tarea 2).
    data: { rolMinimo: 'portero' },
    title: 'Venta en efectivo — Ágora',
  },
  {
    path: 'evento/:slug/panel',
    loadComponent: () =>
      import('./features/panel/panel-evento.component').then((m) => m.PanelEventoComponent),
    canActivate: [guardiaRol],
    // Mismo criterio que /evento/:slug/puerta y /evento/:slug/efectivo:
    // ruta dinámica por evento, no un tab fijo de GRUPOS_NAVEGACION
    // (ese es /mis-eventos/panel, el selector, TODO.md Tarea 2).
    data: { rolMinimo: 'productor' },
    title: 'Panel — Ágora',
  },
  {
    path: 'comprobante/:token',
    loadComponent: () =>
      import('./features/evento/comprobante/comprobante.component').then(
        (m) => m.ComprobanteComponent,
      ),
    // RenderMode.Client, mismo criterio que /evento/:slug/comprar.
    title: 'Cargar comprobante — Ágora',
  },
  {
    path: 'aprobaciones/:token',
    loadComponent: () =>
      import('./features/aprobaciones/revisar-aprobacion.component').then(
        (m) => m.RevisarAprobacionComponent,
      ),
    // RenderMode.Client, mismo criterio que /comprobante/:token.
    title: 'Revisar compra — Ágora',
  },
  {
    path: 'boleta/:codigo',
    loadComponent: () =>
      import('./features/boleta/boleta-digital.component').then((m) => m.BoletaDigitalComponent),
    // RenderMode.Client, mismo criterio que /comprobante/:token.
    title: 'Tu boleta — Ágora',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guardiaInvitado],
    title: 'Ingresar — Ágora',
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/admin/gestion-usuarios/gestion-usuarios.component').then(
        (m) => m.GestionUsuariosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/usuarios') },
    title: 'Usuarios — Ágora',
  },
  // Hub de "Taquilla" (cuerpo con Angular Material Tabs ligadas al router,
  // `TaquillaComponent`) — reemplaza al header como lugar del nivel 2
  // (rediseño a pedido del usuario). Las rutas hijas y sus guards son
  // idénticos a los que existían como rutas planas, solo reubicados; el
  // redirect del hijo vacío usa el último tab de 'Taquilla'
  // (`secciones-navegacion.ts`), mismo criterio que `ultimoTab`.
  {
    path: 'taquilla',
    loadComponent: () =>
      import('./features/taquilla/taquilla.component').then((m) => m.TaquillaComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'puerta' },
      {
        path: 'efectivo',
        loadComponent: () =>
          import('./features/evento/venta-efectivo/seleccion-venta-efectivo.component').then(
            (m) => m.SeleccionVentaEfectivoComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: rolMinimoDeRuta('/taquilla/efectivo') },
        title: 'Venta en efectivo — Ágora',
      },
      {
        path: 'puerta',
        loadComponent: () =>
          import('./features/puerta/seleccion-puerta.component').then(
            (m) => m.SeleccionPuertaComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: rolMinimoDeRuta('/taquilla/puerta') },
        title: 'Puerta — Ágora',
      },
    ],
  },
  // Hub de "Mis Eventos" (`MisEventosComponent`) — mismo criterio que el hub
  // de "Taquilla" de arriba. El redirect del hijo vacío usa el último tab de
  // 'Mis Eventos' ('Aprobaciones', ver `secciones-navegacion.ts`).
  {
    path: 'mis-eventos',
    loadComponent: () =>
      import('./features/mis-eventos/mis-eventos.component').then((m) => m.MisEventosComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'aprobaciones' },
      {
        path: 'panel',
        loadComponent: () =>
          import('./features/panel/seleccion-panel.component').then(
            (m) => m.SeleccionPanelComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/panel') },
        title: 'Panel — Ágora',
      },
      {
        path: 'eventos',
        loadComponent: () =>
          import('./features/admin/gestion-eventos/gestion-eventos.component').then(
            (m) => m.GestionEventosComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') },
        title: 'Eventos — Ágora',
      },
      // 'eventos/nuevo' (literal) va SIEMPRE antes de 'eventos/:id'
      // (paramétrica) — Angular hace matching de `children` en orden de
      // arreglo, así que si quedara después la ruta paramétrica capturaría
      // 'nuevo' como valor de `:id` (mismo criterio que las 6 entradas de
      // compatibilidad al final de este archivo). `rolMinimo: 'administrador'`
      // queda hardcodeado a propósito (TODO.md Tarea 1, T6): crear un evento
      // es exclusivo de administrador, pero no hay un tab de navegación
      // separado del que derivarlo con `rolMinimoDeRuta` — la única entrada de
      // `GRUPOS_NAVEGACION` para esta sección es '/mis-eventos/eventos' (la
      // lista), no 'crear'.
      // `data.id: 'nuevo'` es necesario porque esta ruta, a diferencia de
      // 'eventos/:id', no tiene ningún parámetro `:id` real en su path: el
      // input `id` de `EditarEventoComponent` (Signal input poblado por
      // `withComponentInputBinding()`, ver app.config.ts) necesita el valor
      // `'nuevo'` desde algún lado. Antes de T6 existía una única ruta
      // `eventos/:id` que también capturaba el literal `'nuevo'` como
      // parámetro real, así que `id()` lo recibía naturalmente; al separar
      // las dos rutas, sin esta clave `RoutedComponentInputBinder` llama
      // `setInput('id', undefined)` en cada navegación aquí (mezcla
      // `data` + `params`, y esta ruta no tiene ninguno de los dos para
      // `id`), lo que hacía que el componente entrara en modo EDICIÓN con
      // `eventoId: undefined` y mostrara "No se encontró ese evento." — bug
      // real reportado en vivo al hacer clic en "Crear evento".
      {
        path: 'eventos/nuevo',
        loadComponent: () =>
          import('./features/admin/gestion-eventos/editar-evento.component').then(
            (m) => m.EditarEventoComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: 'administrador', id: 'nuevo' },
        title: 'Crear evento — Ágora',
      },
      {
        path: 'eventos/:id',
        loadComponent: () =>
          import('./features/admin/gestion-eventos/editar-evento.component').then(
            (m) => m.EditarEventoComponent,
          ),
        canActivate: [guardiaRol],
        // Un productor asignado al evento también puede editarlo (TODO.md
        // Tarea 1, T6) — hereda 'productor' en cuanto se cambie el
        // `rolMinimo` del tab 'Eventos' en secciones-navegacion.ts.
        data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') },
        title: 'Editar evento — Ágora',
      },
      {
        path: 'aprobaciones',
        loadComponent: () =>
          import('./features/aprobaciones/lista-aprobaciones.component').then(
            (m) => m.ListaAprobacionesComponent,
          ),
        canActivate: [guardiaRol],
        data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/aprobaciones') },
        title: 'Aprobaciones — Ágora',
      },
    ],
  },
  // Redirects de las URLs viejas hacia las nuevas (menú de dos niveles) —
  // los `path` de abajo quedaron libres al renombrar las rutas reales de
  // arriba, así que no colisionan. `redirectTo` es ABSOLUTO (con `/`
  // inicial) en los 6 casos: `@angular/ssr` resuelve `redirectTo` relativo
  // distinto que el Router del navegador (`resolveRedirectTo` en
  // `node_modules/@angular/ssr/fesm2022/ssr.mjs` concatena el prefijo del
  // propio `path` en vez de reiniciar el matching desde la raíz), lo que
  // producía bucles infinitos (`admin/usuarios` → `admin/usuarios`) y 404
  // (`admin/aprobaciones` → `admin/mis-eventos/aprobaciones`) verificados con
  // curl contra el servidor SSR compilado — no un problema teórico.
  { path: 'admin/usuarios', redirectTo: '/usuarios' },
  { path: 'puerta', redirectTo: '/taquilla/puerta' },
  { path: 'efectivo', redirectTo: '/taquilla/efectivo' },
  { path: 'panel', redirectTo: '/mis-eventos/panel' },
  { path: 'admin/aprobaciones', redirectTo: '/mis-eventos/aprobaciones' },
  // `pathMatch: 'full'` es obligatorio aquí (a diferencia de las otras 5
  // entradas de esta lista, que no tienen un hermano más específico debajo):
  // sin él, el Router del navegador hace matching de `path` por PREFIJO por
  // defecto, así que esta entrada de 2 segmentos coincidía con CUALQUIER URL
  // que empezara por `admin/eventos/…` — incluyendo `/admin/eventos/xyz999`
  // de 3 segmentos — y redirigía a la lista perdiendo el id, sin que el
  // Router llegara siquiera a intentar la entrada `admin/eventos/:id` de
  // abajo (verificado en `ng serve`: con `pathMatch` por defecto,
  // `router.navigateByUrl('/admin/eventos/xyz999')` terminaba en
  // `/mis-eventos/eventos`, la lista; agregando `pathMatch: 'full'` en
  // memoria sobre `router.config` y repitiendo la navegación, terminó
  // correctamente en `/mis-eventos/eventos/xyz999` con `params: { id:
  // 'xyz999' }`). Este bug es independiente del mecanismo de sustitución de
  // `redirectTo` documentado abajo: sin este `pathMatch`, ninguna solución de
  // la entrada `admin/eventos/:id` — string o función — llega a ejecutarse
  // nunca para una URL de 3 segmentos.
  { path: 'admin/eventos', pathMatch: 'full', redirectTo: '/mis-eventos/eventos' },
  // Entrada separada y explícita para `/admin/eventos/:id`: a diferencia del
  // Router del navegador, `@angular/ssr` NO hace matching por prefijo aquí
  // (verificado con curl: sin esta entrada, `/admin/eventos/abc123` daba 404
  // directo, no heredaba el redirect de `admin/eventos` de arriba).
  //
  // El destino es una FUNCIÓN (`RedirectFunction`), no un string, porque no
  // existe un string único que funcione en los dos motores de redirect que
  // Angular usa para esta app:
  //   - `redirectTo: '/mis-eventos/eventos/:id'` (con dos puntos) funciona en
  //     el Router del navegador (sustituye bien vía `posParams`), pero el
  //     "camino rápido" de redirect estático de `@angular/ssr`
  //     (`buildPathWithParams` en `node_modules/@angular/ssr/fesm2022/ssr.mjs`)
  //     solo sustituye segmentos `*` literales — nunca interpreta `:id` — así
  //     que en SSR el redirect quedaba apuntando literalmente a
  //     `/mis-eventos/eventos/:id` sin sustituir (verificado con curl).
  //   - `redirectTo: '/mis-eventos/eventos/*'` (con asterisco) sí funciona en
  //     el fast-path de SSR, pero el Router del navegador
  //     (`createSegments`/`findOrReturn` en
  //     `node_modules/@angular/router/fesm2022/_router-chunk.mjs`) NO le da
  //     ningún significado especial a `*` — solo sabe sustituir segmentos que
  //     empiezan con `:` — así que en navegación client-side (por ejemplo,
  //     "atrás"/"adelante" del navegador con la SPA ya hidratada) el usuario
  //     terminaba silenciosamente en `/mis-eventos/eventos` (la lista),
  //     perdiendo el id, sin error visible (verificado en `ng serve` con
  //     `router.navigateByUrl('/admin/eventos/xyz999')` e inspeccionando
  //     `router.routerState.snapshot`).
  // Una función se evalúa con los params ya resueltos en ambos motores, así
  // que es correcta en los dos casos sin ambigüedad — a costa de que el
  // fast-path de SSR ya no puede emitir el 302 estático más rápido para esta
  // ruta puntual: cae a un render `RenderMode.Client` normal que redirige del
  // lado del cliente (un hop más lento, pero correcto; probado: 200 sin
  // `Location` en vez de 302 directo). Es una URL vieja y de compatibilidad
  // (bookmark/enlace externo, no hay ningún `routerLink` interno que apunte
  // aquí), así que ese costo es aceptable.
  {
    path: 'admin/eventos/:id',
    redirectTo: (redirectData) => `/mis-eventos/eventos/${redirectData.params['id']}`,
  },
];
