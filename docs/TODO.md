# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (24/08/2026, continuación):** **Eventos con boletería externa (roadmap #25) completa** — implementada de punta a punta (campo `Evento.administradoPorLeTiende`, vínculo externo tipado WhatsApp/Instagram/Web, ocultamiento de los campos de boletería administrada en el formulario y en `/evento/:slug`), con tres hallazgos reales corregidos antes de darla por cerrada: un hallazgo `HIGH` de revisión de código independiente (compras en curso huérfanas al desactivar boletería administrada, corregido con una guarda `409` antes de abrir el PR), un error de especificación del número de WhatsApp (9 dígitos especificados, 10 dígitos reales, corregido en backend/frontend/fixtures) y un bug real en vivo (`sillasTotales` oculto pero no deshabilitado bloqueaba el guardado del formulario en silencio tras la primera vez). Se agregó además la mejora de excluir estos eventos del selector compartido de Panel/Venta en efectivo/Puerta, ya que un evento externo nunca tiene aforo ni boletas propias que gestionar. 367 pruebas backend + 292 frontend en verde. Todo en el **PR #47, todavía sin fusionar** — el usuario confirmó que todo está correcto. **Motor JIT recalculado: ambos slots quedan vacíos, en pausa deliberada** — no porque el usuario haya pedido esperar retroalimentación (como en la pausa del 15/08/2026), sino porque, con Eventos con boletería externa cerrada, **no queda ningún ítem de v2 sin bloqueo externo** que pueda tomar su lugar (ver abajo).

---

## Tareas activas — ambos slots en pausa, sin candidato sin bloqueo externo

Los tres ítems de v2 que quedan pendientes están todos bloqueados por algo que no es código propio de Ágora:

- **Bold (#19)** — v2, Alta prioridad. Bloqueado por prerrequisito externo: activar (o confirmar activa) la cuenta Bold de Le Tiende y generar las llaves de acceso a su API. Sin esas llaves no hay nada que implementar contra una API real.
- **WhatsApp (#20)** — v2, Alta prioridad. Bloqueado por prerrequisito externo: alta de la WABA y Verificación de Negocio de Meta (trámite lento, con el requisito de un número que no esté en uso en la app de WhatsApp). Ver "Pendientes que no son de código" abajo.
- **Google Calendar (#22)** — v2, Media prioridad. Sin desglosar todavía en una tarea atómica, y con una decisión externa pendiente: confirmar que `letiende.co@gmail.com` es el calendario correcto a sincronizar y obtener acceso a esa cuenta.

Ninguno de los tres es una tarea que se pueda tomar hoy sin antes resolver algo fuera del código. **Se reactiva el motor JIT cuando ocurra cualquiera de estos tres eventos:** se resuelve el prerrequisito de Bold (llaves de API), se resuelve el prerrequisito de WhatsApp (WABA verificada), o el usuario pide desglosar Google Calendar en una tarea atómica pese a la decisión pendiente sobre el mecanismo de autenticación.

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) **completo y fusionado** — T1-T4 (Fase 1), T5 (PR #36), T6 (PR #37), T7 (PR #39) y T8 (PR #40) fusionadas (ver `MEMORY.md` §2). Tres hotfixes antes del paso a producción (vigencia/`finalizado`, `sillasTotales` editable, `cancelado` visible) **fusionados** (PR #41). Segunda ronda de hotfixes (correo, productores, mensaje de aprobación, doble envío, SLA de aforo) **fusionados** (PR #42). **Dominio personalizado `agora.letiende.co` fusionado y verificado en vivo (PR #43, ADR-013)** — roadmap #17 completo. **Boletería opcional (roadmap #24) implementada y validada en vivo en staging por el usuario (PR #46) — pendiente de fusionar.** **Eventos con boletería externa (roadmap #25) implementada y validada, PR #47 pendiente de fusionar.** De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

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
