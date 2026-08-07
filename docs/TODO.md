# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (06/08/2026, actualizada la misma noche):** la Tarea 1 (CRUD de eventos) se completó — ver `MEMORY.md` §2, §4, §7 y §9. Con eso cerrado, los ítems #7 (Cartelera pública) y #8 (Motor de aforo) del roadmap técnico (`tech-specs.md` §11) dejaron de depender de nada más y son independientes entre sí, así que ocuparon los dos slots activos. **Esa misma noche**, el usuario reportó que navegar la app es complicado (no existe ningún menú) y pidió priorizarlo — se agregó como ítem #18 del roadmap técnico (`tech-specs.md` §11, depende solo de #4 Autenticación y roles, ya completo) y **reemplaza a Motor de aforo como Tarea 2 activa**: alcance pequeño (100% frontend, sin tocar backend/infraestructura), bloqueador de usabilidad inmediato, y Motor de aforo no bloquea nada mientras no exista el flujo de compra real (roadmap #9). Motor de aforo vuelve al tope del backlog, con su diseño ya completo y sin cambios en `tech-specs.md` §5.4 — se retoma como próxima tarea en cuanto se libere un slot.

---

## Tarea 1 — [FEATURE]: Cartelera pública y página de evento

**Origen:** `PRD.md` §6 (v1), §8 (Open Graph) · `tech-specs.md` §11 ítem 7, §4.1, §4.2, §4.5, §5.1 · `CLAUDE.md` §5 (A03, A05)

**Archivos a crear:**
- `server/api/handlers/eventos-publicos.ts` (+ `.spec.ts`) — `GET /api/eventos-publicos`, `GET /api/eventos-publicos/:slug`
- `src/app/core/api/eventos-publicos.service.ts` (+ `.spec.ts`)
- `src/app/features/cartelera/cartelera.component.ts` — ruta `/`
- `src/app/features/evento/detalle-evento.component.ts` — ruta `/evento/:slug`
- `public/robots.txt`
- Ruta/handler de `sitemap.xml` dinámico (evaluar si vive en `eventos-publicos.ts` o en su propio handler — decidir al implementar)

**Qué hacer:**

1. `eventos-publicos.ts`: sin autenticación (público), **nunca** usa `exigirRol` ni toca `agora-usuarios`. `GET` lista solo eventos con `estado` en `['publicado', 'agotado']` — usar el GSI `estado-fechaHora-index` con `Query` (uno por cada estado visible), nunca `Scan` de toda la tabla. `GET /:slug` usa el GSI `slug-index` con `Query` (no `Scan`), y responde 404 si el evento no existe o su estado no es público. **Ambos excluyen `productores`** de la respuesta (son correos de personal interno, no dato público) — filtrar el ítem antes de responder, nunca confiar en que el frontend simplemente no los muestre.
2. `detalle-evento.component.ts`: `title`/`description`/Open Graph/Twitter Card completos vía el servicio `Meta` de Angular, más JSON-LD `schema.org/Event` inyectado en el `<head>` (`tech-specs.md` §4.5) — la vista previa de Open Graph es el canal real de difusión por WhatsApp/Instagram (`PRD.md` §8), así que se verifica por inspección del HTML servido por SSR real (`curl`), no solo visualmente en el navegador.
3. `public/robots.txt`: bloquea `/admin`, `/panel`, `/aprobar`, `/compra`, `/boleta` (rutas administrativas o de enlace mágico, nunca deben indexarse).
4. `sitemap.xml`: generado dinámicamente a partir de los eventos `publicado` (mismo criterio de visibilidad que el endpoint público).
5. `serverless.yml`: función `eventosPublicos` con rol IAM de **solo lectura** (`dynamodb:Query`) sobre `agora-eventos` exclusivamente — sin `Scan`, sin acceso a `agora-usuarios` (no hay `exigirRol` que lo necesite), sin `s3:*`. CORS abierto en estos endpoints está permitido (`CLAUDE.md` §5, A05: lectura pública, no mutación ni dato personal).
6. `app.routes.ts`: `/` y `/evento/:slug`. `app.routes.server.ts`: **`RenderMode.Server`**, no `Client` ni `Prerender` — el contenido cambia con cada evento nuevo/editado (nada que prerenderizar de antemano) y los rastreadores de Open Graph/WhatsApp necesitan HTML ya resuelto en la primera respuesta, no una app que hidrate en el navegador (a diferencia de `/admin/*`, que sí puede ser `Client` porque no depende de SEO ni de rastreadores).

**Definition of done:**
- [ ] `GET /api/eventos-publicos` y `GET /api/eventos-publicos/:slug` nunca exponen `productores`
- [ ] Ambos endpoints usan `Query` sobre un GSI, nunca `Scan` de toda la tabla
- [ ] Un evento en `borrador`, `finalizado` o `cancelado` no aparece en la lista pública ni resuelve por slug (404)
- [ ] `/evento/:slug` renderiza Open Graph + Twitter Card + JSON-LD verificable por `curl` contra el HTML de SSR real
- [ ] `robots.txt` bloquea `/admin`, `/panel`, `/aprobar`, `/compra`, `/boleta`
- [ ] Rol IAM de `eventosPublicos` limitado a `Query` sobre `agora-eventos`, sin `Scan` ni acceso a otra tabla
- [ ] `/` y `/evento/:slug` en `RenderMode.Server`
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Tarea 2 — [FEATURE]: Menú de navegación para usuarios autenticados

**Origen:** Reporte directo del usuario (06/08/2026 noche): "es un poco complicado navegar" — hoy `app.html` es solo `<router-outlet />`, sin ningún header/nav/shell en toda la app, y la única forma de moverse entre `/admin/eventos` y `/admin/usuarios` es escribir la URL a mano · `tech-specs.md` §11 ítem 18 · `CLAUDE.md` §5 (A01 — jerarquía de roles vía `cumpleRolMinimo`, nunca comparaciones ad hoc) · `PRD.md` (navegación por teclado y etiquetas semánticas)

**Decisión de diseño clave (corrección explícita del usuario sobre el primer borrador de este plan):** la barra **siempre es visible**, con o sin sesión — nunca se oculta según `usuarioActual()` — porque debe ofrecer siempre una forma de llegar a `/login`. Ya autenticado, aparecen las secciones según rol, **incluyendo "Cartelera" (→ `/`)**, para que el personal autenticado también pueda saltar a ver la interfaz pública desde el mismo menú, no solo las secciones administrativas. Ver detalle completo de la decisión en `MEMORY.md` (sesión del 06/08/2026, noche).

**Archivos a crear:**
- `src/app/shared/navegacion/secciones-navegacion.ts` — interfaz `SeccionNavegacion { etiqueta, ruta, rolMinimo: Rol }` + constante `SECCIONES_NAVEGACION`, única fuente de verdad consumida tanto por la barra (qué enlaces mostrar) como por `app.routes.ts` (qué `rolMinimo` exige cada guard). 3 secciones: `Cartelera` → `/` rol `portero` (el más bajo — visible para cualquier rol autenticado); `Eventos` → `/admin/eventos` rol `administrador`; `Usuarios` → `/admin/usuarios` rol `administrador`. `/` todavía no existe como ruta (Tarea del backlog "Cartelera pública", roadmap #7) — el enlace queda visible pero no funcional hasta que esa tarea se implemente; decisión explícita del usuario, sin stub.
- `src/app/shared/navegacion/barra-navegacion.component.ts` (+ `.html`, `.spec.ts`) — standalone, sin `@Input()`, todo el estado sale de `ServicioAuth` inyectado.
- `src/app/core/guardias/guardia-invitado.ts` (+ `.spec.ts`) — guard de `/login` que redirige a una sección accesible si ya hay sesión autorizada.

**Qué hacer:**

1. `BarraNavegacionComponent`: sin Angular Material nuevo (`MatToolbar`/`MatSidenav`/`MatMenu`/`MatIcon`) — la app solo usa `button`/`dialog`/`form-field`/`select`/`snack-bar`/`table` hoy, y `App` carga *eager* (no `loadComponent`), así que un módulo Material nuevo aquí pesaría en el bundle inicial de toda página, incluida la futura cartelera pública para visitantes anónimos. El drawer móvil (`< 768px`) se hace con `signal(false)` + `@if` + Tailwind, mismo patrón que `formularioVisible` de `GestionUsuariosComponent` — primer breakpoint `md:` real del proyecto.
2. `secciones = computed(...)`: filtra `SECCIONES_NAVEGACION` con `cumpleRolMinimo(rol(), seccion.rolMinimo)`; `[]` si no hay rol.
3. Sin sesión: logo (enlaza a `/`) + enlace "Ingresar" a `/login`, sin secciones ni avatar. Con sesión: logo + `secciones()` (con `routerLinkActive`/`ariaCurrentWhenActive="page"`) + avatar (`photoURL` con `referrerpolicy="no-referrer"`, fallback de inicial) + botón "Cerrar sesión" (`servicioAuth.cerrarSesion()` + `router.navigateByUrl('/login')` — primer consumidor real de `cerrarSesion()` en la app).
4. `guardia-invitado.ts`: usa **`findLast`** (no `find`) sobre `SECCIONES_NAVEGACION` para elegir a dónde redirigir a un usuario ya autenticado que visita `/login` — con `find` normal, "Cartelera" (primera del arreglo, accesible para cualquier rol) siempre ganaría, rebotando incluso a un administrador hacia `/`, que todavía no existe. `findLast` prioriza la sección más específica que el rol cumple (administrador → `/admin/usuarios`).
5. `app.routes.ts`: agregar `canActivate: [guardiaInvitado]` a `/login`; derivar `data.rolMinimo` de las 3 rutas `admin/*` desde `SECCIONES_NAVEGACION` (evita declarar el mismo rol dos veces).
6. `app.html`/`app.ts`: `<app-barra-navegacion />` antes de `<router-outlet />`. `app.spec.ts` necesita los mismos `vi.mock('firebase/app'|'firebase/auth')` + `{ provide: ServicioAuth, useValue: {...} }` que ya usa `login.component.spec.ts`, porque `App` pasa a inyectar `ServicioAuth` transitivamente.

**Definition of done:**
- [ ] La barra se renderiza siempre (con y sin sesión), nunca condicionada a `usuarioActual()` a nivel de `@if` de todo el componente
- [ ] Sin sesión: solo logo + "Ingresar"; con sesión: secciones filtradas por rol + avatar + "Cerrar sesión"
- [ ] `administrador` ve "Cartelera", "Eventos" y "Usuarios"; `productor`/`portero` ven únicamente "Cartelera"
- [ ] Ningún componente compara roles a mano — todo pasa por `cumpleRolMinimo`
- [ ] `<img>` de `photoURL` lleva `referrerpolicy="no-referrer"`, con fallback de inicial si no hay foto
- [ ] Sección activa marcada con `aria-current="page"`, foco visible con teclado (Tab)
- [ ] `guardia-invitado.spec.ts` cubre: sin sesión → `true`; administrador → `createUrlTree(['/admin/usuarios'])`; portero → `createUrlTree(['/'])`
- [ ] `npm test` en verde (incluye `app.spec.ts`, `barra-navegacion.component.spec.ts`, `guardia-invitado.spec.ts`)
- [ ] `npm run build` sin errores (presupuesto de bundle y SSR)
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. **Motor de aforo** (reserva condicional, TTL, liberación por Streams) — bumped de Tarea 2 activa la noche del 06/08/2026 para priorizar el Menú de navegación (ver nota de prioridad arriba). Diseño ya completo y sin cambios en `tech-specs.md` §5.4 (los tres `UpdateCommand` condicionales) y §11 ítem 8 — al promoverla de nuevo, retomar el bloque "Qué hacer"/"Definition of done" que tenía como Tarea 2 (recuperable del historial de git de este archivo, commit previo a esta sesión).
2. Compra y reserva de sillas (depende de Motor de aforo)
3. Carga de comprobante por enlace mágico
4. Aprobación del productor
5. Emisión de boletas con QR firmado
6. Validación en puerta
7. Venta en efectivo
8. QR del evento para afiches (depende de CRUD de eventos, ya cerrado — puede promoverse antes si conviene agruparlo con otra tarea de `eventos.ts`)
9. Panel de control básico
10. Dominio personalizado `agora.letiende.co`

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para las tareas activas.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
