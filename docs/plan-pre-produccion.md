# Plan de ejecución — Ajustes pre-producción (previo a UAT y v1)

Desglose técnico de `docs/ajustes-pre-producción.md` (documento de negocio de OCM) en tareas atómicas ejecutables. Escrito el 12/08/2026, originalmente con GitHub presentando problemas para fusionar PRs (ya resuelto). El PR #28 (Etapas de boletería con cierre automático) ya se fusionó, y el usuario confirmó (12/08/2026) usar **ambos slots** del motor JIT de `TODO.md` para este plan — Dominio personalizado pasa a Backlog, pausada. **T1 y T2 son las Tarea 1/Tarea 2 activas de `TODO.md` en este momento.**

**Decisiones ya confirmadas con el usuario, no reabrir:**
- Los "tabs" de segundo nivel del menú son **rutas anidadas reales** de Angular (bookmarkeables), no solo una agrupación visual.
- Este plan vive en un documento aparte; `TODO.md` sigue con su regla de **exactamente 2 tareas atómicas activas**, sacando de aquí en el orden de abajo.
- **Orden de ejecución:** (1) ajustes menores de UI → (2) reestructuración del menú → (3) aumento de alcance del productor → (4) limitación de alcance de productor/portero por evento — el cambio más grande y más sensible en seguridad, al final, con más margen de tiempo antes de UAT.
- **No hay fecha fija de UAT** — depende de cuándo el prototipo esté listo. El usuario fue explícito: **las 8 tareas de este documento deben completarse antes de cualquier prueba UAT**, no es un plan del que se pueda recortar alcance a mitad de camino.
- **Confirmado (12/08/2026):** ambos slots del motor JIT dedicados a este plan — Dominio personalizado pausada en el Backlog de `TODO.md` hasta agotarlo.

---

## Fase 1 — Ajustes menores de UI (bajo riesgo, rápidos)

### T1 — Header y login: botón "Ingresar" e vínculo "Cartelera" `[x] completada 12/08/2026, PR #30`

**Origen:** tabla de ajustes menores, filas "Header" (×2) y "Login".

**Alcance:**
- `shared/navegacion/barra-navegacion.component.html`: el botón de texto "Ingresar" (visible sin sesión, línea ~13-18) pasa a ser un *icon button* (ícono de persona/login, sin texto), manteniendo el mismo `routerLink="/login"` y accesibilidad (`aria-label` explícito, ya que sin texto visible el ícono solo no basta para lectores de pantalla).
- `shared/navegacion/secciones-navegacion.ts`: quitar la entrada `{ etiqueta: 'Cartelera', ruta: '/', rolMinimo: 'portero' }` del arreglo `SECCIONES_NAVEGACION` — deja de aparecer en el menú de usuarios autenticados (el logo ya enlaza a `/`, siempre visible en el header). La ruta pública `/` no se toca, sigue existiendo y accesible para cualquiera (autenticado o no) vía URL o logo.
- El botón "Ingresar" del header no debe verse en `/login` (se confunde con "Ingresar con Google"). Requiere que `BarraNavegacionComponent` sepa en qué ruta está — evaluar al implementar si conviene una señal reactiva sobre `Router.events` (`NavigationEnd`) o pasar un dato de ruta (`data: { ocultarAccesoEnHeader: true }` en `/login` de `app.routes.ts`) que el header lea vía `ActivatedRoute`. Decisión de implementación, no de negocio.

**Verificar tras el cambio (`rutaDestinoParaRol`):** quitar "Cartelera" del arreglo no debe afectar el destino post-login de ningún rol — hoy `portero` ya tiene "Efectivo"/"Puerta" como siguiente sección con `findLast`, así que sigue aterrizando igual. Confirmar con los tests existentes de `secciones-navegacion.spec.ts` y agregar un caso si hace falta.

**Archivos:** `barra-navegacion.component.html`/`.ts`/`.spec.ts`, `secciones-navegacion.ts`/`.spec.ts`, `app.routes.ts` (si se opta por `data`).

**Dependencias:** ninguna.

---

### T2 — Selector de cantidad de boletas (compra pública + venta en efectivo) `[activa como Tarea 2 de TODO.md]`

*(sigue activa, sin cambios en esta recalculación)*

**Origen:** tabla de ajustes menores, filas "Compra de boletas" y "Venta en efectivo".

**Alcance:** en `ComprarComponent` (`comprar.component.html:47-61`) y `VentaEfectivoComponent` (mismo patrón, confirmar líneas reales al implementar), reemplazar el `<input type="number" formControlName="cantidad">` por un `<select formControlName="cantidad">` con opciones de `1` hasta `Math.min(evento.maxBoletasPorCompra, evento.sillasDisponibles)`. El texto *helper* pasa de "Máximo {N} por compra" a incluir también `Sillas disponibles: {SILLAS_DISPONIBLES}` (redacción exacta a confirmar, el documento de negocio la da literal).

**Decisión de implementación a resolver, no en abstracto:** ambos componentes ya calculan `totalEstimado()`/validan `cantidad` contra el `FormControl` — verificar que el `<select>` nuevo siga disparando esos `computed` sin cambios (el valor sigue siendo un número, solo cambia el control de entrada). Si `sillasDisponibles` o `maxBoletasPorCompra` es `0`, el desplegable queda vacío — confirmar que `puedeComprar()`/su equivalente en venta en efectivo ya cubre ese caso (probablemente sí, ambos ya condicionan la visibilidad del formulario).

**Archivos:** `comprar.component.html`/`.ts`/`.spec.ts`, `venta-efectivo.component.html`/`.ts`/`.spec.ts`.

**Dependencias:** ninguna.

---

### T3 — Fecha límite de etapas + banner AGOTADO/CANCELADO en `/evento/:slug` `[activa como Tarea 1 de TODO.md]`

**Origen:** tabla de ajustes menores, filas "Card de evento detallado" (×2).

**⚠️ Dependencia dura: requiere el PR #28 ya fusionado.** Ambos ajustes tocan `detalle-evento.component.html`/`.ts`, el mismo archivo que el PR #28 (Etapas de boletería con cierre automático) modificó extensamente (badges "Vigente"/"Cerrada", `etapasOrdenadas`, orden cronológico). Empezar esta tarea antes de fusionar el PR #28 garantiza un conflicto de fusión doloroso sobre el mismo bloque de template. Esperar a que `main` tenga el PR #28 fusionado antes de crear la rama de esta tarea.

**Alcance:**
1. En la lista "Etapas de boletería" (el mismo `@for` que ya distingue vigente/cerrada tras el PR #28), agregar la fecha límite de cada etapa (`etapa.cierraEn`, formateada en hora de Bogotá — reutilizar `paraInputBogota` o una variante de solo-lectura ya usada en el resto del frontend, no reinventar el formateo).
2. Si `detalleEvento.estado === 'agotado'`, superponer un aviso diagonal con el texto **AGOTADO** sobre la imagen del evento; si `estado === 'cancelado'`, el texto **CANCELADO**. Ambos estados ya existen en el modelo (`EstadoEvento`, `eventos.ts:27`) — esto es puramente de presentación, ningún cambio de backend. Decisión a resolver al implementar: qué mostrar si el evento no tiene `imagenUrl` (¿el aviso igual se muestra sobre el espacio donde iría la imagen, o se omite?).

**Archivos:** `detalle-evento.component.html`/`.ts`/`.spec.ts`.

**Dependencias:** PR #28 fusionado.

---

### T4 — Colapsar "Etapas de boletería" en el formulario de editar evento

**Origen:** tabla de ajustes menores, fila "Editar evento".

**Alcance:** en `EditarEventoComponent`, la sección completa de "Etapas de boletería" (el `FormArray` de etapas, hoy siempre expandido) pasa a vivir dentro de un panel colapsable (colapsado por defecto — coherente con el objetivo general de reducir la extensión visual de las pantallas de administración, mismo espíritu que la reestructuración del menú de la Fase 2). Evaluar al implementar: panel hecho a mano (`signal` + Tailwind, mismo patrón ya usado en el resto del componente, que no usa Angular Material más allá de `MatButtonModule`) vs. introducir `MatExpansionModule` por primera vez en el proyecto — dado que ningún otro componente usa expansion panels todavía y este formulario es 100% de inputs nativos, el patrón hecho a mano es más consistente con el resto del archivo.

**Archivos:** `editar-evento.component.html`/`.ts`/`.spec.ts`.

**Dependencias:** ninguna (aunque conviene secuenciarla después de T6/T7 si esas tareas también tocan este mismo componente, para no generar múltiples rondas de conflictos — evaluar en el momento).

---

## Fase 2 — Reestructuración del menú principal

### T5 — Menú de dos niveles con rutas anidadas reales

**Origen:** sección "Reestructuración del menú principal" del documento de negocio.

**Alcance:** el menú de personal autenticado pasa de una lista plana (`SECCIONES_NAVEGACION`, hoy: Efectivo, Puerta, Panel, Aprobaciones, Eventos, Usuarios) a una jerarquía de dos niveles:

1. **Taquilla** (cualquier rol autenticado, mínimo `portero`) — tabs: Efectivo, Puerta.
2. **Mis Eventos** (`administrador`/`productor`) — tabs: Panel, Eventos, Aprobaciones.
3. **Usuarios** (`administrador`) — sin tabs, como hoy.

**Diseño de rutas (a confirmar en detalle al implementar, esqueleto aquí):**
- `/taquilla/efectivo` (hoy `/efectivo`, `SeleccionVentaEfectivoComponent`) y `/taquilla/puerta` (hoy `/puerta`, `SeleccionPuertaComponent`).
- `/mis-eventos/panel` (hoy `/panel`), `/mis-eventos/eventos` (hoy `/admin/eventos`), `/mis-eventos/aprobaciones` (hoy `/admin/aprobaciones`).
- `/admin/usuarios` puede quedar igual o pasar a `/usuarios` — decidir consistencia de prefijo al implementar (dado que ya no hay una sección "admin" diferenciada en el menú, probablemente convenga quitar el prefijo `admin/` de todas las rutas de personal, no solo de las que cambian de nombre).
- Rutas dinámicas por evento (`/evento/:slug/efectivo`, `/evento/:slug/puerta`, `/evento/:slug/panel`) **no cambian** — no son parte de la jerarquía de navegación de personal, son pantallas de trabajo alcanzadas *desde* los selectores de arriba.
- Redirects (`redirectTo`) desde las URLs viejas hacia las nuevas, para no romper nada que ya las use (aunque en pre-producción el riesgo es bajo, es una red de seguridad barata).

**Cambios estructurales:**
- `SECCIONES_NAVEGACION` deja de ser una lista plana — necesita un modelo de dos niveles (ej. `{ etiqueta, rolMinimo, tabs: [{ etiqueta, ruta }] }` para los grupos con tabs, y una entrada simple para "Usuarios"). `BarraNavegacionComponent` y `rolMinimoDe()` (`app.routes.ts`) son los dos consumidores actuales de la fuente de verdad — ambos necesitan adaptarse al nuevo modelo sin perder la garantía de "un solo lugar declara el rol de cada ruta".
- `rutaDestinoParaRol()`: debe seguir devolviendo una ruta de **hoja** (ej. `/mis-eventos/panel`, no `/mis-eventos` a secas) para que el login siga aterrizando exactamente donde aterriza hoy — mismo criterio de `findLast`/orden ascendente de rol ya documentado en el archivo, adaptado a la nueva estructura de dos niveles.
- `BarraNavegacionComponent`: la fila de tabs de segundo nivel solo se muestra para el grupo activo (ej. si estoy en cualquier ruta bajo `/mis-eventos/*`, se ve la fila Panel/Eventos/Aprobaciones). Reutilizar el mismo patrón visual (`routerLink` + `routerLinkActive` con clases Tailwind) que ya usa la fila de primer nivel — **no** introducir `MatTabsModule`: este componente es eager-loaded en el shell de la app (`App`), y su propio docstring ya documenta la decisión explícita de no sumar módulos de Material ahí para no pesar el bundle inicial de páginas públicas.
- Componentes "hub" nuevos (`TaquillaComponent`/`MisEventosComponent`) si se decide que cada grupo tenga su propio componente contenedor con `<router-outlet>` para las tabs — o resolverlo solo con la configuración de rutas anidadas de `app.routes.ts` (rutas hijas con `path: ''` redirigiendo a la tab por defecto) sin un componente contenedor dedicado. Decisión de implementación a tomar con el código real de `app.routes.ts` en pantalla.

**Archivos:** `secciones-navegacion.ts`/`.spec.ts`, `barra-navegacion.component.ts`/`.html`/`.spec.ts`, `app.routes.ts`, posibles componentes nuevos de "hub", y renombrado/movimiento de las carpetas de los selectores existentes si aplica.

**Riesgo:** es la tarea más grande de la Fase 1-2 del plan — toca el shell de navegación completo, los guards de rol de cada ruta de personal, y el destino post-login de los tres roles. Verificación arquitectónica independiente recomendada antes de abrir el PR (mismo criterio ya aplicado a cambios de autorización previos).

**Dependencias:** ninguna técnica, pero conviene hacerla antes de T6 (que asume las nuevas rutas `/mis-eventos/eventos*`).

---

## Fase 3 — Aumento de alcance del productor

### T6 — El productor puede editar campos puntuales de sus propios eventos

**Origen:** sección "Ajustes a la lógica de negocio → Aumento de alcance de productor" del documento de negocio.

**Alcance:** hoy `server/api/handlers/eventos.ts` exige `administrador` para **todo** el handler (`eventos.ts:601`, un único `exigirRol` antes de despachar por método — GET, POST, PUT, DELETE, subida de activos y descarga de QR quedan todos detrás del mismo portón). Este ajuste requiere volverlo consciente de rol por sub-ruta:

- `GET /api/eventos` (listar): `administrador` ve todos (sin cambios); `productor` ve solo los eventos donde está en `productores` — mismo patrón ya establecido por `tieneAccesoAlEvento`/`listarEventosPanel()` (`reportes.ts`), no reinventarlo.
- `PUT /api/eventos/:eventoId`: `administrador` puede editar cualquier campo (sin cambios); `productor` **asignado al evento** (`tieneAccesoAlEvento`) puede editar únicamente: `maxBoletasPorCompra`, `plazoComprobanteMinutos`, `imagenKey`, `logotipoKey`. Cualquier otro campo en el payload de un productor debe rechazarse explícitamente (`CLAUDE.md` §5 A08 — nunca aceptar en silencio algo que no se valida), no ignorarse sin decir nada. El resto de campos los ve, pero de solo lectura en el frontend.
- `POST /api/eventos/:eventoId/activos/url-carga` (subida de imagen/logo): `administrador` o productor asignado — el productor ahora puede cambiar imagen/logo.
- `GET /api/eventos/:eventoId/qr`: `administrador` o productor asignado — "Descargar códigos QR" es un ítem explícito de los ajustes permitidos.
- `POST /api/eventos` (crear) y `DELETE /api/eventos/:eventoId`: siguen siendo **exclusivos de `administrador`**, sin cambios.

**Frontend:** `EditarEventoComponent`, ya bajo las rutas nuevas de T5 (`/mis-eventos/eventos/:id` para editar, accesible a `productor`+`administrador`; `/mis-eventos/eventos/nuevo` para crear, exclusivo de `administrador` — dos entradas de ruta distintas apuntando al mismo componente, con `rolMinimo` distinto cada una, mismo patrón de literal-antes-que-parámetro ya usado en Angular). El formulario debe:
- Deshabilitar (no ocultar del todo — el documento dice "los podrá ver, pero como solo lectura") todos los campos salvo los 4 permitidos, cuando el rol actual es `productor`.
- Enviar solo los campos permitidos en el `PUT` cuando el rol es `productor` (payload parcial — `actualizarEvento()` ya soporta actualizaciones parciales por campo, no hace falta cambiar eso).
- Ocultar el botón "Crear evento" de `GestionEventosComponent` (la lista, en `/mis-eventos/eventos`) para `productor` — el backend ya lo bloquearía, pero no debe ni aparecer la opción.

**Archivos:** `server/api/handlers/eventos.ts`/`.spec.ts`, `editar-evento.component.ts`/`.html`/`.spec.ts`, `gestion-eventos.component.ts`/`.html`/`.spec.ts`, `app.routes.ts` (las dos entradas de ruta nuevas/`nuevo` vs `:id`).

**Dependencias:** T5 (asume las rutas `/mis-eventos/eventos*`).

---

## Fase 4 — Limitación de alcance de productores y porteros por evento

La más grande y más sensible en seguridad de las cuatro fases — toca autorización real sobre dos rutas de dinero/control de acceso físico (venta en efectivo, validación en puerta). Dividida en dos tareas para no mezclar "cambio de modelo de datos y formulario" con "cambio de autorización en producción".

### T7 — Modelo de datos y formulario: selección de productores/porteros por evento

**Origen:** sección "Ajustes a la lógica de negocio → Limitación de alcance de productores y porteros" del documento de negocio.

**Alcance:**
- Agregar `porteros: string[]` al modelo de `Evento` (backend `eventos.ts`, frontend `evento.model.ts`) — análogo exacto a `productores` hoy. Validación nueva `normalizarPorteros()` en `eventos.ts`, mismo patrón que `normalizarProductores()` (arreglo de correos válidos).
- **Cambio de validación en creación:** hoy `crearEvento()` acepta `productores: []` (cero productores es válido). El documento de negocio exige **mínimo un productor obligatorio** para guardar el evento — actualizar `normalizarProductores`/la validación de `crearEvento()` para rechazar un arreglo vacío. `porteros` sigue siendo opcional (puede quedar vacío al crear).
- `EditarEventoComponent`: reemplazar el campo de texto libre `productoresTexto` (correos separados por coma) por un selector múltiple (`mat-select` con `multiple` — ya establecido en el proyecto por `GestionUsuariosComponent`, reutilizar el patrón en vez de introducir un componente de selección nuevo) alimentado por `GET /api/usuarios` filtrado a rol `productor`. Agregar un selector análogo para `porteros`, filtrado a rol `portero`. Ambos exclusivos de `administrador` en la UI — el productor los ve de solo lectura (consistente con T6).
- "Los otros productores o porteros se podrán añadir luego, al editarlo" — confirma que el `PUT` de edición ya permite modificar estos arreglos (sin cambios de backend más allá de agregar `porteros` al conjunto de campos editables por `administrador`).

**Archivos:** `server/api/handlers/eventos.ts`/`.spec.ts` (modelo + validación), `evento.model.ts`, `editar-evento.component.ts`/`.html`/`.spec.ts`.

**Dependencias:** T6 (comparte el mismo componente y varios de los mismos campos del formulario — hacerlas en el mismo PR o en PRs consecutivos inmediatos para no generar conflictos de fusión sobre `editar-evento.component.ts`).

---

### T8 — Autorización real por evento para venta en efectivo y validación en puerta

**Origen:** mismo ajuste de negocio que T7, la mitad de aplicación/autorización.

**Alcance:**
- Generalizar `tieneAccesoAlEvento()` (`server/api/lib/autorizacion.ts:54-62`) para que, además de `administrador` (bypass sin cambios) y `productor` (chequeo contra `productores`, sin cambios), también resuelva `portero` contra el nuevo campo `porteros`. Es la única función que ya centraliza esta pertenencia — generalizarla ahí, no crear una segunda función paralela.
- Aplicar el chequeo en `server/api/handlers/ventas-efectivo.ts` (`exigirRol('portero')` ya existe; agregar `tieneAccesoAlEvento` una vez resuelto el evento por slug, mismo punto donde `compras.ts`/`ventas-efectivo.ts` ya resuelven el evento completo — no hace falta una lectura extra).
- Aplicar el chequeo en `server/api/handlers/boletas.ts` (`POST /api/boletas/:codigo/validar`, `exigirRol('portero')`). **Cuidado de rendimiento a evaluar explícitamente al implementar:** hoy esta ruta hace una única escritura condicional sin lectura previa en el camino feliz (`ConditionExpression: estado = 'valida' AND eventoId = :eventoId`), optimizado a propósito porque es la ruta más sensible a latencia del sistema (`PRD.md` §8, escaneo en ráfaga el día del evento). Agregar el chequeo de pertenencia exige leer el evento antes de la escritura condicional — evaluar si el costo de una lectura extra es aceptable (probablemente sí frente al riesgo de seguridad de dejarlo sin chequear) y documentar la decisión, no dejarla implícita.
- **Nuevo endpoint (o generalización de uno existente)** que devuelva solo los eventos asignados al usuario actual, según su rol (`portero` → por `porteros`; `productor` → por `productores`; `administrador` → todos). Candidato natural: generalizar `listarEventosPanel()` (`reportes.ts`), que ya hace exactamente esto para `productor`, en vez de triplicar la lógica. Consumido por `SeleccionVentaEfectivoComponent` y `SeleccionPuertaComponent` (que hoy listan TODOS los eventos publicados sin filtrar, vía `EventosPublicosService`, sin ningún contexto de usuario) — y evaluar si conviene que la lista "Eventos" de T6 (`GestionEventosComponent`, para `productor`) también migre a este mismo endpoint en vez de mantener su propio filtro.
- **DoD debe incluir** actualizar `CLAUDE.md` §5 A01: la regla ya escrita ahí habla solo de "productor... la pertenencia se verifica contra el campo productores del evento" — generalizar la redacción para incluir portero/`porteros` una vez esto esté implementado (no antes — `CLAUDE.md` documenta reglas ya vigentes en el código, no un estado futuro).

**Archivos:** `server/api/lib/autorizacion.ts`/`.spec.ts`, `ventas-efectivo.ts`/`.spec.ts`, `boletas.ts`/`.spec.ts`, `reportes.ts` (si se generaliza `listarEventosPanel`), `seleccion-venta-efectivo.component.ts`/`.spec.ts`, `seleccion-puerta.component.ts`/`.spec.ts`, `CLAUDE.md` §5 A01.

**Dependencias:** T7 (necesita el campo `porteros` ya existente en el modelo).

---

## Cómo sigue esto

1. ~~Fusionar el PR #28~~ — hecho (12/08/2026).
2. ~~Recalcular `TODO.md`~~ — hecho (12/08/2026): T1 y T2 son ahora la Tarea 1/Tarea 2 activas, Dominio personalizado pausada en el Backlog.
3. Cada tarea de este documento se especifica con el nivel de detalle completo de `TODO.md` (Origen/Alcance/Decisiones/Archivos/DoD) recién al convertirse en la Tarea activa — este documento es el mapa de ruta, no el reemplazo de esa especificación.
4. Al completar cada tarea, se mueve su resumen a `MEMORY.md` §2 (igual que siempre) y se marca aquí (agregar `[x]`/fecha/PR al título de la sección correspondiente), sin borrar el contenido — este documento queda como registro histórico del plan completo, igual que `TODO.md` mueve las tareas completadas a `MEMORY.md` en vez de borrarlas. Al terminar T2, la siguiente recalculación saca T3 (y T4 si cabe en el segundo slot) en el mismo orden de Fases.
