import { Routes } from '@angular/router';
import { guardiaInvitado } from './core/guardias/guardia-invitado';
import { guardiaRol } from './core/guardias/guardia-rol';
import { SECCIONES_NAVEGACION } from './shared/navegacion/secciones-navegacion';

/**
 * `rolMinimo` de las rutas `admin/*` se deriva de `SECCIONES_NAVEGACION`
 * (única fuente de verdad, `TODO.md` Tarea 1) en vez de declararse dos
 * veces. Lanza en tiempo de carga del módulo si la sección esperada no
 * existe — un error de configuración así debe fallar ruidosamente, no
 * silenciarse detrás de un `undefined`.
 */
function rolMinimoDe(ruta: string): string {
  const seccion = SECCIONES_NAVEGACION.find((s) => s.ruta === ruta);
  if (!seccion) {
    throw new Error(`No hay una sección de navegación para la ruta "${ruta}".`);
  }
  return seccion.rolMinimo;
}

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
    // valor de SEO, mismo criterio que /admin/* (TODO.md Tarea 2).
    title: 'Comprar boletas — Ágora',
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
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guardiaInvitado],
    title: 'Ingresar — Ágora',
  },
  {
    path: 'admin/usuarios',
    loadComponent: () =>
      import('./features/admin/gestion-usuarios/gestion-usuarios.component').then(
        (m) => m.GestionUsuariosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDe('/admin/usuarios') },
    title: 'Usuarios — Ágora',
  },
  {
    path: 'admin/aprobaciones',
    loadComponent: () =>
      import('./features/aprobaciones/lista-aprobaciones.component').then(
        (m) => m.ListaAprobacionesComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDe('/admin/aprobaciones') },
    title: 'Aprobaciones — Ágora',
  },
  {
    path: 'admin/eventos',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/gestion-eventos.component').then(
        (m) => m.GestionEventosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDe('/admin/eventos') },
    title: 'Eventos — Ágora',
  },
  {
    path: 'admin/eventos/:id',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/editar-evento.component').then(
        (m) => m.EditarEventoComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: rolMinimoDe('/admin/eventos') },
    title: 'Editar evento — Ágora',
  },
];
