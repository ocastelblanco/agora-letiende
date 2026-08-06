import { Routes } from '@angular/router';
import { guardiaRol } from './core/guardias/guardia-rol';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    title: 'Ingresar — Ágora',
  },
  {
    path: 'admin/usuarios',
    loadComponent: () =>
      import('./features/admin/gestion-usuarios/gestion-usuarios.component').then(
        (m) => m.GestionUsuariosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: 'administrador' },
    title: 'Usuarios — Ágora',
  },
  {
    path: 'admin/eventos',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/gestion-eventos.component').then(
        (m) => m.GestionEventosComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: 'administrador' },
    title: 'Eventos — Ágora',
  },
  {
    path: 'admin/eventos/:id',
    loadComponent: () =>
      import('./features/admin/gestion-eventos/editar-evento.component').then(
        (m) => m.EditarEventoComponent,
      ),
    canActivate: [guardiaRol],
    data: { rolMinimo: 'administrador' },
    title: 'Editar evento — Ágora',
  },
];
