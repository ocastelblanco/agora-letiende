# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (24/08/2026, continuación):** **Boletería opcional (roadmap #24) completa** — implementada, corregido un gap de infraestructura encontrado por el usuario en staging (`ComprasLambdaRole`/`environment` de la función `compras` sin `agora-boletas`, ver `MEMORY.md` §7), y **validada en vivo por el usuario**: adquisición en línea y en taquilla de un evento sin etapas emiten boletas de inmediato y el correo llega correctamente. Todo en el PR #46, **todavía sin fusionar** — motor JIT recalculado ya en anticipación de esa fusión: **Eventos con boletería externa** (roadmap #25) sube a Tarea 1. Tarea 2 queda sin candidato sin bloqueo (sin cambios respecto a la sesión anterior — ver abajo).

---

## Tarea 1 — Eventos con boletería externa — roadmap #25

Nuevo campo `Evento.administradoPorLeTiende: boolean` (default `true`). En `false`, el evento se anuncia en la Cartelera pero Ágora no vende ni controla su aforo: se ocultan Sillas totales, Máx. boletas, Plazo de comprobante, Medios de pago, Etapas, Productores y Porteros (Estado se mantiene visible y editable); en su lugar el administrador configura un vínculo externo tipado (WhatsApp `https://wa.me/57` + 9 dígitos, Instagram `https://www.instagram.com/` + hasta 30 caracteres `[A-Za-z0-9._]`, o Vínculo web `https://` + hasta 256 caracteres URL-encoded). En `/evento/:slug`, el botón de compra se reemplaza por "MÁS INFORMACIÓN:" + ícono según el tipo + el enlace completo.

**Archivos principales** (detalle completo en `tech-specs.md` §11 #25): `core/models/evento.model.ts` (`administradoPorLeTiende`, `TipoVinculo`, `VinculoExterno`), `server/api/handlers/eventos.ts` (`normalizarVinculoExterno`, validación por tipo en frontend y backend), `server/api/handlers/eventos-publicos.ts` (`aVistaPublica` expone los campos nuevos), `features/admin/gestion-eventos/editar-evento.component.ts`/`.html` (`mat-slide-toggle`, sección "Más información"), `features/evento/detalle-evento.component.ts`/`.html` (bloque "MÁS INFORMACIÓN:" con ícono SVG inline + enlace `target="_blank" rel="noopener"`).

**Se completa cuando:** build pasa, specs actualizadas, y se prueba manualmente un evento externo de punta a punta (toggle en el formulario, vínculo validado por tipo, visualización en `/evento/:slug`) en staging. **Antes de dar por buena la política IAM/`environment` de cualquier función tocada, listar explícitamente cada dependencia nueva que gane (`server/`/`lib/` compartidos incluidos) contra `serverless.yml`** — lección repetida por tercera vez en este proyecto, ver `MEMORY.md` §7 (24/08/2026).

---

## Tarea 2 — sin asignar, sin candidato sin bloqueo externo

Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Google Calendar (#22) — v2, Media prioridad — sin desglosar todavía y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). Ninguno es una tarea atómica lista para tomar hoy.

**Se reactiva cuando alguno de los prerrequisitos externos de Bold/WhatsApp se resuelva, cuando Google Calendar se desglose con el nivel de detalle de una tarea atómica, o cuando se fusione el PR #46 y libere un segundo candidato del backlog.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) **completo y fusionado** — T1-T4 (Fase 1), T5 (PR #36), T6 (PR #37), T7 (PR #39) y T8 (PR #40) fusionadas (ver `MEMORY.md` §2). Tres hotfixes antes del paso a producción (vigencia/`finalizado`, `sillasTotales` editable, `cancelado` visible) **fusionados** (PR #41). Segunda ronda de hotfixes (correo, productores, mensaje de aprobación, doble envío, SLA de aforo) **fusionados** (PR #42). **Dominio personalizado `agora.letiende.co` fusionado y verificado en vivo (PR #43, ADR-013)** — roadmap #17 completo. **Boletería opcional (roadmap #24) implementada y validada en vivo en staging por el usuario (PR #46) — pendiente de fusionar.** De v2 (roadmap #19-22, #25): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). Eventos con boletería externa (#25) es la Tarea 1 activa (ver arriba).

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

**Recordatorio activo (nuevo, 14/08/2026):** confirmar que el costo del dominio personalizado de producción (ADR-013, se verificó teóricamente en US$0 adicional) se sostiene en la factura real 48 horas después del despliegue del PR #43 (16/08/2026 o después) — mismo comando que arriba.
