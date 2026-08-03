# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (02/08/2026, sesión de la tarde):** la Tarea 1 (frontend de autenticación) se completó — ver `MEMORY.md` §2, §4 y §9. Con esto, el roadmap #4 completo (`tech-specs.md` §11, "Autenticación y roles") queda cerrado en ambas mitades, lo que desbloquea simultáneamente los ítems #5 y #6, que solo dependían de él y son independientes entre sí: **Gestión de usuarios** y **CRUD de eventos**. Se promueven ambos a los dos slots activos.

---

## Tarea 1 — [FEATURE]: Gestión de usuarios (CRUD de `agora-usuarios`)

**Origen:** `PRD.md` §6 (v1) · `tech-specs.md` §11 ítem 5, §5.1, §4.2 · `CLAUDE.md` §5 (A01)

**Archivos a crear:**
- `server/api/handlers/usuarios.ts` (+ `usuarios.spec.ts`) — `GET/POST /api/usuarios`, `PUT/DELETE /api/usuarios/:email`
- `src/app/core/api/usuarios.service.ts` (+ `.spec.ts`)
- `src/app/features/admin/gestion-usuarios/gestion-usuarios.component.ts` (+ plantilla si supera 100 líneas)
- Ruta `/admin/usuarios` en `app.routes.ts`

**Qué hacer:**

1. `server/api/handlers/usuarios.ts`: los cuatro verbos (`tech-specs.md` §5.1) exigen `administrador` — reutiliza `verificar-token.ts` + `resolver-permisos.ts` de la Tarea 1 anterior, **nunca** vuelve a comparar roles a mano (`CLAUDE.md` §5, A01). `GET` lista con `Scan` acotado (tabla pequeña, sin GSI adicional — no hay campo de filtro que lo justifique todavía). `POST` crea con `PutCommand` + `ConditionExpression: attribute_not_exists(email)` (evita sobrescribir un usuario existente). `PUT`/`DELETE` sobre `:email`. **Salvaguarda obligatoria**: un administrador no puede degradarse su propio rol (`rol` en el payload de `PUT` distinto de `administrador` cuando `email === correo del token`) ni eliminarse a sí mismo (`DELETE` sobre su propio correo) — ambos casos devuelven `400` con un mensaje claro, nunca lo permiten silenciosamente. Sin esto, un único administrador que se equivoca puede dejar Ágora sin ningún administrador activo.
2. `serverless.yml`: función `usuarios` nueva, rol IAM propio con `dynamodb:Scan`, `GetItem`, `PutCommand`/`PutItem`, `UpdateItem`, `DeleteItem` acotados exclusivamente a `agora-usuarios` (mismo patrón que `UsuariosMeLambdaRole`, sin comodines de `Resource`). Reutiliza el mismo `package.patterns` con `node_modules/**` completo que ya se ajustó para `usuariosMe` (`firebase-admin`).
3. `src/app/core/api/usuarios.service.ts`: cliente HTTP con `ServicioAuth.usuarioActual()`/ID Token vía `getIdToken()` (mismo patrón de header `Authorization: Bearer` que `servicio-auth.ts` ya usa contra `/api/usuarios/me`). Expone `usuarios` como Signal y nunca lanza — ante cualquier error deja el Signal en `[]` y marca un Signal `error`.
4. `gestion-usuarios.component.ts`: tabla con Angular Material (`mat-table`), formulario de alta/edición. Contenedor `min-h-screen bg-surface`, `max-w-4xl`/`max-w-6xl` (panel de administración, `docs/DESIGN.md` §3). Protegida con `guardiaRol` (`data: { rolMinimo: 'administrador' }`) — la Tarea 1 anterior ya dejó el guard listo para usarse en una ruta real por primera vez.
5. `app.routes.ts`: agrega `/admin/usuarios` con `canActivate: [guardiaRol]` y `data: { rolMinimo: 'administrador' }`. Revisar si esta ruta necesita `RenderMode.Client` en `app.routes.server.ts` — la sesión de Firebase vive solo en el navegador (IndexedDB, sin cookie), así que cualquier ruta protegida por un guard que dependa de esa sesión **debe** ser `RenderMode.Client`, nunca `Server`/`Prerender` (gotcha nuevo verificado en Babel esta sesión, ver `MEMORY.md` §7 — en Babel, `RenderMode.Server` en una ruta con guard producía un bucle de redirección a `/login` incluso con sesión real activa, porque el guard se evaluaba en el Lambda SSR sin acceso a esa sesión).

**Definition of done:**
- [ ] Los cuatro endpoints exigen `administrador`, verificado siempre en el backend (nunca solo por el guard del frontend)
- [ ] Un administrador no puede degradar su propio rol ni eliminarse a sí mismo (400, mensaje claro)
- [ ] Rol IAM de `usuarios` limitado a las acciones DynamoDB necesarias sobre `agora-usuarios` exclusivamente
- [ ] `/admin/usuarios` en `RenderMode.Client` si depende de `guardiaRol`
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos (`grep -nE "PROVISIONED|..."` de `CLAUDE.md`) sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (`CLAUDE.md` §6)

---

## Tarea 2 — [FEATURE]: CRUD de eventos (administrador)

**Origen:** `PRD.md` §6 (v1) · `tech-specs.md` §11 ítem 6, §5.1, §5.2, §4.2, §4.3 · `CLAUDE.md` §5 (A01, A08, A10)

**Archivos a crear:**
- `server/api/handlers/eventos.ts` (+ `.spec.ts`) — `GET/POST /api/eventos`, `PUT /api/eventos/:eventoId`, `POST /api/eventos/:eventoId/activos/url-carga`
- `src/app/core/api/eventos.service.ts` (+ `.spec.ts`)
- `src/app/core/models/evento.model.ts` (tipos `Evento`, `EtapaBoleteria`, `EstadoEvento` — espejo de `tech-specs.md` §4.3, igual que `usuario.model.ts`)
- `src/app/features/admin/gestion-eventos/gestion-eventos.component.ts` (lista) y `editar-evento.component.ts` (alta/edición)
- Rutas `/admin/eventos` y `/admin/eventos/:id`

**Qué hacer:**

1. `server/api/handlers/eventos.ts`: `GET`/`POST`/`PUT` exigen `administrador` (`tech-specs.md` §5.1). `POST` genera `eventoId` en el backend (`crypto.randomUUID()`, nunca lo acepta del cliente) e inicializa `sillasDisponibles = sillasTotales` en la misma escritura. `PUT` es edición parcial — nunca acepta ni recalcula `sillasDisponibles` desde el payload del cliente (eso es del motor de aforo, roadmap #8, todavía no existe; hasta entonces el campo se edita solo internamente, nunca vía este endpoint).
2. `server/api/handlers/eventos.ts` (activos): `POST /api/eventos/:eventoId/activos/url-carga` devuelve una **URL prefirmada de S3** (`agora-activos-{stage}`) acotada por `Content-Length` y tipo MIME (`image/jpeg`, `image/png`, `image/webp` — nunca SVG, mismo criterio que comprobantes en `CLAUDE.md` §5, A08). **Prohibido aceptar una URL de imagen arbitraria y descargarla desde el servidor** (A10, SSRF) — el cliente sube directo a S3 con la URL prefirmada, el backend nunca hace la petición saliente.
3. `serverless.yml`: función `eventos` con rol IAM propio (`dynamodb:PutItem`/`UpdateItem`/`GetItem`/`Scan` sobre `agora-eventos` exclusivamente, `s3:PutObject` acotado al prefijo de activos del bucket `agora-activos-{stage}`, nunca `s3:*` ni `Resource: "*"`).
4. `gestion-eventos.component.ts` / `editar-evento.component.ts`: protegidas con `guardiaRol` (`data: { rolMinimo: 'administrador' }`), mismo criterio de `RenderMode.Client` que la Tarea 1 de esta sesión. Formulario de etapas de boletería (`EtapaBoleteria[]`) con precios en formato `$45.000` (pipe `precio` ya existente, `shared/pipes/precio.pipe.ts`) — el precio se **muestra** formateado pero se **edita** y envía como entero COP, nunca como string.
5. `app.routes.ts`: `/admin/eventos` y `/admin/eventos/:id`.

**Definition of done:**
- [ ] `eventoId` siempre generado en el backend, nunca aceptado del cliente
- [ ] `sillasDisponibles` nunca se acepta ni se recalcula desde el payload del cliente en este endpoint
- [ ] URL de imagen de evento siempre prefirmada de S3 — sin descarga de URL arbitraria en el backend (A10)
- [ ] Rol IAM de `eventos` limitado a `agora-eventos` y al prefijo de activos de `agora-activos-{stage}`, sin comodines
- [ ] `/admin/eventos` y `/admin/eventos/:id` en `RenderMode.Client`
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Cartelera pública y página de evento (SEO/Open Graph/JSON-LD)
2. Motor de aforo (reserva condicional, TTL, liberación por Streams)
3. Compra y reserva de sillas
4. Carga de comprobante por enlace mágico
5. Aprobación del productor
6. Emisión de boletas con QR firmado
7. Validación en puerta
8. Venta en efectivo
9. QR del evento para afiches
10. Panel de control básico
11. Dominio personalizado `agora.letiende.co`

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para las Tareas activas.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
