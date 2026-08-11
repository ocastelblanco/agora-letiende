# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (10/08/2026):** el PR #21 (Venta en efectivo) ya se fusionó a `main`. **Panel de control básico (Tarea 2) quedó implementada de punta a punta en esta sesión** — endpoint de métricas, selector `/panel`, `PanelEventoComponent`, infraestructura y las dos decisiones de diseño que la especificación dejaba abiertas (ver `MEMORY.md` §9 para el detalle completo, incluyendo un hallazgo real de una verificación independiente: `porEtapa` podía reportar $0 silenciosamente para eventos editados tras la venta, corregido en la misma sesión). Todos los ítems del DoD de Tarea 2 están marcados salvo la fusión misma — **PR #22 abierto, sin fusionar**, a la espera de validación del usuario en staging (mismo criterio de todas las tareas anteriores: no se recalcula el motor JIT ni se mueve a `MEMORY.md` §2 Completado hasta que el usuario valide/apruebe). Dominio personalizado (Tarea 1, roadmap #17) sigue activa sin cambios, todavía sin empezar.

---

## Tarea 1 — [FEATURE]: Dominio personalizado `agora.letiende.co`

**Origen:** `tech-specs.md` §11 ítem 17 (depende solo de #2, infraestructura base, ya completa) · `tech-specs.md` §7.1 (diagrama de despliegue: CloudFront "opcional en v1, requerido para dominio propio") y §7.2 (tabla de entornos: `production` ya apunta a `https://agora.letiende.co`, todavía sin aprovisionar) · `CLAUDE.md` §7 (gotcha heredado de Babel: `NG_ALLOWED_HOSTS` debe configurarse junto con el dominio, no después de que producción falle)

**Alcance:** montar `agora.letiende.co` como dominio propio de `production`, con TLS, sobre la infraestructura ya desplegada (API Gateway HTTP API + Lambda SSR). `staging` sigue sin dominio propio (URL plana de API Gateway, sin cambios). No incluye nada de fase 2 (Bold, WhatsApp, Calendar).

**Antes de escribir infraestructura — verificar, no asumir (`CLAUDE.md` §5-bis, disciplina de precios):**
- Confirmar por CLI si ya existe una zona alojada de Route 53 para `letiende.co` en la cuenta compartida (`CLAUDE.md` menciona ~7 zonas ya activas para el ecosistema, ~US$3,58/mes repartidos entre las tres apps) — de ser así, esta tarea solo agrega un registro DNS, **nunca crea una zona nueva** (evita duplicar ese costo fijo).
- Decidir y documentar como **ADR-013** en `MEMORY.md`, con cifra verificada el mismo día en <https://calculator.aws/>: CloudFront + certificado ACM (como sugiere el diagrama de §7.1) vs. dominio personalizado directo de API Gateway HTTP API con certificado ACM regional (sin CloudFront, menos piezas que mantener). Si Babel ya resolvió este mismo problema, verificar su patrón real en su `serverless.yml` antes de reinventar — mismo criterio que ya se siguió para ADR-001/002/009/010.

**Archivos a crear/modificar:**
- `serverless.yml`: certificado ACM (validado por DNS, en la región que corresponda a la opción elegida en el ADR-013), recurso de dominio personalizado y mapeo del `basePath` a la Lambda `ssr`.
- Registro DNS en la zona de `letiende.co` (alias hacia CloudFront o hacia el dominio regional de API Gateway, según la opción elegida).
- Configuración de SSR de Angular: `NG_ALLOWED_HOSTS` debe incluir `agora.letiende.co` **desde el mismo commit** que monta el dominio — nunca "montar primero, configurar después" (gotcha ya sufrido en Babel).
- `docs/tech-specs.md` §7.2: actualizar la fila de `production` con la URL real ya aprovisionada.

**Definition of done:**
- [ ] `https://agora.letiende.co` sirve el SSR de producción con certificado TLS válido
- [ ] `NG_ALLOWED_HOSTS` incluye el dominio desde el mismo despliegue que lo monta, no como fix posterior
- [ ] Decisión CloudFront vs. dominio directo de API Gateway documentada como ADR-013 con cifra de costo verificada el mismo día
- [ ] Ninguna zona de Route 53 nueva creada si ya existe una para `letiende.co` — a lo sumo un registro adicional
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas (`grep` del patrón de `CLAUDE.md` §5-bis)
- [ ] Verificado por CLI tras desplegar, no solo el IaC (certificado en estado `ISSUED`, dominio resuelve, `GET /` responde 200 con TLS válido)
- [ ] Revisión de costo real agendada a las 48 horas del despliegue (`CLAUDE.md` §5-bis, paso 4)
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Tarea 2 — [FEATURE]: Panel de control básico

**Origen:** `PRD.md` §5.6 (alcance completo, marcado "v1 básico, v2 completo"), CU-15/CU-16 · `tech-specs.md` §11 ítem 16 (`features/panel/`, `handlers/reportes.ts`, depende de #13 Validación en puerta, ya fusionada), §5.1 (`GET /api/eventos/:eventoId/panel`, Productor del evento), §4.2 (ruta `/evento/:slug/panel`, `GuardiaAuth` + rol ≥ productor **+ asignado al evento**) · `CLAUDE.md` §5 (A01: un productor solo ve el panel de los eventos donde está en `productores`, verificado contra ese campo, nunca contra el rol a secas)

**Alcance:** el productor de un evento (o cualquier administrador) consulta, para ese evento: boletas vendidas y valor recaudado por etapa de boletería, sillas disponibles/vendidas, la lista de clientes que compraron, y — el dato con más urgencia el día del evento — cuántos asistentes ya ingresaron y cuántos faltan. Es una pantalla de **solo lectura**, sin ninguna acción que mute estado.

**Decisión de alcance resuelta al especificar, no una ambigüedad a resolver después:** `PRD.md` §5.6 titula la sección "v1 básico, v2 completo" y en el mismo párrafo menciona "descargar la lista completa de boletas" — pero la tabla de roadmap de `PRD.md` §6 pone **"Exportación de reportes en XLSX y PDF" explícitamente en v2** (Media prioridad), y `tech-specs.md` §11 roadmap #21 ("v2 — Exportación XLSX/PDF") depende de #16 y amplía `handlers/reportes.ts`. Las dos fuentes coinciden en que el archivo descargable es v2: esta tarea implementa **solo** `GET /api/eventos/:eventoId/panel` (métricas en pantalla), **no** `GET /api/eventos/:eventoId/reportes?formato=xlsx|pdf` (que sí aparece, de forma inconsistente con el roadmap, en la tabla de endpoints de `tech-specs.md` §5.1 — corregir esa fila al implementar, mismo criterio ya usado con el payload de `ventas-efectivo` en la tarea anterior).

**Riesgo de duplicación a resolver explícitamente al implementar:** verificar el rol de un productor **para un evento específico** (`evento.productores.includes(email)`, con bypass para `administrador`) ya aparece una vez, inline, en `listarPendientes()` de `aprobaciones.ts` (filtra la lista completa de eventos por productor). Esta tarea es el segundo consumidor real de "¿este productor está asignado a este evento puntual?" — evaluar si conviene extraer una función compartida (p. ej. en `lib/autorizacion.ts`, junto a `exigirRol`) en vez de repetir la comparación ad hoc una tercera vez en el futuro (`CLAUDE.md` §5, A01: "la jerarquía se resuelve en una única función del backend"). No es obligatorio resolverlo con una extracción — es una decisión de diseño a tomar con el código real de ambos handlers en pantalla, no en abstracto.

**Gap real descubierto al especificar, fuera de alcance de esta tarea (no lo resuelve, solo lo deja documentado):** la tabla `agora-auditoria` existe en `serverless.yml` desde la infraestructura base, pero **ningún handler la usa todavía** — ni siquiera tiene la variable de entorno `TABLA_AUDITORIA` configurada en ninguna función. `CLAUDE.md` §5 (A09) exige un rastro de auditoría append-only para toda transición con consecuencia económica; hoy esa información vive solo como campos sobrescribibles (`resueltoPor`/`resueltoEn`) en el propio ítem de la compra, no en un registro separado e inmutable. El panel de esta tarea lee el estado actual (no un historial), así que no lo necesita — pero es una deuda real que alguna tarea futura debe cerrar explícitamente, no seguir postergando en silencio.

**Decisión de diseño a resolver explícitamente al implementar (mismo tipo de hueco ya resuelto dos veces, en Validación en puerta y en Venta en efectivo):** ni `tech-specs.md` ni `PRD.md` dicen cómo un productor llega a `/evento/:slug/panel` con el `slug` en la mano. A diferencia de `/puerta` y `/efectivo` (selectores que listan *todos* los eventos publicados, sin filtrar por asignación), un selector de panel tendría que filtrar por productor asignado — dato que hoy no expone ningún endpoint público. Opciones a evaluar con el código real en pantalla: (a) agregar un enlace "Panel" a cada fila de `ListaAprobacionesComponent` (`/admin/aprobaciones`, ya filtra por productor asignado del lado del backend) en vez de crear un cuarto patrón de selector; (b) un selector nuevo respaldado por un endpoint que devuelva únicamente los eventos del productor autenticado. No decidir en abstracto — mirar primero si (a) alcanza antes de construir (b).

**Ya existe, se reutiliza sin recrear:**
- `server/api/lib/autorizacion.ts`: `exigirRol('productor')` — la verificación de "asignado a este evento" se agrega **después**, no reemplaza a `exigirRol`.
- Índices ya provisionados y sin usar todavía para este propósito: `eventoId-estado-index` de `agora-boletas` (una sola `Query` por `eventoId` trae todas las boletas del evento, agregación de vendidas/ingresadas/faltan en código, sin `Scan`) y `eventoId-creadaEn-index` de `agora-compras` (mismo patrón que `listarPendientes()` en `aprobaciones.ts`, filtrando por `estado` en vez de escanear).
- Patrón de acceso de datos personales ya establecido: mismo criterio que `obtenerDetalleAprobacion()` en `aprobaciones.ts` — el panel expone `cliente` porque quien lo pide ya está autenticado y autorizado para ese evento puntual, no antes.
- Frontend: `docs/DESIGN.md` ya define el contenedor (`max-w-4xl`/`max-w-6xl`, "paneles de administración") y el patrón de tabla (`mat-table` con sorting/paginación) para esta pantalla exacta — sin inventar un patrón visual nuevo. `MatTableDataSource`/`MatSort`/`MatPaginator` ya se usan en `GestionEventosComponent`/`GestionUsuariosComponent`/`ListaAprobacionesComponent`: tercer/cuarto consumidor, no el primero.

**Archivos a crear:**
- `server/api/handlers/reportes.ts` (+ `.spec.ts`) — `GET /api/eventos/:eventoId/panel` (`exigirRol('productor')` + verificación de asignación al evento, con bypass para `administrador`).
- `src/app/features/panel/panel-evento.component.ts` (+ `.html`, `.spec.ts`) — ruta protegida `/evento/:slug/panel`.
- `src/app/core/api/panel.service.ts` (+ `.spec.ts`) — autenticado.

**Archivos a modificar:**
- `serverless.yml`: función `reportes` nueva con rol IAM propio (`dynamodb:Query` en `agora-boletas` vía `eventoId-estado-index`, `dynamodb:Query` en `agora-compras` vía `eventoId-creadaEn-index`, `dynamodb:GetItem`/`Query` en `agora-eventos` para resolver `slug` → `eventoId` y leer `productores`, `dynamodb:GetItem` en `agora-usuarios` vía `exigirRol`).
- `server/bundle-lambdas.mjs`: agregar `reportes.js`.
- `src/app/app.routes.ts`/`app.routes.server.ts`: `/evento/:slug/panel` (`RenderMode.Client` — misma razón que `/evento/:slug/puerta`/`/evento/:slug/efectivo`, sesión de Firebase).
- `docs/tech-specs.md` §5.1: corregir la fila de `GET /api/eventos/:eventoId/reportes` para marcarla explícitamente v2 (ver decisión de alcance arriba), no implementarla en esta tarea.

**Qué hacer:**

1. Resolver el punto de diseño de "cómo llega un productor a `/evento/:slug/panel`" antes de escribir el componente — evaluar primero si un enlace en `ListaAprobacionesComponent` alcanza.
2. Resolver el riesgo de duplicación de "productor asignado a este evento" con el código real de `aprobaciones.ts` en pantalla.
3. `handlers/reportes.ts`: `exigirRol('productor')` → resolver evento por slug o id → verificar asignación (o `administrador`) → `Query` a `agora-boletas`/`agora-compras` → agregar métricas en código (vendidas/recaudado por etapa, ingresados/faltan, lista de clientes) → responder.
4. `PanelEventoComponent`: tabla de Angular Material con el patrón ya establecido, sin acción alguna que mute estado.

**Definition of done:**
- [x] `GET /api/eventos/:eventoId/panel` responde solo a `exigirRol('productor')` **y** verificación de asignación al evento (o `administrador`) — nunca al rol a secas
- [x] Las métricas se calculan con `Query` sobre los GSIs ya provisionados (`eventoId-estado-index`, `eventoId-creadaEn-index`) — nunca `Scan` (el único `Scan` de esta tarea vive en el endpoint *selector* `GET /api/eventos/panel`, sobre `agora-eventos`, mismo precedente ya establecido por `aprobaciones.ts`/`eventos.ts` — el DoD de "nunca Scan" aplica al endpoint de métricas, que sí cumple)
- [x] No incluye exportación de archivo (XLSX/PDF) — explícitamente fuera de alcance, diferido a roadmap #21 (v2)
- [x] `docs/tech-specs.md` §5.1 corregido para reflejar que el endpoint de reportes/exportación es v2
- [x] El gap de `agora-auditoria` sin usar queda documentado en `MEMORY.md`, no resuelto a medias dentro de esta tarea
- [x] `npm run test:api` y `npm run test` en verde
- [x] `npm run build` sin errores
- [x] Auditoría de costos sin coincidencias nuevas
- [x] Todo entregado en una rama con PR abierto — **sin fusionar** (PR #22)

---

## Backlog

Vacío de ítems v1 — con Panel de control básico promovido a Tarea 2, no queda ningún ítem v1 sin desglosar (`PRD.md` §6). Lo siguiente después de cerrar las dos tareas activas es evaluar el arranque de v2 (`tech-specs.md` §11, roadmap #19-22: Bold, WhatsApp, Exportación XLSX/PDF, Google Calendar) — no desglosar todavía.

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use.
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Falta wire-up en `deploy.yml` y en la Lambda que lo consuma por primera vez, parte de la implementación de esta Tarea 2.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
