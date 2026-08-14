# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (14/08/2026, continuación):** el usuario fusionó el **PR #42** (segunda ronda de hotfixes: correo, productores, mensaje de aprobación, doble envío, SLA de aforo — ver `MEMORY.md` §2/§7/§9) y pidió **alistar todo para el paso a producción**, lanzamiento planeado esa misma tarde. Auditado el estado real de producción por CLI (no solo el IaC): el stack se despliega automáticamente en cada merge a `main` y ya estaba al día, las 5 tablas en `PAY_PER_REQUEST` y vacías, los 4 secretos por-ambiente ya existían en GitHub. Se encontraron y corrigieron **tres gaps reales de lanzamiento**: `agora-usuarios-production` estaba vacía (se agregó `ocastelblanco@gmail.com` como `administrador`, autorizado por el usuario); el secreto `SES_REMITENTE` de `production` tenía un espacio al inicio (corregido); y `URL_BASE_APP` de producción ya apuntaba a `https://agora.letiende.co`, un dominio que todavía no existía. Esto último convirtió **Dominio personalizado** (roadmap #17) en un hotfix urgente en vez de un ítem pausado — decidido con el usuario (`AskUserQuestion`) montarlo ahora, replicando el patrón ya verificado en producción por Babel (ver ADR-013 en `MEMORY.md`). **Motor JIT recalculado:** Tarea 1 pasa a Dominio personalizado, retomado del Backlog e implementado en esta misma sesión — **PR pendiente de abrir**. El slot de Tarea 2 sigue sin asignar (ver nota abajo).

**Nota sobre el slot 2, deliberadamente sin tarea por ahora:** de lo que queda en el roadmap tras `docs/plan-pre-produccion.md`, Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — están bloqueados por prerrequisitos externos no de código (llaves/alta de WABA, ver "Pendientes que no son de código" abajo), y Google Calendar (#22) — v2, Media prioridad — todavía no está desglosado a nivel de tarea atómica y tiene una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). El slot 2 se reactiva en cuanto uno de los dos deje de estar bloqueado, cuando Google Calendar se desglose, o cuando se retome Dominio personalizado.

---

## Tarea 1 — [HOTFIX URGENTE]: Dominio personalizado `agora.letiende.co`

**Origen:** `tech-specs.md` §11 ítem 17 · `tech-specs.md` §7.1/§7.2 · `CLAUDE.md` §7 (gotcha heredado de Babel: `NG_ALLOWED_HOSTS` junto con el dominio, nunca después). **Ascendido de "pausado en el Backlog" a hotfix urgente el mismo día (14/08/2026):** auditando el estado real de producción antes del paso a producción de esta tarde, se encontró que el secreto `URL_BASE_APP` de `production` **ya apuntaba a `https://agora.letiende.co`** desde el 08/08/2026 — sin este dominio, cualquier correo real (comprobante, aprobación, boletas) tendría un enlace roto desde el primer minuto de producción. Decidido con el usuario (`AskUserQuestion`): montarlo ahora en vez de lanzar con la URL cruda.

**Alcance:** montar `agora.letiende.co` como dominio propio de `production`, con TLS, sobre la infraestructura ya desplegada (API Gateway HTTP API + Lambda SSR). `staging` sigue sin dominio propio. Implementado replicando el patrón exacto **ya verificado en producción por Babel** (`babel.letiende.co`): dominio directo de API Gateway HTTP API con certificado ACM regional, **sin CloudFront** — ver ADR-013 en `MEMORY.md` para el detalle completo (incluida la verificación de costo el mismo día: US$0 adicional).

**Implementación (`serverless.yml`):** `Conditions.EsProduccion` (`!Equals ['${sls:stage}', 'production']`) gatea cuatro recursos nuevos — `AWS::CertificateManager::Certificate` (DNS validado, `HostedZoneId` explícito para que CloudFormation cree el CNAME de validación solo, sin paso manual), `AWS::ApiGatewayV2::DomainName` (`REGIONAL`), `AWS::ApiGatewayV2::ApiMapping` y `AWS::Route53::RecordSet` (alias hacia el dominio regional de la API, sin costo por consulta). `NG_ALLOWED_HOSTS` de la Lambda `ssr` usa `Fn::If` para agregar `agora.letiende.co` **en el mismo cambio**, solo en production. Verificado sintetizando la plantilla (`npx serverless package`) contra ambos stages antes de comitear: `staging` no genera ninguno de los cuatro recursos, `production` sí.

**Otros gaps de lanzamiento encontrados y corregidos en la misma sesión (fuera del alcance estricto de esta tarea, pero bloqueantes igual):**
- `agora-usuarios-production` estaba vacía (0 ítems) — nadie podía operar el sistema. Se agregó `ocastelblanco@gmail.com` como `administrador` (autorizado explícitamente por el usuario), verificado con `aws dynamodb scan`.
- El secreto `SES_REMITENTE` del entorno `production` de GitHub tenía un espacio al inicio (`" taquilla@letiende.co"`, a diferencia de `staging`) — habría roto el nombre visible del remitente (PR #42) y posiblemente el envío mismo. Corregido con `gh secret set`.

**Definition of done:**
- [x] `https://agora.letiende.co` sirve el SSR de producción con certificado TLS válido — **pendiente de verificar por CLI tras el deploy real** (el certificado ACM se valida por DNS durante el propio `serverless deploy`, sin garantía dura de tiempo)
- [x] `NG_ALLOWED_HOSTS` incluye el dominio desde el mismo commit que lo monta
- [x] Decisión CloudFront vs. dominio directo de API Gateway documentada como ADR-013 con cifra de costo verificada el mismo día (US$0 adicional, verificado contra documentación oficial de AWS, no de memoria)
- [x] Ninguna zona de Route 53 nueva creada — la de `letiende.co` ya existía, confirmado por CLI
- [x] `npm run build`/`build:api` sin errores, 325 pruebas backend + 272 frontend en verde (sin cambios de app, solo infraestructura)
- [x] Auditoría de costos sin coincidencias nuevas (`grep` del patrón de `CLAUDE.md` §5-bis)
- [ ] Verificado por CLI tras desplegar a producción, no solo el IaC (certificado `ISSUED`, dominio resuelve, `GET /` responde 200 con TLS válido)
- [ ] Revisión de costo real agendada a las 48 horas del despliegue (`CLAUDE.md` §5-bis, paso 4)
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, sin candidato sin bloqueo externo

Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Google Calendar (#22) — v2, Media prioridad — sin desglosar todavía y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). Ninguno es una tarea atómica lista para tomar hoy.

**Se reactiva cuando alguno de los prerrequisitos externos de Bold/WhatsApp se resuelva, o cuando Google Calendar se desglose con el nivel de detalle de una tarea atómica.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) **completo y fusionado** — T1-T4 (Fase 1), T5 (PR #36), T6 (PR #37), T7 (PR #39) y T8 (PR #40) fusionadas (ver `MEMORY.md` §2). Tres hotfixes antes del paso a producción (vigencia/`finalizado`, `sillasTotales` editable, `cancelado` visible) **fusionados** (PR #41, ver `MEMORY.md` §2/§7/§9). Segunda ronda de hotfixes (correo, productores, mensaje de aprobación, doble envío, SLA de aforo) **fusionados** (PR #42, ver `MEMORY.md` §2/§7/§9) — Dominio personalizado, antes pausado aquí, ascendido a Tarea 1 activa el mismo día por ser un bloqueador real de lanzamiento (ver arriba). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. **Confirmado también en `production` (14/08/2026, auditoría pre-lanzamiento):** los 4 secretos por-ambiente existen en el entorno `production` de GitHub — `SES_REMITENTE` tenía un espacio al inicio, corregido con `gh secret set`.
- ✅ **`agora-usuarios-production` tenía al menos un `administrador` (14/08/2026, auditoría pre-lanzamiento) — estaba vacía, se agregó `ocastelblanco@gmail.com`.** Sin esto, nadie podía operar el sistema en producción pese a tener sesión válida (proyecto Firebase compartido, autorización de Ágora independiente, `CLAUDE.md` §5 A01).
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Wire-up en `deploy.yml` y en la Lambda que lo consume ya completado como parte de Emisión de boletas (PR #19, `MEMORY.md` §2) — bullet dejado como referencia histórica del secreto, no una tarea pendiente.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
