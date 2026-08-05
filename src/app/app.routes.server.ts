import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // La sesión de Firebase vive solo en el navegador (IndexedDB del SDK
  // cliente, sin cookie de sesión) — cualquier ruta protegida por
  // GuardiaAuth/GuardiaRol debe ser RenderMode.Client, nunca Server ni
  // Prerender. Con Server/Prerender el guard se evaluaría sin acceso a esa
  // sesión y siempre redirigiría a /login, autenticado o no — gotcha
  // verificado en producción en Babel (mismo stack), ver MEMORY.md §7.
  {
    path: 'admin/usuarios',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
