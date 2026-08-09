# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (09/08/2026, madrugada):** Emisión de boletas con QR firmado (Tarea 2, roadmap #12) se completó, se probó (186 pruebas backend + 149 frontend), se validó en vivo en staging por el usuario ("todo funciona perfecto" — sin bugs nuevos encontrados esta vez) y **PR #19 fusionado**. Dominio personalizado (Tarea 1, roadmap #17 del roadmap técnico) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Emisión de boletas lo ocupa **Validación en puerta** (roadmap #13) — único ítem del backlog que dependía de esa tarea y ahora queda desbloqueado; implementada de punta a punta (193 pruebas backend + 163 frontend), sin PR todavía.

---

## Tarea 1 — [FEATURE]: Dominio personalizado `agora.letiende.co`

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

## Tarea 2 — [FEATURE]: Validación en puerta

**Origen:** `PRD.md` §5.5 (flujo de validación), CU-12/CU-13/CU-14 (boleta válida / ya usada / de otro evento) · `tech-specs.md` §11 ítem 13 (`features/puerta/`, `handlers/boletas.ts` con `@zxing/browser`), §5.5 ("Validación en puerta": una sola operación condicional, cuatro veredictos explícitos, nunca un error genérico), §5.1 (`POST /api/boletas/:codigo/validar`, `{ eventoId }`), §4.2 (ruta `/evento/:slug/puerta`, `GuardiaAuth` + rol ≥ portero) · `CLAUDE.md` §5 (A04 Regla 3: transición de estado condicional, distinguir "ya usada" con fecha/hora de "inexistente" y de "otro evento"; A09 auditoría) · `CLAUDE.md` §7 (gotcha: `getUserMedia` exige HTTPS y gesto explícito del usuario, mismo hallazgo que Babel documentó para el escaneo de ISBN)

**Alcance:** un `portero` (o rol superior) abre la pantalla de la puerta de un evento, escanea el QR de una boleta con la cámara del celular, y el sistema autoriza o rechaza el ingreso con una única escritura condicional — nunca lectura seguida de escritura. La respuesta siempre distingue explícitamente cuál de los cuatro veredictos ocurrió, para que el portero pueda decidir de pie, con una fila esperando (`PRD.md` §5.5): **`VALIDA`** (autoriza y marca `usada`), **`YA_USADA`** (con la fecha/hora del primer ingreso), **`OTRO_EVENTO`** (la boleta es de una función distinta) y **`NO_EXISTE`** (código inválido o inventado). A diferencia de `GET /api/boletas/:codigo` (público, que deliberadamente nunca distingue "firma inválida" de "no existe" para no dar pie a enumerar boletas), acá el llamador ya es personal autenticado escaneando una boleta real — distinguir los casos es un requisito de UX explícito de `tech-specs.md`/`CLAUDE.md`, no una filtración.

**Decisión de diseño, resuelta al implementar:** se eligió la opción (a) — nueva ruta pública-para-el-equipo `/puerta` (`SeleccionPuertaComponent`, `guardiaRol` mínimo `portero`, agregada a `secciones-navegacion.ts`) que lista los eventos publicados (reutilizando `EventosPublicosService.cargarEventos()`, ya existente — no se creó un endpoint nuevo) y enlaza a `/evento/:slug/puerta` por cada uno. `docs/DESIGN.md` no tenía un patrón de "selector de evento" ya pensado, así que se siguió el mismo patrón de lista de tarjetas que `ListaAprobacionesComponent`.

**Payload de `POST /api/boletas/:codigo/validar` (`{ eventoId }`):** el cliente (la pantalla de puerta, que ya sabe para qué evento está abierta) envía el `eventoId` esperado; el backend nunca infiere el evento del propio QR — lo compara contra el `eventoId` real de la boleta encontrada. Respuesta siempre `200` con un campo `veredicto` (nunca un código HTTP de error para un resultado de negocio esperado, mismo criterio que otros endpoints de este proyecto que devuelven distintos `estado` en `200`) — el frontend nunca debe tener que distinguir "petición falló" de "boleta inválida", son cosas distintas.

**Ya existe, se reutiliza sin recrear:**
- `server/api/handlers/boletas.ts`: ya existe desde Emisión de boletas (roadmap #12) con `GET /api/boletas/:codigo` — esta tarea le **agrega** `POST /api/boletas/:codigo/validar` al mismo archivo (ya definido en el roadmap técnico así), reutilizando `separarCodigo`/`verificarFirmaBoleta` sin recrearlos.
- `server/api/lib/autorizacion.ts`: `exigirRol('portero')` — mismo patrón que `aprobaciones.ts`/`eventos.ts`.
- `server/api/lib/firma-boletas.ts`: `verificarFirmaBoleta` — el escaneo de la cámara decodifica la misma URL que ya lleva `{boletaId}.{firma}`, la firma se verifica igual que en el `GET`.

**Archivos creados:**
- `src/app/features/puerta/puerta.component.ts` (+ `.html`, `.spec.ts`) — ruta protegida `/evento/:slug/puerta` (`guardiaRol`, mínimo `portero`), cámara vía `@zxing/browser`. El `<video>` vive fuera de los bloques `@if`/`@else` del template (siempre montado, solo se alterna su visibilidad) para no perder la referencia del stream al cambiar entre pantalla de "Escanear", overlay de veredicto y overlay de error de red. El acceso a la cámara se dispara **solo** desde el manejador de click del botón "Escanear"/"Escanear otra"/"Reintentar" — nunca automáticamente al cargar la página (`CLAUDE.md` §7). Pantalla de veredicto a pantalla completa y a color: `bg-tertiary` para `VALIDA`, `bg-danger` para los otros tres (`docs/DESIGN.md` §8, patrón ya prescrito ahí con ejemplo de HTML).
- `src/app/features/puerta/seleccion-puerta.component.ts` (+ `.html`, `.spec.ts`) — ruta protegida `/puerta` (`guardiaRol`, mínimo `portero`), selector de evento (ver decisión de diseño arriba).
- `src/app/core/api/validacion-puerta.service.ts` (+ `.spec.ts`) — autenticado (`Authorization`, mismo criterio que `AprobacionesService.cargarPendientes`), `validarBoleta(codigo, eventoId)` devuelve `null` (nunca lanza) ante error de red, distinto de los cuatro veredictos de negocio que siempre llegan en `200`.

**Archivos modificados:**
- `server/api/handlers/boletas.ts`: agregado `POST /api/boletas/:codigo/validar` — `UpdateCommand` condicional (`ConditionExpression: estado = 'valida' AND eventoId = :eventoId`, `SET estado = 'usada', ingresoEn = :ahora, ingresoPor = :correo`, `ReturnValues: 'ALL_NEW'` para devolver `numeroEnCompra` sin una lectura extra en el camino feliz). Si la condición falla, **una lectura posterior** (nunca previa) clasifica el motivo exacto — mismo patrón que `clasificarFalloReserva` de `aforo.ts`: si `boleta.eventoId !== eventoId` → `OTRO_EVENTO`; si no → `YA_USADA` (con `ingresoEn`); si la boleta no existe en absoluto → `NO_EXISTE`. Firma inválida o formato de código incorrecto → `NO_EXISTE` directo, sin tocar DynamoDB.
- `serverless.yml`: rol IAM de la función `boletas` gana `dynamodb:UpdateItem` sobre `agora-boletas` (antes solo `GetItem`) y `dynamodb:GetItem` sobre `agora-usuarios` (nuevo — `exigirRol` lo necesita; hasta ahora `boletas` era 100% pública, sin ninguna dependencia de `firebase-admin`) + variable de entorno `FIREBASE_SERVICE_ACCOUNT_AGORA`/`TABLA_USUARIOS` nuevas, y ruta `POST /api/boletas/{codigo}/validar`. Verificado el bundle con invocación directa (arranca correctamente con la nueva dependencia de `firebase-admin`, mismo tipo de verificación ya hecha para `aprobaciones.js`).
- `src/app/app.routes.ts`/`app.routes.server.ts`: `/puerta` y `/evento/:slug/puerta` (`RenderMode.Client`, dependen de la sesión de Firebase, mismo criterio que `/admin/*`).
- `shared/navegacion/secciones-navegacion.ts`: sección "Puerta" nueva, insertada justo después de "Cartelera" (no al final) para preservar el orden ascendente de rol del que depende `guardiaInvitado.findLast()` — mismo cuidado ya aplicado a "Aprobaciones" en la tarea anterior. Consecuencia intencional: un portero que inicia sesión ahora aterriza en `/puerta` en vez de `/`, su sección más específica.
- `package.json`/`package-lock.json`: `@zxing/browser` nuevo (`npm install`, nunca instalado con rangos sin bloquear).

**Qué hacer:**

1. Resolver el punto de diseño de "cómo llega el portero a `/evento/:slug/puerta`" (arriba) antes de escribir el componente.
2. `POST /api/boletas/:codigo/validar` en `handlers/boletas.ts`: escritura condicional única, clasificación de motivo con lectura posterior (nunca previa), los cuatro veredictos.
3. `PuertaComponent`: cámara disparada solo por gesto del usuario, pantalla de veredicto a color, mensaje explícito para cada uno de los cuatro casos (con la hora del primer ingreso en `YA_USADA`).
4. **Auditoría** (`CLAUDE.md` §5, A09): `ingresoEn`/`ingresoPor` son append-only — la propia `ConditionExpression` ya lo garantiza (una vez `usada`, ninguna escritura posterior puede pasar la condición `estado = 'valida'`).

**Definition of done:**
- [x] La validación es una única escritura condicional (`estado = 'valida' AND eventoId = :eventoId`) — nunca lectura seguida de escritura
- [x] La respuesta distingue explícitamente los cuatro veredictos (`VALIDA`/`YA_USADA` con fecha-hora/`OTRO_EVENTO`/`NO_EXISTE`) — nunca un mensaje genérico
- [x] El acceso a la cámara se solicita solo tras un gesto explícito del usuario (tap en "Escanear"), nunca automáticamente al cargar la página
- [x] Reutiliza `separarCodigo`/`verificarFirmaBoleta` de la tarea de Emisión de boletas — no los reimplementa
- [x] `npm run test:api` y `npm run test` en verde (193 backend + 163 frontend)
- [x] `npm run build` sin errores
- [x] Auditoría de costos sin coincidencias nuevas
- [x] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (PR #20)

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Venta en efectivo (depende de Emisión de boletas)
2. Panel de control básico

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use.
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Falta wire-up en `deploy.yml` y en la Lambda que lo consuma por primera vez, parte de la implementación de esta Tarea 2.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
