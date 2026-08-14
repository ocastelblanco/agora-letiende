# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (14/08/2026):** T7 (modelo de datos y formulario: selección de productores/porteros por evento) implementada, verificada (270 pruebas backend + 268 frontend) y **validada en vivo en staging por el usuario** ("Todo funciona bien") — **PR #39 abierto, pendiente de fusión humana**. A pedido explícito del usuario, esta recalculación se hizo **antes** de la fusión, mismo criterio ya usado en todas las tareas del plan hasta ahora (T1/PR #30, XLSX/PR #25, `etapaId`/PR #26, T5/PR #36, T6/PR #37). **T8 (Fase 4, segunda mitad — la última tarea del plan) pasa a ser la Tarea 1**, sin empezar todavía: aplica la autorización real que T7 solo dejó modelada (`porteros` existe en el código de esta rama, aunque `main` todavía no lo tenga hasta que el PR #39 se fusione).

**Nota sobre el slot 2, deliberadamente sin tarea por ahora:** no hay una segunda tarea del plan disponible en paralelo con T8 (es la última). El usuario ya definió explícitamente (12/08/2026) que Bold/WhatsApp/Google Calendar/Dominio personalizado quedan detrás de las 8 tareas del plan **mientras dure el plan** — no se rellena el slot con un ítem del roadmap v2 solo por mantener la cuenta de "2 tareas". El slot 2 se reactiva recién cuando T8 se fusione: ahí el plan completo queda agotado y la siguiente recalculación vuelve al roadmap normal (Dominio personalizado pausado en el Backlog, o v2).

---

## Tarea 1 — [FEATURE]: Autorización real por evento para venta en efectivo y validación en puerta

**Origen:** `docs/ajustes-pre-producción.md`, sección "Ajustes a la lógica de negocio → Limitación de alcance de productores y porteros" (mismo ajuste de negocio que T7) · `docs/plan-pre-produccion.md` Fase 4, T8 — segunda y última mitad, la mitad de aplicación/autorización real. Depende de T7 (PR #39, todavía sin fusionar): el campo `porteros` ya existe en el código de esta misma rama, así que la implementación puede empezar sin esperar el merge — pero el PR de esta tarea no debe fusionarse antes que el de T7.

**Alcance:**
- Generalizar `tieneAccesoAlEvento()` (`server/api/lib/autorizacion.ts:54-62`) para que, además de `administrador` (bypass, sin cambios) y `productor` (chequeo contra `productores`, sin cambios), también resuelva `portero` contra el nuevo campo `porteros`. Es la única función que ya centraliza esta pertenencia (`CLAUDE.md` §5, A01) — generalizarla ahí, nunca crear una segunda función paralela.
- Aplicar el chequeo en `server/api/handlers/ventas-efectivo.ts`: `exigirRol('portero')` ya existe; agregar `tieneAccesoAlEvento(eventoEncontrado, permisos)` justo después de `buscarEventoPublicadoPorSlug()` (el evento completo ya está resuelto en ese punto — sin lectura extra).
- Aplicar el chequeo en `server/api/handlers/boletas.ts` (`POST /api/boletas/:codigo/validar`, `exigirRol('portero')`). **Cuidado de rendimiento a evaluar y documentar explícitamente, no dejar implícito:** hoy esa ruta hace una única escritura condicional sin lectura previa en el camino feliz (`ConditionExpression: estado = 'valida' AND eventoId = :eventoId`) — la ruta más sensible a latencia del sistema (`PRD.md` §8, escaneo en ráfaga el día del evento). Agregar el chequeo de pertenencia exige una lectura del evento antes de esa escritura condicional; evaluar si el costo de esa lectura extra es aceptable frente al riesgo de seguridad de dejarlo sin chequear (probablemente sí) y dejar la decisión escrita en el código, no solo en este documento.
- Nuevo endpoint (o generalización de uno existente) que devuelva solo los eventos asignados al usuario autenticado según su rol (`portero` → por `porteros`; `productor` → por `productores`; `administrador` → todos). Candidato natural: generalizar `listarEventosPanel()` (`server/api/handlers/reportes.ts`), que ya hace exactamente esto para `productor`/`administrador` vía `tieneAccesoAlEvento` — no triplicar la lógica. Consumido por `SeleccionVentaEfectivoComponent` y `SeleccionPuertaComponent`, que hoy listan **todos** los eventos publicados sin filtrar (vía `EventosPublicosService`, sin ningún contexto de usuario ni `Authorization`) — cambian a un cliente autenticado. Evaluar si conviene que `GestionEventosComponent` (lista "Eventos" de T6) también migre a este mismo endpoint en vez de mantener su propio filtro vía `GET /api/eventos`.
- **El DoD debe incluir** actualizar `CLAUDE.md` §5 A01: la regla ya escrita ahí habla solo de "productor... la pertenencia se verifica contra el campo productores del evento" — generalizar la redacción para incluir portero/`porteros` una vez esto esté implementado (no antes: `CLAUDE.md` documenta reglas ya vigentes en el código, no un estado futuro).

**Archivos:** `server/api/lib/autorizacion.ts`/`.spec.ts`, `server/api/handlers/ventas-efectivo.ts`/`.spec.ts`, `server/api/handlers/boletas.ts`/`.spec.ts`, `server/api/handlers/reportes.ts`/`.spec.ts` (si se generaliza `listarEventosPanel`), `src/app/features/evento/venta-efectivo/seleccion-venta-efectivo.component.ts`/`.spec.ts`, `src/app/features/puerta/seleccion-puerta.component.ts`/`.spec.ts`, `CLAUDE.md` §5 A01.

**Riesgo:** es la tarea "más grande y más sensible en seguridad de las cuatro fases" del plan (palabras del propio `docs/plan-pre-produccion.md`) — toca autorización real sobre dos rutas de dinero/control de acceso físico. Verificación arquitectónica independiente recomendada antes de abrir el PR, mismo criterio ya usado en T5/T6. La decisión de rendimiento de `boletas.ts` (lectura extra sí/no) tiene consecuencia directa en el requisito de UX más estricto del producto (`PRD.md` §8) — no tomarla a la ligera.

**Dependencias:** T7 (PR #39) — necesita `porteros` en el modelo de `Evento`, ya presente en el código de esta rama. **No fusionar el PR de T8 antes que el de T7.**

**Definition of done:**
- [ ] `tieneAccesoAlEvento()` resuelve `portero` contra `porteros`, generalizada en el mismo punto central — sin una segunda función paralela
- [ ] `POST /api/ventas-efectivo` rechaza a un `portero` no asignado al evento (403), sin lectura extra (el evento ya se resuelve en el camino feliz)
- [ ] `POST /api/boletas/:codigo/validar` rechaza a un `portero` no asignado al evento — decisión de rendimiento (lectura extra antes de la escritura condicional) evaluada y documentada explícitamente en el código
- [ ] Endpoint de "mis eventos asignados" nuevo o generalizado (`listarEventosPanel` candidato), consumido por `SeleccionVentaEfectivoComponent`/`SeleccionPuertaComponent` en vez de la lista pública sin filtrar
- [ ] `CLAUDE.md` §5 A01 actualizado para reflejar la regla ya vigente (portero + `porteros`, no solo productor)
- [ ] `npm run test` y `npm run test:api` en verde
- [ ] `npm run build`/`build:api` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**, y sin fusionarse antes que el PR de T7

---

## Tarea 2 — sin asignar, T8 es la última tarea del plan

No hay una segunda tarea atómica disponible en paralelo con T8: es la última de las 8 tareas de `docs/plan-pre-produccion.md`. Ver la nota de la cabecera de este documento para el razonamiento completo de por qué este slot no se rellena con un ítem del roadmap v2 mientras tanto.

**Se reactiva con el primer ítem del roadmap normal (Dominio personalizado, pausado en el Backlog, o v2) en cuanto T8 se fusione — ahí el plan completo queda agotado.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar/Dominio personalizado mientras dure este plan. Fase 1 completa (T1-T4), T5 (PR #36) y T6 (PR #37) fusionadas (ver `MEMORY.md` §2). T7 (modelo de datos y formulario: productores/porteros) implementada, verificada y **validada en vivo por el usuario** — **PR #39 abierto**, pendiente de fusión humana. El motor JIT tiene ahora **T8 activa como Tarea 1** — la última tarea del plan; el slot de Tarea 2 queda deliberadamente sin tarea (ver nota de cabecera) hasta que T8 se fusione, momento en el que el plan completo queda agotado.

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
