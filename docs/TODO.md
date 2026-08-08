# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (08/08/2026):** Compra y reserva de sillas (Tarea 2, roadmap #9) se completó, se probó (118 pruebas backend + 115 frontend) y se fusionó (PR #16) — ver `MEMORY.md` §2 y §9. Dominio personalizado (Tarea 1, roadmap #17) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Compra y reserva lo ocupa **Carga de comprobante por enlace mágico** (roadmap #10) — es el único ítem del backlog que dependía de esa tarea y ahora queda desbloqueado; el resto del backlog (aprobación, emisión, puerta, efectivo) depende en cadena de esta.

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

## Tarea 2 — [FEATURE]: Carga de comprobante por enlace mágico

**Origen:** `PRD.md` §5.3 (flujo completo), CU-05/CU-06 · `tech-specs.md` §11 ítem 10, §5.1 (`POST /api/comprobantes/:token/url-carga`, `POST /api/comprobantes/:token/confirmar`), §5.6 (`services/notificaciones.ts`, ya existe), §8.2 (enlaces mágicos, ya existe) · `CLAUDE.md` §5 (A02 S3 privado, A07 enlaces mágicos, A08 magic bytes)

**Alcance:** la página que el cliente abre desde el correo de "Compra y reserva de sillas" (roadmap #9, ya completo) para subir su comprobante de pago, y el consumo del token que transiciona la compra a `en_revision` y avisa al productor. **No incluye** la aprobación en sí (`handlers/aprobaciones.ts`, roadmap #11) — esta tarea termina cuando el comprobante queda cargado y la compra en revisión, sin decidir si se aprueba o se rechaza.

**Ya existe, se reutiliza sin recrear:**
- `server/api/lib/enlaces-magicos.ts`: `hashearToken(token)` — esta tarea lo usa para *consumir* el token (buscarlo por `tokenComprobanteHash-index`), no lo recrea (se adelantó en la Tarea 2 anterior, ver `MEMORY.md` §9).
- `server/api/services/notificaciones.ts`/`correo-ses.ts`: agregar la plantilla `aviso_comprobante` (productor) — la interfaz `CanalNotificacion` y `CanalCorreoSes` ya existen, solo se suma un caso al `switch` de plantillas.
- `BucketComprobantes` en `serverless.yml`: ya existe, privado con Block Public Access + SSE-S3 — **le falta `CorsConfiguration`** (mismo gotcha ya resuelto para `BucketActivos`, `MEMORY.md` §7: sin CORS, el navegador bloquea el `PUT` directo a la URL prefirmada con un preflight fallido) — agregarlo es parte de esta tarea, no un descubrimiento nuevo.

**Archivos a crear:**
- `server/api/handlers/comprobantes.ts` (+ `.spec.ts`) — `POST /api/comprobantes/:token/url-carga`, `POST /api/comprobantes/:token/confirmar`.
- `src/app/core/api/comprobantes.service.ts` (+ `.spec.ts`) — cliente público (sin `Authorization`, el token en la URL es la única credencial).
- `src/app/features/evento/comprobante/comprobante.component.ts` (+ `.html`, `.spec.ts`) — página en `/comprobante/:token` con el selector de archivo.

**Archivos a modificar:**
- `serverless.yml`: `CorsConfiguration` en `BucketComprobantes`; función `comprobantes` nueva con rol IAM propio (`dynamodb:Query` en `agora-compras` vía `tokenComprobanteHash-index`, `dynamodb:UpdateItem` condicional en `agora-compras` para la transición de estado, `dynamodb:GetItem` en `agora-eventos` para resolver los `productores` a notificar, `s3:PutObject`/`s3:GetObject` acotados al prefijo del comprobante, `ses:SendEmail` acotado a la identidad `letiende.co`).
- `server/bundle-lambdas.mjs`: agregar `comprobantes.js`.
- `src/app/app.routes.ts`/`app.routes.server.ts`: ruta `comprobante/:token` (`RenderMode.Client`, mismo criterio que `/evento/:slug/comprar`).

**Qué hacer:**

1. **Validar el token antes de cualquier operación** (`CLAUDE.md` §5, A07): hashear el `token` de la ruta con `hashearToken()`, buscarlo por `tokenComprobanteHash-index`. Si no existe, si `expiraEn` ya pasó (tratar como expirado aunque el TTL no haya borrado el ítem, mismo criterio que `compras.ts`), o si `estado !== 'esperando_comprobante'` (ya se consumió — un enlace mágico es de un solo uso), responder con un mensaje distinguible en cada caso — no un 404 genérico que deje al cliente sin saber si su enlace ya venció o si ya lo usó.
2. `POST /api/comprobantes/:token/url-carga`: valida `tipoMime` (`image/jpeg`/`image/png`/`image/webp`/`application/pdf` — **nunca SVG**, `CLAUDE.md` §5 A08) y `tamano` (≤ 10 MB, mismo tope que activos de evento). Devuelve una URL prefirmada de `PutObject` sobre `BucketComprobantes`, key `compras/{compraId}/comprobante-{uuid}.{ext}`, `expiresIn` corto (900s, mismo criterio que activos de evento). El cliente sube directo a S3 con esa URL — el backend nunca descarga el archivo (A10).
3. `POST /api/comprobantes/:token/confirmar`: **el tipo real del archivo se verifica leyendo sus magic bytes desde S3** (`GetObjectCommand`, primeros bytes), nunca confiando en el `Content-Type` que el cliente declaró en el paso anterior (`CLAUDE.md` §5, A08 — "el tipo se verifica en el backend por los magic bytes del archivo, no por la extensión ni por el Content-Type declarado"). Si no coincide con ninguna firma válida (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WEBP `RIFF....WEBP`, PDF `%PDF`), se borra el objeto de S3 y se responde 400 sin transicionar la compra. Si coincide, transiciona `estado: 'esperando_comprobante' → 'en_revision'` con `ConditionExpression` (consumo de un solo uso del enlace, `CLAUDE.md` §5 A07) y notifica a cada correo en `evento.productores` con la plantilla `aviso_comprobante` — best-effort, mismo criterio que el correo de `compras.ts`.
4. Frontend: página mínima — selector de archivo, subida con progreso simple, confirmación. Sin mostrar datos de la compra más allá de lo que el propio flujo ya expone (`tech-specs.md` §5.1 no define un `GET` para este token — no inventar uno fuera de lo especificado).

**Definition of done:**
- [x] El token se hashea con la misma derivación que `compras.ts` generó (`hashearToken`, reutilizado, no reimplementado)
- [x] Un token ya usado, vencido o inexistente responde con un mensaje distinguible en cada caso (`404`/`410`/`409`), no un 404 genérico
- [x] El tipo de archivo se verifica por magic bytes leídos de S3 (`Range: bytes=0-11`), nunca por `Content-Type` declarado ni por extensión — SVG rechazado siempre (probado explícitamente con una cabecera SVG que no coincide con ninguna firma binaria)
- [x] La transición `esperando_comprobante → en_revision` es una única escritura condicional (consumo de un solo uso), nunca lectura-luego-escritura
- [x] `BucketComprobantes` tiene `CorsConfiguration` para el `PUT` directo del navegador
- [x] El productor (o cada productor, si son varios) recibe la notificación de comprobante por revisar (plantilla `aviso_comprobante`, best-effort)
- [x] `npm run test:api` y `npm run test` en verde (137 pruebas backend + 124 frontend)
- [x] `npm run build` sin errores
- [x] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (implementación lista en `claude/tarea-1-mobile-feasibility-044k5v`; PR pendiente de solicitud explícita del usuario)

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Aprobación del productor (depende de Carga de comprobante)
2. Emisión de boletas con QR firmado
3. Validación en puerta
4. Venta en efectivo
5. Panel de control básico

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para las tareas activas.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
