# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (03/09/2026, actualizado) — Integración con el proxy de `letiende.co`:**
pedido **externo** al roadmap de este repositorio, coordinado desde el proyecto contenedor
`letiende.co` (T-0013 en su `TODO.md`). No ocupa un slot del motor JIT (Tarea 1/Tarea 2 siguen siendo
las de v2, sin cambios). **PRs #58/#59/#60 ya fusionados**: `baseHref: /cartelera/`, barra de
navegación común solo en el estado sin sesión, sitemap apuntando a `letiende.co/cartelera`, y
redirección 301 desde `agora.letiende.co` (dos ramas: `/`/`evento/:slug` cross-domain por SEO, el
resto mismo dominio con el prefijo agregado, para no romper el acceso directo del staff).

Tras el primer despliegue real a staging, verificado con curl y con navegador real
(`claude-in-chrome`), aparecieron **dos hallazgos más, ninguno anticipado por la planeación original**,
ambos ya corregidos y verificados en vivo pero **pendientes de revisión y fusión humana**:

- **PR #61 (`fix/sitemap-bajo-prefijo-cartelera`):** `staging.letiende.co/cartelera/sitemap.xml`
  respondía 404 — CloudFront reenvía la ruta completa con el prefijo (sin `OriginPath`), pero el API
  Gateway de esta app solo tenía registrada `/sitemap.xml` sin prefijo. Se agregó un segundo evento
  `httpApi` (`/cartelera/sitemap.xml`) a la función `eventosPublicos`, y como su handler inspecciona
  `evento.rawPath`, se cambió esa igualdad exacta por un `Set` con las dos rutas válidas.
- **PR #62 (`fix/api-embebida-antepone-prefijo`):** el hallazgo más grave de esta ronda, reportado en
  vivo por el humano ("nada funciona") — `http.get('/api/eventos-publicos')` es una ruta **absoluta**,
  y el navegador la resuelve contra el ORIGEN de la página (`staging.letiende.co`), **ignorando el
  `<base href>`** por completo (a diferencia de una ruta relativa). Sin prefijo, CloudFront la enrutaba
  al comportamiento por defecto (el contenedor `letiende.co`) en vez de a esta app. El fix del lado de
  CloudFront (quitar el prefijo antes del origen, ya desplegado en `letiende.co`) era necesario pero
  **insuficiente por sí solo**: el navegador nunca llegaba a enviar la URL con prefijo. Se completó
  extendiendo el `absoluteUrlInterceptor` (ya existía para el caso SSR) para anteponer `/cartelera` a
  las llamadas `/api/*` en el navegador cuando `EmbebidoService.embebido` es `true`. Verificado con
  navegador real: `GET staging.letiende.co/cartelera/api/eventos-publicos` → 200, cartelera carga
  datos reales, sin errores de consola.

Detalle técnico completo de los 4 hallazgos (los 2 de la implementación original más estos 2) en
`docs/MEMORY.md` §2/§7. **Pendiente:** que el humano revise y fusione los PRs #61 y #62 — hasta
entonces, `agora.letiende.co` sigue funcionando exactamente igual que antes de esta tarea en
producción (nada de esto se despliega a producción sin fusionar; en staging ya está desplegado y
verificado).

**Estado al cierre de sesión (26/08/2026, continuación) — Roadmap #19 (Pago automático con Bold) completo, los 3 PR fusionados:** Sub-tarea 1 (backend, PR #50), Sub-tarea 2 (frontend, PR #51) y el fix de aforo de `esperando_pago_bold` encontrado validando esta última (PR #52) quedan todos fusionados en `main`. El usuario completó la validación manual final en staging real con tarjetas Visa/Mastercard y PSE de pruebas (aprobada, rechazada por el banco, error de transacción, abandono del pago) — funcionó de punta a punta. Resumen técnico completo movido a `docs/MEMORY.md` §2 (dos bullets, Sub-tarea 1 y Sub-tarea 2) y §9 (narrativa completa de las 3 rondas de bugs reales del frontend más el fix de aforo). Ramas `feature/bold-pagos-frontend`/`fix/aforo-esperando-pago-bold` limpiadas (locales y remotas, ya auto-eliminadas por GitHub al fusionar). Repositorio de vuelta en `main`, solo esa rama local.

**Corrección de estado adicional, encontrada al recalcular este documento (26/08/2026):** `docs/PRD.md` §6 marcaba **Boletería opcional (PR #46) y Eventos con boletería externa (PR #47) como "pendiente de fusionar"**, pese a que ambos se fusionaron el 24/08/2026 — la misma clase de nota-de-sesión-sin-corregir que afectó al PR #50 de Bold este mismo día (ver `docs/MEMORY.md` §9 para la lección completa). Corregido en `PRD.md` y en las menciones equivalentes de `docs/MEMORY.md` §2.

**Estado al cierre de sesión (25/08/2026, continuación):** **Sincronización con Google Calendar (roadmap #22) completa** — implementada y **validada en vivo en staging por el usuario** ("Efectivamente, ese era el problema. Ahora todo funciona bien."), tras una sesión de depuración con **4 bugs reales** encontrados y corregidos uno por uno en producción/staging real: (1) `.github/workflows/deploy.yml` nunca reenviaba el secreto `GOOGLE_CALENDAR_SERVICE_ACCOUNT` al paso `serverless deploy` (mismo tipo de gap ya documentado 3 veces antes en este proyecto, esta vez un nivel más arriba, en el workflow); (2) con ese fix ya desplegado, el deploy real fallaba con `Request must be smaller than 5120 bytes for the UpdateFunctionConfiguration operation` — límite duro de AWS Lambda para variables de entorno, resuelto migrando la credencial de Calendar a **AWS SSM Parameter Store** (nivel Standard, gratis, verificado ese mismo día) en vez de dejarla como variable de entorno junto a `FIREBASE_SERVICE_ACCOUNT_AGORA`; (3) `calendarId: 'primary'` no sirve para una cuenta de servicio — ese literal siempre resuelve al calendario propio (vacío) de la cuenta de servicio, nunca al calendario compartido de `letiende.co@gmail.com`, corregido reemplazándolo por el correo real; (4) causa raíz final, no de código — la **Google Calendar API nunca había sido habilitada** en el proyecto de Google Cloud `comandante-letiende` (paso documentado en `docs/tareas-a-realizar.md` §10 que no se había ejecutado realmente pese a estar marcado), diagnosticado con un logging de error permanente agregado a `sincronizarEventoCalendar()` (mensaje, código HTTP y cuerpo de error real de Google — decisión explícita de dejarlo así de forma permanente, no revertirlo, por ser información segura de loguear y de valor para observabilidad futura). 396 pruebas backend en verde. **PR #48 fusionado (25/08/2026)** — desplegado automáticamente a `production` por el push a `main`, verificado por CLI (`aws lambda get-function-configuration`/`aws ssm get-parameter` contra `agora-letiende-production-eventos`): la Lambda real de producción quedó con la misma credencial válida (`agora-calendario@comandante-letiende.iam.gserviceaccount.com`) ya en SSM, sin necesitar ningún paso adicional — la Google Calendar API habilitada en el proyecto `comandante-letiende` (25/08/2026) es una configuración a nivel de proyecto, no por stage, así que ya cubre `production` también.

---

## Tarea 1 — Exportación de reportes en PDF (roadmap #21, resto)

**Prioridad Media**, v2 — calculada por el algoritmo normal del motor JIT (comparar `PRD.md` roadmap contra `MEMORY.md` estado, sin bloqueo externo conocido). Con Bold (#19) completo y fusionado, Google Calendar (#22) completo, y Etapas de boletería (#23) entregado en v1, este es el único ítem de v2 sin ningún prerrequisito externo: WhatsApp (#20) sigue bloqueado por la Verificación de Negocio de Meta. La Exportación XLSX (roadmap #21) ya está implementada y fusionada desde v1 — el PDF nunca se inició.

**Alcance:** `docs/PRD.md` §6 (tabla de roadmap v2) lista "Exportación de reportes en XLSX y PDF" con XLSX ya entregado; el motor de generación de PDF queda por definir (`CLAUDE.md` §2 lo deja explícitamente "por definir"). Ampliación prevista de `handlers/reportes.ts` (`docs/tech-specs.md` §11, endpoint `GET /api/eventos/:eventoId/reportes`, hoy responde `501` explícito para `?formato=pdf`), reutilizando el patrón ya probado de exportación XLSX (autorización por rol/pertenencia al evento, enlace de descarga prefirmado y de vida corta — datos personales, `CLAUDE.md` §5 sección Habeas Data).

**Primer paso probable, no implementación directa:** al no haber una librería de PDF ni un diseño de layout decididos todavía, la primera sesión de esta tarea probablemente empiece por una investigación corta (opciones de generación de PDF viables en Node 24/Lambda — tamaño de paquete, cold start, si hace falta un binario nativo tipo Chromium que complicaría el empaquetado — y qué columnas/formato debe llevar el reporte) antes de escribir código, mismo criterio que se usó para Google Calendar (`.omc/plans/google-calendar-sync.md` como formato de referencia).

---

## Tarea 2 — en pausa, sin candidato desbloqueado

El algoritmo normal del motor JIT no encuentra un segundo ítem de v2 sin bloqueo externo: WhatsApp (#20) sigue esperando la Verificación de Negocio de Meta (lenta, sin control del equipo), y no queda ningún otro ítem de v2 pendiente además de la Exportación PDF (Tarea 1). Mismo criterio ya usado en la sesión del 25/08/2026 cuando ocurrió esta misma situación (justo antes de que el usuario decidiera anular el orden normal y arrancar Bold pese a su bloqueo).

Si el usuario quiere anular el orden normal — por ejemplo, adelantar WhatsApp pese al bloqueo, o traer un ítem de v3 (`PRD.md` §6, "ideas no comprometidas") — es una decisión explícita suya, el motor JIT no la infiere solo.

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas) **completo y fusionado**. Tres hotfixes antes del paso a producción y segunda ronda de hotfixes **fusionados** (PR #41/#42). **Dominio personalizado `agora.letiende.co` fusionado y verificado en vivo (PR #43, ADR-013)** — roadmap #17 completo. **Boletería opcional (roadmap #24) fusionada (PR #46).** **Eventos con boletería externa (roadmap #25) fusionada (PR #47).** **Sincronización con Google Calendar (roadmap #22) fusionada y verificada también en producción por CLI (PR #48).** **Pago automático con Bold (roadmap #19) completo — PR #50 (backend), #51 (frontend) y #52 (fix de aforo) fusionados, validado de punta a punta en staging real por el usuario.** Exportación PDF (#21, resto) activa como Tarea 1; WhatsApp (#20) sigue bloqueado por prerrequisito externo (ver "Pendientes que no son de código" abajo); Tarea 2 en pausa por falta de candidato desbloqueado.

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. **Confirmado también en `production` (14/08/2026, auditoría pre-lanzamiento):** los 4 secretos por-ambiente existen en el entorno `production` de GitHub — `SES_REMITENTE` tenía un espacio al inicio, corregido con `gh secret set`.
- ✅ **`agora-usuarios-production` tenía al menos un `administrador` (14/08/2026, auditoría pre-lanzamiento) — estaba vacía, se agregó `ocastelblanco@gmail.com`.** Sin esto, nadie podía operar el sistema en producción pese a tener sesión válida (proyecto Firebase compartido, autorización de Ágora independiente, `CLAUDE.md` §5 A01).
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Wire-up en `deploy.yml` y en la Lambda que lo consume ya completado como parte de Emisión de boletas (PR #19, `MEMORY.md` §2) — bullet dejado como referencia histórica del secreto, no una tarea pendiente.
- ✅ `GOOGLE_CALENDAR_SERVICE_ACCOUNT` creado en GitHub (`staging` **y** `production`, ambos ya confirmados) y conectado al deploy en ambos jobs (`f6a8989`) — la credencial real vive en SSM Parameter Store (`/agora/${stage}/google-calendar-service-account`), no como variable de entorno de Lambda. **Google Calendar API habilitada en el proyecto `comandante-letiende` (25/08/2026)** — causa raíz final del bloqueo de esta tarea, resuelta por el usuario desde la consola de Google Cloud (configuración a nivel de proyecto, cubre `staging` y `production` por igual). **PR #48 fusionado y verificado en producción por CLI el mismo día** — sin pendientes.
- ✅ Llaves de Bold obtenidas (`staging` **y** `production`), webhooks configurados en el panel de Bold. **Roadmap #19 completo y fusionado (26/08/2026)** — sin pendientes de código; queda como referencia histórica del secreto.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.

**Recordatorio activo (14/08/2026):** confirmar que el costo del dominio personalizado de producción (ADR-013, se verificó teóricamente en US$0 adicional) se sostiene en la factura real 48 horas después del despliegue del PR #43 (16/08/2026 o después) — mismo comando que arriba.

**Recordatorio activo (25/08/2026):** revisar el costo real de SSM Parameter Store 48 horas después del despliegue a producción del PR #48 (27/08/2026 o después) — se verificó teóricamente como gratis (nivel Standard, sin "higher throughput") el mismo día de la implementación, falta confirmarlo en la factura real — mismo comando que arriba.

**Recordatorio activo (nuevo, 26/08/2026):** revisar el costo real de la Lambda `boldWebhook` (roadmap #19, PR #50) 48 horas después de su primer despliegue a producción (verificar con `git log`/`gh pr view` cuándo se desplegó realmente, no asumir la fecha de fusión de este documento) — mismo comando que arriba. Costo esperado insignificante (una función Lambda más con `PAY_PER_REQUEST`/`logRetentionInDays` explícito, sin recursos de costo continuo), pero sin verificar en la factura real todavía.
