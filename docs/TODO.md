# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (10/08/2026):** el usuario validó el PR #22 (Panel de control básico) en vivo en staging — la propia prueba manual encontró un bug real de datos (compras aprobadas borradas por el TTL de `expiraEn`, ver `MEMORY.md` §7 y §9), corregido y consolidado en el mismo PR antes de fusionar — y confirmó la fusión. Panel de control básico (roadmap #16) pasa a completada (`MEMORY.md` §2). Con eso, el backlog explícito de v1 (`PRD.md` §6) queda vacío salvo Dominio personalizado (Tarea 1, sin cambios). De v2, Bold y WhatsApp son **Alta** prioridad pero siguen bloqueados por prerrequisitos externos no de código (verificación de negocio de Meta, llaves de Bold — sección "Pendientes que no son de código" abajo, ambos sin empezar). El slot libre lo ocupa **Exportación XLSX/PDF** (roadmap #21), el único ítem de v2 cuya única dependencia técnica (#16) ya está resuelta.

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

## Tarea 2 — [FEATURE]: Exportación de reportes en XLSX

**Origen:** `PRD.md` §5.6 (mismo párrafo del panel: "descargar la lista completa de boletas con datos del cliente, fecha y hora de compra, medio de pago, valor unitario, etapa de boletería, fecha y hora de ingreso al evento, y valor total"), `PRD.md` §6 roadmap v2 ("Exportación de reportes en XLSX y PDF", Media) · `tech-specs.md` §11 roadmap #21 (depende solo de #16, Panel de control básico, ya fusionado) · `tech-specs.md` §5.1 (`GET /api/eventos/:eventoId/reportes`, Productor del evento, "URL prefirmada del archivo XLSX/PDF", `?formato=xlsx|pdf`) · `CLAUDE.md` §5 (Datos personales: "las exportaciones del panel de control contienen datos personales: solo las descarga un productor del evento o el administrador, y el enlace de descarga es prefirmado y de vida corta")

**Alcance:** ampliar `server/api/handlers/reportes.ts` (ya existe, del Panel de control básico) con un endpoint que genera un archivo `.xlsx` con **una fila por boleta** del evento — no por compra — con las columnas que `PRD.md` §5.6 enumera explícitamente: nombre/teléfono/correo del cliente, fecha y hora de compra, medio de pago, valor unitario, etapa de boletería, fecha y hora de ingreso (si ya ingresó), y el total de la compra a la que pertenece. Solo lo descarga el productor del evento (o `administrador`) — mismo criterio de autorización que el resto de `reportes.ts`.

**Decisión de alcance resuelta al especificar, no una ambigüedad a resolver después:** `tech-specs.md` §5.1 documenta el endpoint aceptando `?formato=xlsx|pdf`, pero la tabla de stack (`CLAUDE.md` §2 / `tech-specs.md` §2) ya advertía "PDF por definir" — nunca se decidió una librería ni un diseño de PDF, a diferencia de XLSX (`xlsx` 0.18.x, ya en el stack documentado y **ya usado en producción por Babel** — mismo paquete, mismo patrón: `XLSX.utils.book_new()` + `json_to_sheet()` + `book_append_sheet()` + `XLSX.write(..., { type: 'base64', bookType: 'xlsx' })`, ver `~/Documents/LeTiende/letiende.co/babel/server/api/handlers/ventas.ts` línea ~459). Esta tarea implementa **solo** `?formato=xlsx`; `?formato=pdf` responde `501` explícito con un mensaje claro (mismo criterio ya usado con boletas gratuitas en `compras.ts`/`ventas-efectivo.ts`), no una implementación a medias. Corregir `tech-specs.md` §5.1 para reflejar que PDF sigue sin implementarse.

**Decisión de diseño a resolver explícitamente al implementar, no en abstracto:** `CLAUDE.md` §5 dice literalmente que el enlace de descarga debe ser "prefirmado y de vida corta" — a diferencia de cómo Babel lo resuelve (responde el archivo en base64 directo en el cuerpo de la Lambda, sin pasar por S3). Ágora no puede copiar ese patrón tal cual: el archivo contiene datos personales de clientes, y `CLAUDE.md` ya fija el mecanismo (URL prefirmada). Diseño sugerido, a confirmar con el código real de `comprobantes.ts`/`eventos.ts` en pantalla (mismo patrón de URL prefirmada ya usado dos veces): generar el `.xlsx` en memoria, subirlo a `BucketComprobantes` (ya privado, ya con Block Public Access) bajo un prefijo nuevo `reportes/{eventoId}/{uuid}.xlsx` (no crear un bucket nuevo — costo, `CLAUDE.md` §5-bis), y devolver una URL prefirmada de `GetObject` de vida corta (mismo `expiresIn: 900` que ya usan `aprobaciones.ts`/`comprobantes.ts`/`eventos.ts`). El objeto subido queda huérfano en S3 tras la descarga — evaluar si hace falta un `LifecycleConfiguration` de expiración corta sobre ese prefijo (`reportes/*`) para no acumular archivos temporales indefinidamente; verificar costo real de S3 con un TTL de ciclo de vida corto (ej. 1 día) antes de dar esto por gratis, mismo criterio de `CLAUDE.md` §5-bis.

**Riesgo de duplicación a resolver explícitamente al implementar:** la agregación de "boletas de un evento con sus datos de compra" ya existe parcialmente en `obtenerPanelEvento()` (mismo archivo, `reportes.ts`) — que ya hace `Query` a `agora-boletas` (`eventoId-estado-index`) y a `agora-compras` (`eventoId-creadaEn-index`, filtrando `estado = 'aprobada'`) y ya resuelve el evento por `eventoId` + `tieneAccesoAlEvento`. Este endpoint nuevo necesita el mismo par de `Query` pero **unidos por `compraId`** (cada boleta trae su `compraId`, cada compra trae `cliente`/`medioPago`/`creadaEn`/`montoTotal`) — evaluar si conviene extraer una función compartida `obtenerDatosCrudosDelEvento(eventoId)` que ambos endpoints reutilicen, en vez de repetir las mismas dos `Query` por segunda vez en el archivo. No decidir en abstracto — mirar el código real de `obtenerPanelEvento()` ya escrito antes de decidir.

**Ya existe, se reutiliza sin recrear:**
- `server/api/handlers/reportes.ts`: `exigirRol('productor')` + `tieneAccesoAlEvento` (vía `lib/autorizacion.ts`) — mismo patrón de autorización, no uno nuevo.
- `xlsx` no está instalado todavía en Ágora (`grep '"xlsx"' package.json` no encuentra nada) — sí en Babel, mismo paquete/versión a instalar (`^0.18.5`).
- Patrón de URL prefirmada de descarga ya establecido tres veces (`comprobantes.ts` para el comprobante, `aprobaciones.ts` para el mismo comprobante en revisión, `eventos.ts` para activos) — cuarto consumidor, no el primero.
- Frontend: botón de descarga ya tiene precedente (`EventosService.descargarQr()`, descarga autenticada por `blob` + header `Authorization` — aunque acá la URL ya viene prefirmada del backend, así que probablemente baste un `<a>`/`window.open` directo a la URL prefirmada, sin pasar por un segundo `fetch` autenticado; confirmar cuál aplica con el código real de `descargarQr()` en pantalla).

**Archivos a modificar:**
- `server/api/handlers/reportes.ts` (+ `.spec.ts`): nueva ruta `GET /api/eventos/:eventoId/reportes?formato=xlsx|pdf` dentro del mismo handler.
- `server/api/services/s3.ts` / `serverless.yml`: permiso `s3:PutObject` sobre `${BucketComprobantes.Arn}/reportes/*` en el rol IAM de la función `reportes` (hoy sin ningún permiso de S3 — ver `ReportesLambdaRole`).
- `package.json`: agregar `xlsx` (`^0.18.5`, mismo rango que Babel).
- `src/app/core/api/panel.service.ts` (+ `.spec.ts`): método `descargarReporte(eventoId)`.
- `src/app/features/panel/panel-evento.component.ts`/`.html` (+ `.spec.ts`): botón de descarga, visible junto al resto del resumen — sigue siendo una pantalla mayormente de solo lectura; esta es la primera acción que el panel dispara, pero no muta ningún estado del sistema (no aprueba, no vende, no valida), solo genera y descarga un archivo.
- `docs/tech-specs.md` §5.1: confirmar/corregir que `pdf` sigue sin implementar (ver decisión de alcance arriba).

**Qué hacer:**

1. Resolver el riesgo de duplicación (¿extraer `obtenerDatosCrudosDelEvento`?) con `obtenerPanelEvento()` real en pantalla.
2. Resolver el diseño de URL prefirmada (¿bucket/prefijo/lifecycle?) con `comprobantes.ts`/`eventos.ts` reales en pantalla.
3. `handlers/reportes.ts`: nueva función `generarReporteEvento()` — autorización → `Query` boletas + compras → unir por `compraId` → construir filas (una por boleta) → `XLSX.write()` → `PutObject` a S3 → `getSignedUrl` → responder `{ url }`. `?formato=pdf` → `501`.
4. Frontend: botón "Descargar reporte" en `PanelEventoComponent`, sin bloquear el resto de la pantalla si la generación falla (mensaje de error, no un componente roto).

**Definition of done:**
- [ ] `GET /api/eventos/:eventoId/reportes?formato=xlsx` responde solo a `exigirRol('productor')` **y** `tieneAccesoAlEvento` — nunca al rol a secas
- [ ] El archivo generado tiene una fila por boleta con las columnas exactas de `PRD.md` §5.6 (cliente, fecha/hora de compra, medio de pago, valor unitario, etapa, fecha/hora de ingreso, total de la compra)
- [ ] La descarga es siempre por URL prefirmada de vida corta (≤ 15 min) — nunca el archivo en el cuerpo de la respuesta ni una URL pública
- [ ] `?formato=pdf` responde `501` explícito, no una implementación a medias
- [ ] `docs/tech-specs.md` §5.1 refleja el estado real de `pdf` (no implementado)
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build`/`build:api` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas (incluida la evaluación de `LifecycleConfiguration` sobre `reportes/*` si aplica)
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. De v2 (roadmap #19-22), Exportación XLSX ya ocupa la Tarea 2. Quedan sin desglosar: Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo); Etapas de boletería con cierre automático y Google Calendar (#22) — Media prioridad, sin bloqueo externo conocido, candidatos naturales para la próxima recalculación del motor JIT. El bug de `etapaId` regenerado en cada `PUT` de evento (`MEMORY.md` §7, encontrado especificando el Panel) sigue como deuda técnica real sin tarea propia todavía — evaluar si conviene desglosarlo antes de seguir sumando funcionalidad que dependa de `evento.etapas`.

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
