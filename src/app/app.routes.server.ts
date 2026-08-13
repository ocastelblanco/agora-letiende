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
  // criterio que las rutas protegidas de personal aunque el motivo sea otro
  // (acá no hay sesión de Firebase de por medio, TODO.md Tarea 2).
  {
    path: 'evento/:slug/comprar',
    renderMode: RenderMode.Client,
  },
  // Mismo motivo que /evento/:slug/comprar: formulario sin valor de SEO
  // (TODO.md Tarea 2).
  {
    path: 'comprobante/:token',
    renderMode: RenderMode.Client,
  },
  // Mismo motivo que /comprobante/:token (TODO.md Tarea 2, roadmap #11).
  {
    path: 'aprobaciones/:token',
    renderMode: RenderMode.Client,
  },
  // Mismo motivo que /comprobante/:token (TODO.md Tarea 2, roadmap #12).
  {
    path: 'boleta/:codigo',
    renderMode: RenderMode.Client,
  },
  // La sesión de Firebase vive solo en el navegador (IndexedDB del SDK
  // cliente, sin cookie de sesión) — cualquier ruta protegida por
  // GuardiaAuth/GuardiaRol debe ser RenderMode.Client, nunca Server ni
  // Prerender. Con Server/Prerender el guard se evaluaría sin acceso a esa
  // sesión y siempre redirigiría a /login, autenticado o no — gotcha
  // verificado en producción en Babel (mismo stack), ver MEMORY.md §7.
  {
    path: 'usuarios',
    renderMode: RenderMode.Client,
  },
  {
    path: 'mis-eventos/aprobaciones',
    renderMode: RenderMode.Client,
  },
  {
    path: 'mis-eventos/eventos',
    renderMode: RenderMode.Client,
  },
  {
    path: 'mis-eventos/eventos/:id',
    renderMode: RenderMode.Client,
  },
  // Las rutas padre de los hubs de dos niveles ('taquilla', 'mis-eventos')
  // también deben ser explícitas: su único hijo de path vacío hace
  // `redirectTo` a una hoja protegida por guardiaRol ('puerta'/'aprobaciones'
  // respectivamente), así que dependen de la sesión de Firebase igual que esa
  // hoja. Sin esta entrada caían en el wildcard '**' de abajo y Angular
  // congelaba en build time el resultado del guard fallido sin sesión real
  // (verificado inspeccionando dist/agora-letiende/prerendered-routes.json).
  {
    path: 'taquilla',
    renderMode: RenderMode.Client,
  },
  {
    path: 'mis-eventos',
    renderMode: RenderMode.Client,
  },
  {
    path: 'taquilla/puerta',
    renderMode: RenderMode.Client,
  },
  {
    path: 'evento/:slug/puerta',
    renderMode: RenderMode.Client,
  },
  // Mismo motivo que /taquilla/puerta y /evento/:slug/puerta (TODO.md
  // Tarea 2, Venta en efectivo): sesión de Firebase protegida por guardiaRol.
  {
    path: 'taquilla/efectivo',
    renderMode: RenderMode.Client,
  },
  {
    path: 'evento/:slug/efectivo',
    renderMode: RenderMode.Client,
  },
  // Mismo motivo que /taquilla/efectivo y /evento/:slug/efectivo (TODO.md
  // Tarea 2, Panel de control básico): sesión de Firebase protegida por
  // guardiaRol.
  {
    path: 'mis-eventos/panel',
    renderMode: RenderMode.Client,
  },
  {
    path: 'evento/:slug/panel',
    renderMode: RenderMode.Client,
  },
  // Redirects de las URLs viejas del menú de un nivel (`app.routes.ts`,
  // `redirectTo`) — declarados explícitamente en vez de dejarlos caer al
  // wildcard '**' de abajo: una ruta con parámetro (ej. la antigua
  // `admin/eventos/:id`) hace fallar el build de prerender
  // ("getPrerenderParams missing") si hereda RenderMode.Prerender sin
  // definir cómo enumerar sus valores — verificado con el build real, no
  // era solo una duda teórica. RenderMode.Client es correcto igual: un
  // `redirectTo` no renderiza contenido propio, así que solo importa que no
  // intente prerenderizarse.
  {
    path: 'admin/usuarios',
    renderMode: RenderMode.Client,
  },
  {
    path: 'puerta',
    renderMode: RenderMode.Client,
  },
  {
    path: 'efectivo',
    renderMode: RenderMode.Client,
  },
  {
    path: 'panel',
    renderMode: RenderMode.Client,
  },
  {
    path: 'admin/aprobaciones',
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
