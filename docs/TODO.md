# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (13/08/2026):** T5 (menú de dos niveles con rutas anidadas reales) implementada, probada por el usuario, **rediseñada a pedido suyo** (el segundo nivel pasó de vivir en el header a ser Angular Material Tabs en el cuerpo de cada grupo — `TaquillaComponent`/`MisEventosComponent`, `mat-tab-nav-bar`/`mat-tab-nav-panel`) y verificada en **2 rondas** de verificación arquitectónica independiente — **PR #36 abierto, validado en vivo por el usuario ("Perfecto, funciona bien"), pendiente de fusión humana**. De paso se encontró y corrigió un bug real no relacionado con el diseño: los redirects de las URLs viejas del menú (`/admin/eventos`, `/admin/usuarios`, etc.) rompían en el servidor SSR por una diferencia entre cómo `@angular/ssr` y el Router del navegador resuelven `redirectTo` relativo — ver `MEMORY.md` §7. A pedido explícito del usuario ("actualiza el motor JIT y la documentación, para que cuando yo fusione el PR, podemos continuar con la siguiente tarea"), esta recalculación se hizo **antes** de la fusión, mismo criterio ya usado varias veces en sesiones anteriores (T1/PR #30, XLSX/PR #25, `etapaId`/PR #26). T6 (el productor puede editar campos puntuales de sus propios eventos) pasa a ser la **Tarea 1**, sin empezar todavía.

**Nota sobre el slot 2, deliberadamente sin tarea del plan por ahora:** T7 y T8 (Fase 4) tienen dependencia dura y encadenada — T7 depende de T6 (comparte el mismo componente `EditarEventoComponent` y varios de los mismos campos del formulario), T8 depende de T7 — así que ninguna de las dos puede empezar antes de que T6 se fusione. Como el usuario ya definió explícitamente (12/08/2026) que Bold/WhatsApp/Google Calendar/Dominio personalizado quedan detrás de las 8 tareas del plan **mientras dure el plan**, no se rellena el slot con un ítem del roadmap v2 solo para mantener la cuenta de "2 tareas" — sería trabajo especulativo sobre una tarea que ya se sabe bloqueada. El slot 2 se reactiva con T7 en cuanto T6 se fusione a `main`.

---

## Tarea 1 — [FEATURE]: El productor puede editar campos puntuales de sus propios eventos

**Origen:** `docs/ajustes-pre-producción.md`, sección "Ajustes a la lógica de negocio → Aumento de alcance de productor" · `docs/plan-pre-produccion.md` Fase 3, T6.

**Alcance:** hoy `server/api/handlers/eventos.ts` exige `administrador` para **todo** el handler (un único `exigirRol` antes de despachar por método — GET, POST, PUT, DELETE, subida de activos y descarga de QR quedan todos detrás del mismo portón). Este ajuste requiere volverlo consciente de rol por sub-ruta:

- `GET /api/eventos` (listar): `administrador` ve todos (sin cambios); `productor` ve solo los eventos donde está en `productores` — mismo patrón ya establecido por `tieneAccesoAlEvento`/`listarEventosPanel()` (`reportes.ts`), no reinventarlo.
- `PUT /api/eventos/:eventoId`: `administrador` puede editar cualquier campo (sin cambios); `productor` **asignado al evento** (`tieneAccesoAlEvento`) puede editar únicamente: `maxBoletasPorCompra`, `plazoComprobanteMinutos`, `imagenKey`, `logotipoKey`. Cualquier otro campo en el payload de un productor debe rechazarse explícitamente (`CLAUDE.md` §5 A08 — nunca aceptar en silencio algo que no se valida), no ignorarse sin decir nada. El resto de campos los ve, pero de solo lectura en el frontend.
- `POST /api/eventos/:eventoId/activos/url-carga` (subida de imagen/logo): `administrador` o productor asignado — el productor ahora puede cambiar imagen/logo.
- `GET /api/eventos/:eventoId/qr`: `administrador` o productor asignado — "Descargar códigos QR" es un ítem explícito de los ajustes permitidos.
- `POST /api/eventos` (crear) y `DELETE /api/eventos/:eventoId`: siguen siendo **exclusivos de `administrador`**, sin cambios.

**Frontend:** `EditarEventoComponent`, ya bajo las rutas nuevas de T5 (`/mis-eventos/eventos/:id` para editar, accesible a `productor`+`administrador`; `/mis-eventos/eventos/nuevo` para crear, exclusivo de `administrador` — confirmar el `rolMinimo` real de cada entrada de ruta en `app.routes.ts` al implementar, ya que T5 las anidó bajo `MisEventosComponent`). El formulario debe:
- Deshabilitar (no ocultar del todo — el documento dice "los podrá ver, pero como solo lectura") todos los campos salvo los 4 permitidos, cuando el rol actual es `productor`.
- Enviar solo los campos permitidos en el `PUT` cuando el rol es `productor` (payload parcial — `actualizarEvento()` ya soporta actualizaciones parciales por campo, no hace falta cambiar eso).
- Ocultar el botón "Crear evento" de `GestionEventosComponent` (la lista, en `/mis-eventos/eventos`) para `productor` — el backend ya lo bloquearía, pero no debe ni aparecer la opción.

**Archivos:** `server/api/handlers/eventos.ts`/`.spec.ts`, `editar-evento.component.ts`/`.html`/`.spec.ts`, `gestion-eventos.component.ts`/`.html`/`.spec.ts`, `app.routes.ts` (las dos entradas de ruta nuevas/`nuevo` vs `:id`).

**Riesgo:** cambio de autorización real sobre el handler de eventos — cada sub-ruta debe verificarse individualmente contra la matriz de arriba (no un único `exigirRol` como hoy), y el frontend nunca debe confiar en su propio deshabilitado de campos como mecanismo de seguridad real (`CLAUDE.md` §5 A01, la autorización vive en el backend). **Verificación arquitectónica independiente recomendada antes de abrir el PR**, mismo criterio ya aplicado a T5 y a cambios de autorización previos.

**Definition of done:**
- [ ] `GET /api/eventos` filtra correctamente por rol (administrador ve todos, productor solo los suyos), verificado con test
- [ ] `PUT /api/eventos/:eventoId` rechaza explícitamente cualquier campo no permitido en el payload de un productor (no lo ignora en silencio), verificado con test
- [ ] `POST /api/eventos` y `DELETE /api/eventos/:eventoId` siguen exclusivos de `administrador`, verificado con test
- [ ] Subida de activos (`url-carga`) y descarga de QR accesibles a un productor asignado, verificado con test
- [ ] Ningún guard/chequeo de autorización existente quedó más permisivo de lo que era antes del cambio, salvo los 4 puntos explícitamente ampliados arriba
- [ ] `EditarEventoComponent` deshabilita (no oculta) los campos no editables por un productor
- [ ] `GestionEventosComponent` oculta "Crear evento" para productor
- [ ] `npm run test` y `npm run test:api` en verde
- [ ] `npm run build`/`build:api` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, bloqueada por dependencia dura sobre la Tarea 1

No hay una segunda tarea atómica del plan que se pueda trabajar en paralelo con la Tarea 1 en este momento: T7 (Fase 4, siguiente en `docs/plan-pre-produccion.md`) depende explícitamente de que T6 (Tarea 1 de arriba) esté fusionada — comparte `EditarEventoComponent` y varios de los mismos campos del formulario. T8 depende de T7. Ver la nota de la cabecera de este documento para el razonamiento completo de por qué este slot no se rellena con un ítem del roadmap v2 mientras tanto.

**Se reactiva automáticamente con T7 en cuanto la Tarea 1 (T6) se fusione a `main`.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar/Dominio personalizado mientras dure este plan. Fase 1 completa (T1-T4, ver `MEMORY.md` §2). T5 (menú de dos niveles) implementada y verificada — **PR #36 abierto, pendiente de fusión humana** (ver `MEMORY.md` §2). El motor JIT tiene ahora **T6 activa como Tarea 1**; el slot de Tarea 2 queda deliberadamente sin tarea del plan (ver nota de cabecera) hasta que T6 se fusione y desbloquee T7 — las siguientes recalculaciones seguirán sacando T7-T8 en orden, sin volver al roadmap v2 normal hasta agotar el plan.

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
