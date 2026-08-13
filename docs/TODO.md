# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (12/08/2026):** T3 (fecha límite de etapas + banner AGOTADO/CANCELADO, extendido a la cartelera a pedido del usuario) fusionada — **PR #33**. Con esto, la **Fase 1 completa** de `docs/plan-pre-produccion.md` (T1-T4) queda terminada, las 4 fusionadas (PR #30/#31/#32/#33). Hotfix fuera de ciclo también fusionado (**PR #34** — bug real de `<select>` de cantidad enviando `string` en vez de `number`, ver `MEMORY.md` §7). T5 (menú de dos niveles) queda como **Tarea 1**, sin cambios de alcance, **todavía sin empezar** — es la siguiente tarea a retomar.

**Nota sobre el slot 2, deliberadamente sin tarea del plan por ahora:** T6, T7 y T8 (Fases 3-4) tienen dependencia dura y encadenada — T6 depende de T5 (asume las rutas `/mis-eventos/eventos*`), T7 depende de T6, T8 depende de T7 — así que ninguna de las tres puede empezar antes de que T5 se fusione. Como el usuario ya definió explícitamente (12/08/2026) que Bold/WhatsApp/Google Calendar/Dominio personalizado quedan detrás de las 8 tareas del plan **mientras dure el plan**, no se rellena el slot con un ítem del roadmap v2 solo para mantener la cuenta de "2 tareas" — sería trabajo especulativo sobre una tarea que ya se sabe bloqueada. El slot 2 se reactiva con T6 en cuanto T5 se fusione a `main`.

---

## Tarea 1 — [FEATURE]: Menú de dos niveles con rutas anidadas reales

**Origen:** `docs/ajustes-pre-producción.md`, sección "Reestructuración del menú principal" · `docs/plan-pre-produccion.md` Fase 2, T5.

**Alcance:** el menú de personal autenticado pasa de una lista plana (`SECCIONES_NAVEGACION`, hoy: Efectivo, Puerta, Panel, Aprobaciones, Eventos, Usuarios) a una jerarquía de dos niveles:
1. **Taquilla** (cualquier rol autenticado, mínimo `portero`) — tabs: Efectivo, Puerta.
2. **Mis Eventos** (`administrador`/`productor`) — tabs: Panel, Eventos, Aprobaciones.
3. **Usuarios** (`administrador`) — sin tabs, como hoy.

**Diseño de rutas (a confirmar en detalle al implementar, esqueleto aquí):**
- `/taquilla/efectivo` (hoy `/efectivo`, `SeleccionVentaEfectivoComponent`) y `/taquilla/puerta` (hoy `/puerta`, `SeleccionPuertaComponent`).
- `/mis-eventos/panel` (hoy `/panel`), `/mis-eventos/eventos` (hoy `/admin/eventos`), `/mis-eventos/aprobaciones` (hoy `/admin/aprobaciones`).
- `/admin/usuarios` puede quedar igual o pasar a `/usuarios` — decidir consistencia de prefijo al implementar.
- Rutas dinámicas por evento (`/evento/:slug/efectivo`, `/evento/:slug/puerta`, `/evento/:slug/panel`) **no cambian**.
- Redirects (`redirectTo`) desde las URLs viejas hacia las nuevas.

**Cambios estructurales:**
- `SECCIONES_NAVEGACION` deja de ser una lista plana — necesita un modelo de dos niveles (ej. `{ etiqueta, rolMinimo, tabs: [{ etiqueta, ruta }] }`). `BarraNavegacionComponent` y `rolMinimoDe()` (`app.routes.ts`) son los dos consumidores actuales de la fuente de verdad.
- `rutaDestinoParaRol()`: debe seguir devolviendo una ruta de **hoja** (ej. `/mis-eventos/panel`, no `/mis-eventos` a secas) para que el login siga aterrizando exactamente donde aterriza hoy — mismo criterio de `findLast`/orden ascendente de rol ya documentado en el archivo.
- `BarraNavegacionComponent`: la fila de tabs de segundo nivel solo se muestra para el grupo activo. Reutilizar el mismo patrón visual (`routerLink` + `routerLinkActive` con clases Tailwind) que ya usa la fila de primer nivel — **no** introducir `MatTabsModule` (el componente es eager-loaded en el shell de la app, decisión ya documentada en su docstring).
- Componentes "hub" nuevos (`TaquillaComponent`/`MisEventosComponent`) si se decide que cada grupo tenga su propio componente contenedor con `<router-outlet>`, o resolverlo solo con rutas hijas de `app.routes.ts` — decisión de implementación a tomar con el código real en pantalla.

**Archivos:** `secciones-navegacion.ts`/`.spec.ts`, `barra-navegacion.component.ts`/`.html`/`.spec.ts`, `app.routes.ts`, posibles componentes nuevos de "hub", y renombrado/movimiento de las carpetas de los selectores existentes si aplica.

**Riesgo:** es la tarea más grande y sensible de la Fase 1-2 del plan — toca el shell de navegación completo, los guards de rol de cada ruta de personal, y el destino post-login de los tres roles. **Verificación arquitectónica independiente obligatoria antes de abrir el PR**, mismo criterio ya aplicado a cambios de autorización previos.

**Definition of done:**
- [ ] Menú de personal reestructurado en Taquilla / Mis Eventos / Usuarios, con tabs de segundo nivel donde corresponde
- [ ] Todas las rutas nuevas son reales y bookmarkeables (rutas anidadas de Angular, no solo agrupación visual)
- [ ] Redirects desde las URLs viejas hacia las nuevas
- [ ] `rutaDestinoParaRol()` sigue aterrizando cada rol exactamente donde aterriza hoy (verificado con test, no solo revisado a ojo)
- [ ] Ningún guard de rol (`guardiaRol`) quedó más permisivo o más restrictivo de lo que era antes del cambio
- [ ] `npm run test` en verde (sin impacto en `test:api`, no se toca backend)
- [ ] `npm run build` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, bloqueada por dependencia dura sobre la Tarea 1

No hay una segunda tarea atómica del plan que se pueda trabajar en paralelo con la Tarea 1 en este momento: T6 (Fase 3, siguiente en `docs/plan-pre-produccion.md`) depende explícitamente de que T5 (Tarea 1 de arriba) esté fusionada — asume las rutas `/mis-eventos/eventos*` que T5 crea. T7 depende de T6, T8 depende de T7. Ver la nota de la cabecera de este documento para el razonamiento completo de por qué este slot no se rellena con un ítem del roadmap v2 mientras tanto.

**Se reactiva automáticamente con T6 en cuanto la Tarea 1 (T5) se fusione a `main`.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar/Dominio personalizado mientras dure este plan. Fase 1 completa (T1-T4, ver `MEMORY.md` §2). El motor JIT tiene ahora **T5 activa como Tarea 1**; el slot de Tarea 2 queda deliberadamente sin tarea del plan (ver nota de cabecera) hasta que T5 se fusione y desbloquee T6 — las siguientes recalculaciones seguirán sacando T6-T8 en orden, sin volver al roadmap v2 normal hasta agotar el plan.

### Pausada, no eliminada — Dominio personalizado `agora.letiende.co`

A pedido explícito del usuario (12/08/2026): queda detrás de las 8 tareas de `docs/plan-pre-produccion.md`, para poder usar ambos slots del motor JIT en el plan — no bloquea UAT (que corre contra `staging`, sin dominio propio). Especificación completa preservada tal cual, sin resumir, para retomarla sin re-derivar nada cuando el plan esté agotado:

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

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use.
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Wire-up en `deploy.yml` y en la Lambda que lo consume ya completado como parte de Emisión de boletas (PR #19, `MEMORY.md` §2) — bullet dejado como referencia histórica del secreto, no una tarea pendiente.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
