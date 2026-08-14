# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (14/08/2026, continuación):** el usuario pidió directamente **tres hotfixes antes del paso a producción**, con prioridad explícita ("antes del paso a producción") por delante del roadmap normal — mismo criterio ya usado con `docs/plan-pre-produccion.md`. **Dominio personalizado vuelve a quedar pausado** en el Backlog (su especificación completa se preserva tal cual, sin resumir, para retomarla sin re-derivar nada); la Tarea 1 pasa a los tres hotfixes, implementados, verificados y documentados en esta misma sesión (320 pruebas backend + 270 frontend en verde, builds limpios) — **PR pendiente de abrir**. El slot de Tarea 2 sigue sin asignar (ver nota abajo).

**Nota sobre el slot 2, deliberadamente sin tarea por ahora:** de lo que queda en el roadmap tras `docs/plan-pre-produccion.md`, Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — están bloqueados por prerrequisitos externos no de código (llaves/alta de WABA, ver "Pendientes que no son de código" abajo), y Google Calendar (#22) — v2, Media prioridad — todavía no está desglosado a nivel de tarea atómica y tiene una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). El slot 2 se reactiva en cuanto uno de los dos deje de estar bloqueado, cuando Google Calendar se desglose, o cuando se retome Dominio personalizado.

---

## Tarea 1 — [HOTFIX]: Tres hotfixes antes del paso a producción

**Origen:** pedido directo del usuario (14/08/2026), con prioridad explícita ("Tres hotfixes antes del paso a producción") por delante del roadmap normal, incluida Dominio personalizado (pausada de vuelta en el Backlog).

**Alcance (los tres, en una sola tarea porque el usuario los pidió juntos y comparten un mismo mecanismo central):**

1. **Auto-finalización por vigencia.** Un evento debe pasar a `finalizado` — y dejar de ser visible en la Cartelera pública y en la venta en efectivo — cuando ya pasaron tanto la fecha del evento como la fecha límite de la última etapa de boletería. Decisión tomada con el usuario (`AskUserQuestion`, no un job programado): **cómputo en tiempo real** en cada lectura pública/intento de venta (`estadoEfectivo()`), sin infraestructura nueva — el campo `estado` se actualiza en DynamoDB como efecto secundario best-effort de esas mismas lecturas (`finalizarSiVencido()`), sin garantía de ser inmediato para un evento que nadie visita.
2. **`sillasTotales` editable por administrador, en todo momento.** Hoy el campo está deshabilitado en `EditarEventoComponent` con un helper text obsoleto ("todavía no existe el motor de aforo") — el motor de aforo sí existe desde hace varias tareas. Editarlo debe ajustar `sillasDisponibles` por la diferencia (preservando vendidas/reservadas intactas) y rechazar la edición si el nuevo total queda por debajo de lo ya vendido/reservado. Si el cambio le devuelve aforo positivo a un evento `agotado` (y no venció por vigencia, y el propio payload no trae ya un `estado` explícito), reactiva automáticamente a `publicado` — mismo criterio que la transición automática opuesta de `confirmarSillas()`.
3. **Un evento `cancelado` es visible en la Cartelera pública (con el banner correspondiente) mientras esté vigente** (misma definición de vigencia que el punto 1 — sigue vigente mientras la fecha del evento O el cierre de la última etapa no hayan pasado). Nunca permite ventas de ningún tipo, algo que ya garantizaba `estado === 'publicado'` exacto en `compras.ts`/`ventas-efectivo.ts` sin cambios adicionales.

**Decisiones tomadas con el usuario antes de implementar (`AskUserQuestion`):**
- Mecanismo de vigencia: cómputo en tiempo real, no una Lambda programada (primer cron de Ágora habría sido infraestructura nueva a justificar; se descartó).
- Un evento `cancelado` cuya vigencia termina pasa a `finalizado` igual que los demás (no se preserva `cancelado` para siempre).
- `sillasTotales`: ajustar `sillasDisponibles` por la diferencia, rechazar si el nuevo total baja de lo ya vendido/reservado.
- Reactivación automática `agotado` → `publicado` al recuperar aforo positivo: sí.

**Archivos:**
- `server/api/lib/vigencia-evento.ts`/`.spec.ts` (nuevo) — `estadoEfectivo()`, `haFinalizadoPorVigencia()`, `finalizarSiVencido()`.
- `server/api/handlers/eventos-publicos.ts`/`.spec.ts` — cartelera/detalle/sitemap filtran por vigencia real, no solo el `estado` persistido; `cancelado` se agrega a los estados consultados.
- `server/api/handlers/compras.ts`/`.spec.ts`, `server/api/handlers/ventas-efectivo.ts`/`.spec.ts` — bloquean la compra/venta si el evento venció por vigencia, antes del chequeo de etapa vigente (404 limpio, no el 409 de "sin etapa vigente"). `EventoParaCompra` gana el campo `fechaHora`.
- `server/api/handlers/eventos.ts`/`.spec.ts` — `actualizarEvento()` gana el bloque de `sillasTotales` (ajuste por delta, guarda optimista, reactivación automática); lectura del evento compartida entre los bloques de `etapas`/`sillasTotales` vía un cache local a la función.
- `serverless.yml` — `dynamodb:UpdateItem` agregado a `EventosPublicosLambdaRole` (antes solo `Query`), necesario para `finalizarSiVencido()`.
- `src/app/features/admin/gestion-eventos/editar-evento.component.ts`/`.html`/`.spec.ts` — `sillasTotales` deja de deshabilitarse siempre tras crear; solo se deshabilita para `productor`. Nuevo helper text.
- `src/app/core/models/evento.model.ts` — `DatosEditarEvento` gana `sillasTotales?: number`.
- `docs/tech-specs.md` §5.4 (puntos 5 y 6 nuevos), `docs/PRD.md` §5.1 y §9 — las tres reglas de negocio no estaban documentadas (la de `sillasTotales` sí estaba en `PRD.md` §9/`tech-specs.md` §5.4 punto 5, sin implementar hasta ahora).

**Definition of done:**
- [x] Un evento cuya vigencia terminó deja de aparecer en la Cartelera pública y no admite venta en efectivo ni compra en línea
- [x] Un evento `cancelado` aparece en la Cartelera pública (con banner) mientras esté vigente, nunca admite venta
- [x] `sillasTotales` editable por `administrador` en cualquier momento, ajustando `sillasDisponibles` por la diferencia
- [x] Rechaza reducir `sillasTotales` por debajo de lo ya vendido/reservado, con mensaje claro
- [x] Reactivación automática `agotado` → `publicado` si el nuevo aforo queda positivo (salvo `estado` explícito en el payload o evento ya vencido)
- [x] `npm run test` (270) y `npm run test:api` (320) en verde
- [x] `npm run build`/`build:api` sin errores
- [x] Auditoría de costos sin coincidencias nuevas (`grep` del patrón de `CLAUDE.md` §5-bis) — sin infraestructura nueva, solo un permiso IAM adicional sobre un recurso ya existente
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, sin candidato sin bloqueo externo

Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Google Calendar (#22) — v2, Media prioridad — sin desglosar todavía y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). Ninguno es una tarea atómica lista para tomar hoy.

**Se reactiva cuando alguno de los prerrequisitos externos de Bold/WhatsApp se resuelva, o cuando Google Calendar se desglose con el nivel de detalle de una tarea atómica.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) **completo y fusionado** — T1-T4 (Fase 1), T5 (PR #36), T6 (PR #37), T7 (PR #39) y T8 (PR #40) fusionadas (ver `MEMORY.md` §2). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

### Pausada, no eliminada — Dominio personalizado `agora.letiende.co`

A pedido de los tres hotfixes urgentes (14/08/2026): queda detrás de esa tarea. Especificación completa preservada tal cual, sin resumir, para retomarla sin re-derivar nada:

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
