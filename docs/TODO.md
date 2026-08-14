# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (14/08/2026, continuación):** PR #41 (tres hotfixes de vigencia/`sillasTotales`/`cancelado`) **fusionado** — ver el resumen completo en `MEMORY.md` §2/§7/§9. El usuario pidió directamente **tres hotfixes nuevos antes del paso a producción**, otra vez por delante del roadmap normal: (1) nombre visible del remitente de correo (`Taquilla Le Tiende`), (2) los administradores también aparecen en el desplegable de Productores al crear/editar un evento, y (3) se reformula el mensaje de "compra ya resuelta" quitando un paréntesis sin destino real. **Dominio personalizado vuelve a quedar pausado** en el Backlog (especificación preservada tal cual); la Tarea 1 pasa a estos tres hotfixes, implementados y verificados en esta misma sesión (321 pruebas backend + 271 frontend en verde, builds limpios) — **PR pendiente de abrir**. El slot de Tarea 2 sigue sin asignar (ver nota abajo).

**Nota sobre el slot 2, deliberadamente sin tarea por ahora:** de lo que queda en el roadmap tras `docs/plan-pre-produccion.md`, Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — están bloqueados por prerrequisitos externos no de código (llaves/alta de WABA, ver "Pendientes que no son de código" abajo), y Google Calendar (#22) — v2, Media prioridad — todavía no está desglosado a nivel de tarea atómica y tiene una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). El slot 2 se reactiva en cuanto uno de los dos deje de estar bloqueado, cuando Google Calendar se desglose, o cuando se retome Dominio personalizado.

---

## Tarea 1 — [HOTFIX]: Tres hotfixes de correo, productores y mensaje de aprobación

**Origen:** pedido directo del usuario (14/08/2026, continuación), con prioridad explícita por delante del roadmap normal — mismo patrón ya usado con la ronda anterior de hotfixes (PR #41, fusionado). Dominio personalizado vuelve a pausarse en el Backlog.

**Alcance (los tres, en una sola tarea porque el usuario los pidió juntos):**

1. **Nombre visible del remitente de correo.** Los correos transaccionales mostraban el buzón crudo `taquilla@letiende.co` en vez de un nombre reconocible. `Source` de `SendEmailCommand` (SES) admite el formato RFC 5322 `"Nombre" <correo>` directamente — se agregó una constante `NOMBRE_REMITENTE = 'Taquilla Le Tiende'` en `server/api/services/correo-ses.ts`, sin tocar el secreto `SES_REMITENTE` (que sigue siendo solo la dirección).
2. **Administradores seleccionables como Productores.** El desplegable de "Productores" en `EditarEventoComponent` solo mostraba usuarios con `rol === 'productor'`, excluyendo a los administradores — que no podían quedar asignados a un evento puntual para recibir el correo `aviso_comprobante` ni aprobar/rechazar por el enlace mágico. `productoresDisponibles` ahora también incluye `rol === 'administrador'`. Sin cambios de autorización: `tieneAccesoAlEvento()` ya deja pasar a cualquier `administrador` sin mirar `productores` (bypass existente) — esto es solo una conveniencia de notificación. `porterosDisponibles` no cambia (fuera de alcance, el usuario solo pidió Productores).
3. **Mensaje de "compra ya resuelta" sin paréntesis extraño.** El texto `Esta compra ya fue resuelta por un productor del equipo (enlace de aprobación).` (mostrado a un segundo productor que visita el mismo enlace de aprobación tras otro ya haberla resuelto) tenía un paréntesis sin ningún destino real al que enlazar — decisión explícita con el usuario (`AskUserQuestion`): sin nada en `MEMORY.md` que indicara un destino concreto, se reformuló a texto plano simple, `RESUELTO_POR_ENLACE = 'otro miembro del equipo'`, en vez de inventar un enlace sin propósito claro.

**Decisión tomada con el usuario antes de implementar (`AskUserQuestion`):** para el punto 3, no inventar un destino de enlace sin evidencia en la documentación del proyecto — reformular el texto en su lugar.

**Archivos:**
- `server/api/services/correo-ses.ts`/`.spec.ts` — `NOMBRE_REMITENTE`, `Source` con formato RFC 5322.
- `src/app/features/admin/gestion-eventos/editar-evento.component.ts`/`.spec.ts` — `productoresDisponibles` incluye `administrador`.
- `server/api/handlers/aprobaciones.ts`/`.spec.ts` — `RESUELTO_POR_ENLACE` reformulado.
- `src/app/core/api/aprobaciones.service.spec.ts`, `src/app/features/aprobaciones/revisar-aprobacion.component.spec.ts` — texto de prueba actualizado al nuevo mensaje.

**Definition of done:**
- [x] El remitente de los correos muestra "Taquilla Le Tiende" en vez del buzón crudo
- [x] Un administrador aparece en el desplegable de Productores y, si se lo selecciona, recibe el correo de aviso de comprobante y puede aprobar/rechazar por el enlace
- [x] El mensaje de "compra ya resuelta" ya no tiene un paréntesis sin destino
- [x] `npm run test` (271) y `npm run test:api` (321) en verde
- [x] `npm run build`/`build:api` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, sin candidato sin bloqueo externo

Bold (#19) y WhatsApp (#20) — v2, Alta prioridad — bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Google Calendar (#22) — v2, Media prioridad — sin desglosar todavía y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar). Ninguno es una tarea atómica lista para tomar hoy.

**Se reactiva cuando alguno de los prerrequisitos externos de Bold/WhatsApp se resuelva, o cuando Google Calendar se desglose con el nivel de detalle de una tarea atómica.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) **completo y fusionado** — T1-T4 (Fase 1), T5 (PR #36), T6 (PR #37), T7 (PR #39) y T8 (PR #40) fusionadas (ver `MEMORY.md` §2). Tres hotfixes antes del paso a producción (vigencia/`finalizado`, `sillasTotales` editable, `cancelado` visible) **fusionados** (PR #41, ver `MEMORY.md` §2/§7/§9). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

### Pausada, no eliminada — Dominio personalizado `agora.letiende.co`

A pedido de la segunda ronda de hotfixes urgentes (14/08/2026): queda detrás de esa tarea, otra vez. Especificación completa preservada tal cual, sin resumir, para retomarla sin re-derivar nada:

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
