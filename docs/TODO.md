# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (25/08/2026, continuación):** **Sincronización con Google Calendar (roadmap #22) completa** — implementada y **validada en vivo en staging por el usuario** ("Efectivamente, ese era el problema. Ahora todo funciona bien."), tras una sesión de depuración con **4 bugs reales** encontrados y corregidos uno por uno en producción/staging real: (1) `.github/workflows/deploy.yml` nunca reenviaba el secreto `GOOGLE_CALENDAR_SERVICE_ACCOUNT` al paso `serverless deploy` (mismo tipo de gap ya documentado 3 veces antes en este proyecto, esta vez un nivel más arriba, en el workflow); (2) con ese fix ya desplegado, el deploy real fallaba con `Request must be smaller than 5120 bytes for the UpdateFunctionConfiguration operation` — límite duro de AWS Lambda para variables de entorno, resuelto migrando la credencial de Calendar a **AWS SSM Parameter Store** (nivel Standard, gratis, verificado ese mismo día) en vez de dejarla como variable de entorno junto a `FIREBASE_SERVICE_ACCOUNT_AGORA`; (3) `calendarId: 'primary'` no sirve para una cuenta de servicio — ese literal siempre resuelve al calendario propio (vacío) de la cuenta de servicio, nunca al calendario compartido de `letiende.co@gmail.com`, corregido reemplazándolo por el correo real; (4) causa raíz final, no de código — la **Google Calendar API nunca había sido habilitada** en el proyecto de Google Cloud `comandante-letiende` (paso documentado en `docs/tareas-a-realizar.md` §10 que no se había ejecutado realmente pese a estar marcado), diagnosticado con un logging de error permanente agregado a `sincronizarEventoCalendar()` (mensaje, código HTTP y cuerpo de error real de Google — decisión explícita de dejarlo así de forma permanente, no revertirlo, por ser información segura de loguear y de valor para observabilidad futura). 396 pruebas backend en verde. Todo en el **PR #48, todavía sin fusionar** — el usuario pidió cerrar la documentación ahora, dentro del PR, en anticipación de la fusión (mismo patrón ya usado para los PR #45/#46/#47).

**Motor JIT recalculado — decisión explícita del usuario, no automática:** el usuario pidió arrancar directamente **Bold (roadmap #19)** como Tarea 1, pese a que su prerrequisito externo (llaves de integración de Bold) sigue sin resolverse — verificado hoy contra `docs/tareas-a-realizar.md` §9, con los campos "Valores obtenidos" todavía vacíos. Es la misma lógica ya aplicada a WhatsApp en su momento (`docs/MEMORY.md` ADR-003): conviene arrancar el trabajo de código en paralelo a que se consigan las llaves, en vez de esperar a que el trámite externo termine primero. El algoritmo normal del motor JIT (comparar `PRD.md` contra `MEMORY.md` sin bloqueo externo) habría dejado este slot en pausa, como en la sesión del 24/08/2026 — el usuario decidió anularlo directamente.

---

## Tarea 1 — Bold: pago automático (roadmap #19), decisión explícita del usuario

**Prioridad Alta**, v2. **Prerrequisito externo sin resolver, verificado hoy (25/08/2026):** las llaves de integración de Bold (`docs/tareas-a-realizar.md` §9) siguen sin obtenerse — `BOLD_LLAVE_IDENTIDAD`, `BOLD_LLAVE_SECRETA`, confirmación de sandbox y URL de webhook configurada, todos vacíos. Esta tarea se activa de todos modos por pedido explícito del usuario, para adelantar el trabajo de código que no depende de tener las llaves reales todavía.

**Alcance** (`docs/PRD.md` §5.10, `docs/tech-specs.md` §11 fila 19): cuando el evento tenga habilitada la cuenta Bold de Le Tiende como medio de pago, el cliente paga en línea y el sistema recibe la confirmación directamente de la pasarela — sin comprobante que cargar ni aprobación de productor que esperar, las boletas se emiten en el momento. Bold solo puede habilitarse en eventos administrados por Le Tiende (`administradoPorLeTiende: true`) que ya tengan al menos una etapa de boletería configurada (regla ya reforzada en tres puntos de `actualizarEvento()` desde la tarea de Boletería opcional). Archivos técnicos previstos: `handlers/bold-webhook.ts`, `services/bold.ts`.

**Primer paso concreto, antes de escribir código:** una sesión de planeación/investigación igual a la que ya se hizo para Google Calendar (`.omc/plans/google-calendar-sync.md` como referencia de formato) — investigar contra la documentación oficial de Bold (`https://developers.bold.co/pagos-en-linea/`) la forma exacta del webhook, el mecanismo de verificación de firma, si hay credenciales de sandbox, y las decisiones de arquitectura, en particular cómo reconciliar la notificación del webhook contra la API de Bold antes de marcar una compra como pagada (`CLAUDE.md` §5, A08, ya exige explícitamente no confiar en el solo hecho de recibir una petición en el endpoint). No hay nada más que resolver a mano en este documento para esta tarea — solo el alcance, ya tomado de `PRD.md`/`tech-specs.md`.

---

## Tarea 2 — Exportación de reportes en PDF (roadmap #21, resto)

**Prioridad Media**, v2 — la que le corresponde al algoritmo normal del motor JIT (comparar `PRD.md` roadmap contra `MEMORY.md` estado, sin bloqueo externo conocido). De los ítems de v2 que quedan, es el único sin ningún prerrequisito externo: WhatsApp (#20) sigue bloqueado por la Verificación de Negocio de Meta, sin cambios desde la sesión anterior; Bold (#19) ya se activó arriba pese a su bloqueo, por decisión explícita del usuario; Google Calendar (#22) ya está completo (ver arriba). La Exportación XLSX (roadmap #21) ya está implementada y fusionada desde v1 — el PDF nunca se inició.

**Alcance:** `docs/PRD.md` §6 (tabla de roadmap v2) lista "Exportación de reportes en XLSX y PDF" con XLSX ya entregado; el motor de generación de PDF queda por definir (`CLAUDE.md` §2 lo deja explícitamente "por definir"). Ampliación prevista de `handlers/reportes.ts` (`docs/tech-specs.md` §11 fila 21), reutilizando el patrón ya probado de exportación XLSX (autorización por rol/pertenencia al evento, enlace de descarga prefirmado y de vida corta — datos personales, `CLAUDE.md` §5 sección Habeas Data).

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas) **completo y fusionado**. Tres hotfixes antes del paso a producción y segunda ronda de hotfixes **fusionados** (PR #41/#42). **Dominio personalizado `agora.letiende.co` fusionado y verificado en vivo (PR #43, ADR-013)** — roadmap #17 completo. **Boletería opcional (roadmap #24) fusionada (PR #46).** **Eventos con boletería externa (roadmap #25) fusionada (PR #47).** **Sincronización con Google Calendar (roadmap #22) implementada y validada en vivo en staging (PR #48) — pendiente de fusionar.** De v2 (roadmap #19-21): Bold (#19) activo como Tarea 1 pese a su bloqueo externo (decisión explícita del usuario); Exportación PDF (#21, resto) activa como Tarea 2; WhatsApp (#20) sigue bloqueado por prerrequisito externo (ver "Pendientes que no son de código" abajo).

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. **Confirmado también en `production` (14/08/2026, auditoría pre-lanzamiento):** los 4 secretos por-ambiente existen en el entorno `production` de GitHub — `SES_REMITENTE` tenía un espacio al inicio, corregido con `gh secret set`.
- ✅ **`agora-usuarios-production` tenía al menos un `administrador` (14/08/2026, auditoría pre-lanzamiento) — estaba vacía, se agregó `ocastelblanco@gmail.com`.** Sin esto, nadie podía operar el sistema en producción pese a tener sesión válida (proyecto Firebase compartido, autorización de Ágora independiente, `CLAUDE.md` §5 A01).
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Wire-up en `deploy.yml` y en la Lambda que lo consume ya completado como parte de Emisión de boletas (PR #19, `MEMORY.md` §2) — bullet dejado como referencia histórica del secreto, no una tarea pendiente.
- ✅ `GOOGLE_CALENDAR_SERVICE_ACCOUNT` creado en GitHub (`staging`, sección 10) y ya conectado al deploy en ambos jobs (`f6a8989`) — la credencial real vive en SSM Parameter Store (`/agora/${stage}/google-calendar-service-account`), no como variable de entorno de Lambda. **Google Calendar API habilitada en el proyecto `comandante-letiende` (25/08/2026)** — causa raíz final del bloqueo de esta tarea, resuelta por el usuario desde la consola de Google Cloud. Falta confirmar que el secreto también exista en el entorno `production` de GitHub antes de fusionar el PR #48 a producción — pendiente de verificar en la próxima sesión que retome esto.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) — **bloqueante directo de la Tarea 1 activa arriba**, aunque no impide arrancar la sesión de planeación previa.

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.

**Recordatorio activo (14/08/2026):** confirmar que el costo del dominio personalizado de producción (ADR-013, se verificó teóricamente en US$0 adicional) se sostiene en la factura real 48 horas después del despliegue del PR #43 (16/08/2026 o después) — mismo comando que arriba.

**Recordatorio activo (nuevo, 25/08/2026):** confirmar que `GOOGLE_CALENDAR_SERVICE_ACCOUNT` (GitHub) y el parámetro SSM `/agora/production/google-calendar-service-account` existen en `production` antes de fusionar el PR #48 — la validación de esta sesión solo cubrió `staging`.
