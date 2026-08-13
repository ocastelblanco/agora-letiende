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
  {
    path: 'taquilla/puerta',
    loadComponent: () =>
      import('./features/puerta/seleccion-puerta.component').then(
        (m) => m.SeleccionPuertaComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/taquilla/puerta') },
    title: 'Puerta — Ágora',
  },
  {
    path: 'taquilla/efectivo',
    loadComponent: () =>
      import('./features/evento/venta-efectivo/seleccion-venta-efectivo.component').then(
        (m) => m.SeleccionVentaEfectivoComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/taquilla/efectivo') },
    title: 'Venta en efectivo — Ágora',
  },
  {
    path: 'mis-eventos/panel',
    loadComponent: () =>
      import('./features/panel/seleccion-panel.component').then((m) => m.SeleccionPanelComponent),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/panel') },
    title: 'Panel — Ágora',
  },
  {
    path: 'mis-eventos/aprobaciones',
    loadComponent: () =>
      import('./features/aprobaciones/lista-aprobaciones.component').then(
        (m) => m.ListaAprobacionesComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/aprobaciones') },
    title: 'Aprobaciones — Ágora',
  },
  {
    path: 'mis-eventos/eventos',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/gestion-eventos.component').then(
        (m) => m.GestionEventosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') },
    title: 'Eventos — Ágora',
  },
  {
    path: 'mis-eventos/eventos/:id',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/editar-evento.component').then(
        (m) => m.EditarEventoComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') },
    title: 'Editar evento — Ágora',
  },
  // Redirects de las URLs viejas hacia las nuevas (menú de dos niveles) —
  // los `path` de abajo quedaron libres al renombrar las rutas reales de
  // arriba, así que no colisionan.
  { path: 'admin/usuarios', redirectTo: 'usuarios' },
  { path: 'puerta', redirectTo: 'taquilla/puerta' },
  { path: 'efectivo', redirectTo: 'taquilla/efectivo' },
  { path: 'panel', redirectTo: 'mis-eventos/panel' },
  { path: 'admin/aprobaciones', redirectTo: 'mis-eventos/aprobaciones' },
  // El matching es por prefijo (sin `pathMatch: 'full'`), así que esta
  // entrada ya captura también `/admin/eventos/:id` completo — Angular
  // concatena el segmento sobrante (`/:id`) al destino del redirect. No se
  // necesita una entrada separada para `admin/eventos/:id`.
  { path: 'admin/eventos', redirectTo: 'mis-eventos/eventos' },
];
