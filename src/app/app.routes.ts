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
];
