# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Estado al cierre de sesión (13/08/2026):** T6 (el productor puede editar campos puntuales de sus propios eventos) implementada y verificada — **PR #37 abierto, pendiente de fusión humana**. Verificación arquitectónica independiente confirmó la matriz de permisos completa (18 celdas) sin fuga de autorización, y encontró un bug real de frontend (el `FormArray` de "Etapas de boletería" se re-habilitaba solo tras un `disable()` previo por culpa de `push()`) ya corregido con test de regresión. Además, ya con el PR abierto, el usuario probó "Crear evento" en vivo y reportó un segundo bug real: `/mis-eventos/eventos/nuevo` mostraba "No se encontró ese evento." en vez del formulario — causa raíz confirmada leyendo el código real de `@angular/router` (`RoutedComponentInputBinder`): al separar esa ruta de `eventos/:id`, se quedó sin ningún parámetro `:id` real, así que el Signal input `id` de `EditarEventoComponent` recibía `undefined` en vez de `'nuevo'`. Corregido como hotfix en la misma rama/PR (`data: { id: 'nuevo' }`), con test de `RouterTestingHarness` que reproduce el bug real antes de aplicar el fix — ver `MEMORY.md` §7. A pedido explícito del usuario, esta recalculación se hizo **antes** de la fusión, mismo criterio ya usado varias veces en sesiones anteriores (T1/PR #30, XLSX/PR #25, `etapaId`/PR #26, T5/PR #36). T7 (modelo de datos y formulario: selección de productores/porteros por evento) pasa a ser la **Tarea 1**, sin empezar todavía.

**Nota sobre el slot 2, deliberadamente sin tarea del plan por ahora:** T8 (Fase 4, segunda mitad) depende explícitamente de que T7 (Tarea 1 de arriba) esté fusionada — necesita el campo `porteros` que T7 agrega al modelo. Como el usuario ya definió explícitamente (12/08/2026) que Bold/WhatsApp/Google Calendar/Dominio personalizado quedan detrás de las 8 tareas del plan **mientras dure el plan**, no se rellena el slot con un ítem del roadmap v2 solo para mantener la cuenta de "2 tareas" — sería trabajo especulativo sobre una tarea que ya se sabe bloqueada. El slot 2 se reactiva con T8 en cuanto T7 se fusione a `main`.

---

## Tarea 1 — [FEATURE]: Modelo de datos y formulario — selección de productores/porteros por evento

**Origen:** `docs/ajustes-pre-producción.md`, sección "Ajustes a la lógica de negocio → Limitación de alcance de productores y porteros" · `docs/plan-pre-produccion.md` Fase 4, T7 (primera de dos partes — la segunda, T8, es la aplicación de autorización real, y depende de esta).

**Alcance:**
- Agregar `porteros: string[]` al modelo de `Evento` (backend `server/api/handlers/eventos.ts`, frontend `evento.model.ts`) — análogo exacto a `productores` hoy. Validación nueva `normalizarPorteros()`, mismo patrón que `normalizarProductores()` (arreglo de correos válidos).
- **Cambio de validación en creación:** hoy `crearEvento()` acepta `productores: []` (cero productores es válido). El documento de negocio exige **mínimo un productor obligatorio** para guardar el evento — actualizar `normalizarProductores`/la validación de `crearEvento()` para rechazar un arreglo vacío. `porteros` sigue siendo opcional (puede quedar vacío al crear).
- `EditarEventoComponent`: reemplazar el campo de texto libre `productoresTexto` (correos separados por coma) por un selector múltiple (`mat-select` con `multiple` — ya establecido en el proyecto por `GestionUsuariosComponent`, reutilizar el patrón en vez de introducir un componente de selección nuevo) alimentado por `GET /api/usuarios` filtrado a rol `productor`. Agregar un selector análogo para `porteros`, filtrado a rol `portero`. Ambos exclusivos de `administrador` en la UI — el `productor` los ve de solo lectura, consistente con el deshabilitado ya implementado en T6 (`esProductor()`, campos no permitidos deshabilitados en `precargarFormulario()`).
- "Los otros productores o porteros se podrán añadir luego, al editarlo" — confirma que el `PUT` de edición ya permite modificar estos arreglos (sin cambios de backend más allá de agregar `porteros` al conjunto de campos editables por `administrador` — **no** se agrega a `CAMPOS_EDITABLES_PRODUCTOR`, un productor sigue sin poder tocar ni `productores` ni `porteros`, T6).

**Archivos:** `server/api/handlers/eventos.ts`/`.spec.ts` (modelo + validación), `evento.model.ts`, `editar-evento.component.ts`/`.html`/`.spec.ts`.

**Riesgo:** cambio de modelo de datos (campo nuevo persistido) más un cambio de validación que puede romper la creación de eventos existente si `normalizarProductores` rechaza un arreglo vacío sin que el frontend lo anticipe — coordinar el mensaje de error visible con el nuevo requisito mínimo. No es todavía el cambio de autorización real (eso es T8) — este solo agrega el campo y el formulario; `porteros` no se usa para restringir nada aún.

**Definition of done:**
- [ ] `porteros: string[]` persistido en `agora-eventos`, validado con `normalizarPorteros()` (mismo rigor que `normalizarProductores`)
- [ ] `crearEvento()` rechaza `productores` vacío con un mensaje claro; `porteros` vacío sigue siendo válido
- [ ] `EditarEventoComponent`: selector múltiple de productores (filtrado a rol `productor`) y de porteros (filtrado a rol `portero`), ambos alimentados por `GET /api/usuarios`
- [ ] Ambos selectores deshabilitados (no ocultos) para `productor`, consistente con el resto de campos no editables de T6
- [ ] `PUT /api/eventos/:eventoId` permite modificar `productores`/`porteros` para `administrador` (sin cambios de alcance para `productor`, que sigue sin poder tocarlos)
- [ ] `npm run test` y `npm run test:api` en verde
- [ ] `npm run build`/`build:api` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — sin asignar, bloqueada por dependencia dura sobre la Tarea 1

No hay una segunda tarea atómica del plan que se pueda trabajar en paralelo con la Tarea 1 en este momento: T8 (Fase 4, segunda mitad) depende explícitamente de que T7 (Tarea 1 de arriba) esté fusionada — necesita el campo `porteros` que T7 agrega al modelo de `Evento`. Ver la nota de la cabecera de este documento para el razonamiento completo de por qué este slot no se rellena con un ítem del roadmap v2 mientras tanto.

**Se reactiva automáticamente con T8 en cuanto la Tarea 1 (T7) se fusione a `main`.**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar/Dominio personalizado mientras dure este plan. Fase 1 completa (T1-T4, ver `MEMORY.md` §2). T5 (menú de dos niveles, **PR #36 abierto**) y T6 (productor edita sus eventos, **PR #37 abierto**) implementadas y verificadas, ambas pendientes de fusión humana (ver `MEMORY.md` §2). El motor JIT tiene ahora **T7 activa como Tarea 1**; el slot de Tarea 2 queda deliberadamente sin tarea del plan (ver nota de cabecera) hasta que T7 se fusione y desbloquee T8 — la última tarea del plan.

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
