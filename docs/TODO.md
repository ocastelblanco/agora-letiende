# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (07/08/2026):** la Tarea 1 (Cartelera pública) se completó y se validó en vivo en staging por el usuario — ver `MEMORY.md` §2, §7 y §9 (incluye un bug real de empaquetado de `eventosPublicos` encontrado y corregido). Con eso cerrado, la Tarea 2 (Menú de navegación, roadmap #18) pasa a ser la Tarea 1 activa — su plan ya estaba aprobado desde la sesión anterior, sin cambios. El segundo slot lo vuelve a ocupar **Motor de aforo** (roadmap #8), que había quedado en el tope del backlog la noche del 06/08/2026 exactamente para este momento — su diseño ya estaba completo y no depende de nada más (`tech-specs.md` §5.4).

---

## Tarea 1 — [FEATURE]: Menú de navegación para usuarios autenticados

**Origen:** Reporte directo del usuario (06/08/2026 noche): "es un poco complicado navegar" — hoy `app.html` es solo `<router-outlet />`, sin ningún header/nav/shell en toda la app, y la única forma de moverse entre `/admin/eventos` y `/admin/usuarios` es escribir la URL a mano · `tech-specs.md` §11 ítem 18 · `CLAUDE.md` §5 (A01 — jerarquía de roles vía `cumpleRolMinimo`, nunca comparaciones ad hoc) · `PRD.md` (navegación por teclado y etiquetas semánticas)

**Decisión de diseño clave (corrección explícita del usuario sobre el primer borrador de este plan):** la barra **siempre es visible**, con o sin sesión — nunca se oculta según `usuarioActual()` — porque debe ofrecer siempre una forma de llegar a `/login`. Ya autenticado, aparecen las secciones según rol, **incluyendo "Cartelera" (→ `/`)**, para que el personal autenticado también pueda saltar a ver la interfaz pública desde el mismo menú, no solo las secciones administrativas. Ver detalle completo de la decisión en `MEMORY.md` (sesión del 06/08/2026, noche).

**Archivos a crear:**
- `src/app/shared/navegacion/secciones-navegacion.ts` — interfaz `SeccionNavegacion { etiqueta, ruta, rolMinimo: Rol }` + constante `SECCIONES_NAVEGACION`, única fuente de verdad consumida tanto por la barra (qué enlaces mostrar) como por `app.routes.ts` (qué `rolMinimo` exige cada guard). 3 secciones: `Cartelera` → `/` rol `portero` (el más bajo — visible para cualquier rol autenticado); `Eventos` → `/admin/eventos` rol `administrador`; `Usuarios` → `/admin/usuarios` rol `administrador`. **Actualización (07/08/2026): `/` ya existe** — Cartelera pública (roadmap #7) se completó y se fusiona en este mismo ciclo, así que el enlace "Cartelera" queda completamente funcional desde el primer momento, ya no es un enlace muerto.
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

## Tarea 2 — [FEATURE]: Motor de aforo (reserva condicional, TTL, liberación por Streams)

**Origen:** `PRD.md` (control de sobreventa) · `tech-specs.md` §11 ítem 8, §5.2 (`agora-compras`), §5.4 (ciclo de vida completo, ya documentado paso a paso) · `CLAUDE.md` §5 (A04 — riesgo central de Ágora)

**Alcance de esta tarea:** solo las primitivas de aforo y su limpieza automática — **no** el flujo de compra en sí (`handlers/compras.ts`, roadmap #9, todavía no existe). `agora-compras` ya existe en `serverless.yml` con `TimeToLiveSpecification` en `expiraEn` y `StreamSpecification: NEW_AND_OLD_IMAGES` (creada en la Tarea de infraestructura base) — esta tarea no la vuelve a crear, solo la consume.

**Archivos a crear:**
- `server/api/services/aforo.ts` (+ `.spec.ts`) — `reservarSillas(eventoId, cantidad)`, `confirmarSillas(eventoId, cantidad)`, `liberarSillas(eventoId, cantidad)`
- `server/api/handlers/liberar-reservas.ts` (+ `.spec.ts`) — consumidor de DynamoDB Streams de `agora-compras`

**Qué hacer:**

1. `aforo.ts`, las tres funciones son envolturas delgadas sobre exactamente los tres `UpdateCommand` condicionales que documenta `tech-specs.md` §5.4 (pasos 1-3) — **transcribir esas `ConditionExpression` tal cual, no reinventarlas**:
   - `reservarSillas`: `SET sillasDisponibles = sillasDisponibles - :n, sillasReservadas = sillasReservadas + :n` con `ConditionExpression: sillasDisponibles >= :n AND estado = 'publicado'`. Si falla, propaga un error distinguible (aforo insuficiente vs. evento no publicado) para que el futuro `handlers/compras.ts` (roadmap #9) pueda responder 409 con un mensaje claro — no acá, pero la forma del error debe ya soportarlo.
   - `confirmarSillas`: `SET sillasReservadas = sillasReservadas - :n` con `ConditionExpression: sillasReservadas >= :n`. Si el aforo llega a 0, además transiciona `estado` a `agotado` en la misma escritura.
   - `liberarSillas`: `SET sillasDisponibles = sillasDisponibles + :n, sillasReservadas = sillasReservadas - :n` con `ConditionExpression: sillasReservadas >= :n` — la condición sobre `sillasReservadas` (no un simple "siempre sumar") es lo que hace la operación segura ante un evento de Stream entregado dos veces (*at-least-once*, nunca *exactly-once*).
2. `liberar-reservas.ts`: Lambda con `streamEnabled` sobre el Stream de `agora-compras`, filtra únicamente eventos `REMOVE` (borrado por TTL) cuyo `OLD image` tenía un estado que todavía retenía aforo reservado (`iniciada`, `esperando_comprobante`, `en_revision` — no `aprobada`/`rechazada`/`expirada`, que ya liberaron o confirmaron su aforo por otro camino), y llama `liberarSillas(eventoId, cantidad)`. Idempotente por diseño gracias a la `ConditionExpression` de `liberarSillas` — un reintento del mismo registro de Stream no vuelve a restar de `sillasReservadas` por debajo de lo real porque la condición fallaría.
3. `serverless.yml`: función `liberarReservas` con evento `stream` apuntando al `StreamArn` de `AgoraCompras` (`BatchSize` pequeño, ej. 10, y `StartingPosition: LATEST`), rol IAM propio (`dynamodb:UpdateItem` sobre `agora-eventos` exclusivamente — sin acceso a `agora-compras` más allá de lo que el trigger de Streams ya provee, sin `agora-usuarios`, sin `exigirRol`: esta Lambda nunca la invoca un humano). **Empaquetar siempre con esbuild (`server/bundle-lambdas.mjs`), nunca "simple" como `salud`** — `aforo.ts` importa `documentoDynamoDB` (`@aws-sdk/lib-dynamodb`), y eso ya es suficiente para que la Lambda se caiga al arrancar si el paquete excluye `node_modules` (bug real encontrado en staging el 07/08/2026 con `eventosPublicos`, mismo motivo exacto — ver `MEMORY.md` §7). El criterio nunca fue "¿usa `firebase-admin`?", es "¿importa algo de `node_modules` en tiempo de ejecución?".

**Definition of done:**
- [ ] Las tres funciones de `aforo.ts` nunca leen el ítem del evento antes de escribir — toda modificación de aforo es una única escritura condicional
- [ ] `liberarSillas` es segura ante un mismo registro de Stream entregado más de una vez (probado explícitamente con una prueba que invoca la función dos veces con el mismo `eventoId`/`cantidad` y verifica que la segunda falla o no duplica el efecto)
- [ ] `liberar-reservas.ts` ignora eventos de Stream que no sean `REMOVE`, y los `REMOVE` cuyo estado previo ya no retenía aforo (`aprobada`/`rechazada`/`expirada`)
- [ ] Rol IAM de `liberarReservas` limitado a `dynamodb:UpdateItem` sobre `agora-eventos`, sin comodines
- [ ] `liberarReservas` empaquetada con esbuild (`server/bundle-lambdas.mjs`), no con `package.patterns` manual
- [ ] `npm run test:api` en verde (con los registros de Stream simulados vía mocks, sin depender de Streams reales)
- [ ] `npm run build:api` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Compra y reserva de sillas (depende de Motor de aforo)
2. Carga de comprobante por enlace mágico
3. Aprobación del productor
4. Emisión de boletas con QR firmado
5. Validación en puerta
6. Venta en efectivo
7. QR del evento para afiches (depende de CRUD de eventos, ya cerrado — puede promoverse antes si conviene agruparlo con otra tarea de `eventos.ts`)
8. Panel de control básico
9. Dominio personalizado `agora.letiende.co`

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
