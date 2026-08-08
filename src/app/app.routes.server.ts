import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Cartelera pública y detalle de evento: RenderMode.Server, no Client ni
  // Prerender — el contenido cambia con cada evento nuevo/editado, y los
  // rastreadores de Open Graph (WhatsApp/Instagram) necesitan HTML ya
  // resuelto en la primera respuesta (tech-specs.md §4.5, TODO.md Tarea 1).
  // Deben quedar declaradas explícitamente ANTES del wildcard '**' de abajo
  // para no heredar por accidente su RenderMode.Prerender.
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'evento/:slug',
    renderMode: RenderMode.Server,
  },
  // El formulario de compra no tiene valor de SEO (no es lo que un
  // rastreador de Open Graph debe indexar) y su contenido depende del
  // aforo en el instante exacto de la visita — RenderMode.Client, mismo
  // criterio que /admin/* aunque el motivo sea otro (acá no hay sesión de
  // Firebase de por medio, TODO.md Tarea 2).
  {
    path: 'evento/:slug/comprar',
    renderMode: RenderMode.Client,
  },
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
    path: 'admin/eventos',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/eventos/:id',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
