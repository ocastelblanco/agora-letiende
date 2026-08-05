# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (05/08/2026):** la Tarea 1 (gestión de usuarios) se completó — ver `MEMORY.md` §2, §4, §7 y §9. Queda como único slot activo la Tarea 1 renumerada (antes Tarea 2: CRUD de eventos). **El segundo slot queda deliberadamente vacío** — los siguientes ítems del roadmap técnico (`tech-specs.md` §11: #7 "Cartelera y página de evento", #8 "Motor de aforo", #15 "QR del evento para afiches") dependen todos de que el CRUD de eventos (#6) cierre primero; ninguno es independiente todavía. Se recalculan ambos slots en la próxima sesión, apenas cierre esta tarea.

---

## Tarea 1 — [FEATURE]: CRUD de eventos (administrador)

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
3. `serverless.yml`: función `eventos` con rol IAM propio (`dynamodb:PutItem`/`UpdateItem`/`GetItem`/`Scan` sobre `agora-eventos` exclusivamente — el `GetItem` es para el `agora-usuarios` que usa `exigirRol()`, revisar el `Resource` correcto por tabla —, `s3:PutObject` acotado al prefijo de activos del bucket `agora-activos-{stage}`, nunca `s3:*` ni `Resource: "*"`). Como `exigirRol()` depende de `verificar-token.ts` (`firebase-admin`), agregar esta función a la lista de `entradas` de `server/bundle-lambdas.mjs` y apuntar el `handler`/`package.patterns` al archivo bajo `dist-server-bundle/` (mismo patrón que `usuariosMe`/`usuarios` — nunca reconstruir a mano una lista de exclusiones de `node_modules/**`, ver el gotcha verificado en vivo en `MEMORY.md` §7).
4. `gestion-eventos.component.ts` / `editar-evento.component.ts`: protegidas con `guardiaRol` (`data: { rolMinimo: 'administrador' }`), mismo criterio de `RenderMode.Client` que `/admin/usuarios` (ver `app.routes.server.ts` y el gotcha en `MEMORY.md` §7). Formulario de etapas de boletería (`EtapaBoleteria[]`) con precios en formato `$45.000` (pipe `precio` ya existente, `shared/pipes/precio.pipe.ts`) — el precio se **muestra** formateado pero se **edita** y envía como entero COP, nunca como string.
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

Orden previsto una vez cerrada la Tarea 1 activa (`tech-specs.md` §11). El motor JIT solo tiene un slot activo en este momento — ver la nota de prioridad de selección arriba. No desglosar todavía: se convierten en tareas atómicas al promoverse.

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
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para la Tarea activa.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
