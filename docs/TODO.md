# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (06/08/2026):** la Tarea 1 (CRUD de eventos) se completó — ver `MEMORY.md` §2, §4, §7 y §9. Con eso cerrado, los ítems #7 (Cartelera pública) y #8 (Motor de aforo) del roadmap técnico (`tech-specs.md` §11) dejan de depender de nada más y son **independientes entre sí** — ambos ocupan los dos slots activos.

---

## Tarea 1 — [FEATURE]: Cartelera pública y página de evento

**Origen:** `PRD.md` §6 (v1), §8 (Open Graph) · `tech-specs.md` §11 ítem 7, §4.1, §4.2, §4.5, §5.1 · `CLAUDE.md` §5 (A03, A05)

**Archivos a crear:**
- `server/api/handlers/eventos-publicos.ts` (+ `.spec.ts`) — `GET /api/eventos-publicos`, `GET /api/eventos-publicos/:slug`
- `src/app/core/api/eventos-publicos.service.ts` (+ `.spec.ts`)
- `src/app/features/cartelera/cartelera.component.ts` — ruta `/`
- `src/app/features/evento/detalle-evento.component.ts` — ruta `/evento/:slug`
- `public/robots.txt`
- Ruta/handler de `sitemap.xml` dinámico (evaluar si vive en `eventos-publicos.ts` o en su propio handler — decidir al implementar)

**Qué hacer:**

1. `eventos-publicos.ts`: sin autenticación (público), **nunca** usa `exigirRol` ni toca `agora-usuarios`. `GET` lista solo eventos con `estado` en `['publicado', 'agotado']` — usar el GSI `estado-fechaHora-index` con `Query` (uno por cada estado visible), nunca `Scan` de toda la tabla. `GET /:slug` usa el GSI `slug-index` con `Query` (no `Scan`), y responde 404 si el evento no existe o su estado no es público. **Ambos excluyen `productores`** de la respuesta (son correos de personal interno, no dato público) — filtrar el ítem antes de responder, nunca confiar en que el frontend simplemente no los muestre.
2. `detalle-evento.component.ts`: `title`/`description`/Open Graph/Twitter Card completos vía el servicio `Meta` de Angular, más JSON-LD `schema.org/Event` inyectado en el `<head>` (`tech-specs.md` §4.5) — la vista previa de Open Graph es el canal real de difusión por WhatsApp/Instagram (`PRD.md` §8), así que se verifica por inspección del HTML servido por SSR real (`curl`), no solo visualmente en el navegador.
3. `public/robots.txt`: bloquea `/admin`, `/panel`, `/aprobar`, `/compra`, `/boleta` (rutas administrativas o de enlace mágico, nunca deben indexarse).
4. `sitemap.xml`: generado dinámicamente a partir de los eventos `publicado` (mismo criterio de visibilidad que el endpoint público).
5. `serverless.yml`: función `eventosPublicos` con rol IAM de **solo lectura** (`dynamodb:Query`) sobre `agora-eventos` exclusivamente — sin `Scan`, sin acceso a `agora-usuarios` (no hay `exigirRol` que lo necesite), sin `s3:*`. CORS abierto en estos endpoints está permitido (`CLAUDE.md` §5, A05: lectura pública, no mutación ni dato personal).
6. `app.routes.ts`: `/` y `/evento/:slug`. `app.routes.server.ts`: **`RenderMode.Server`**, no `Client` ni `Prerender` — el contenido cambia con cada evento nuevo/editado (nada que prerenderizar de antemano) y los rastreadores de Open Graph/WhatsApp necesitan HTML ya resuelto en la primera respuesta, no una app que hidrate en el navegador (a diferencia de `/admin/*`, que sí puede ser `Client` porque no depende de SEO ni de rastreadores).

**Definition of done:**
- [ ] `GET /api/eventos-publicos` y `GET /api/eventos-publicos/:slug` nunca exponen `productores`
- [ ] Ambos endpoints usan `Query` sobre un GSI, nunca `Scan` de toda la tabla
- [ ] Un evento en `borrador`, `finalizado` o `cancelado` no aparece en la lista pública ni resuelve por slug (404)
- [ ] `/evento/:slug` renderiza Open Graph + Twitter Card + JSON-LD verificable por `curl` contra el HTML de SSR real
- [ ] `robots.txt` bloquea `/admin`, `/panel`, `/aprobar`, `/compra`, `/boleta`
- [ ] Rol IAM de `eventosPublicos` limitado a `Query` sobre `agora-eventos`, sin `Scan` ni acceso a otra tabla
- [ ] `/` y `/evento/:slug` en `RenderMode.Server`
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Tarea 2 — [FEATURE]: Motor de aforo (reserva condicional, TTL, liberación por Streams)

**Origen:** `PRD.md` (control de sobreventa) · `tech-specs.md` §11 ítem 8, §5.2 (`agora-compras`), §5.4 (ciclo de vida completo, ya documentado paso a paso) · `CLAUDE.md` §5 (A04 — riesgo central de Ágora)

**Alcance de esta tarea:** solo las primitivas de aforo y su limpieza automática — **no** el flujo de compra en sí (`handlers/compras.ts`, roadmap #9, todavía no existe). `agora-compras` ya existe en `serverless.yml` con `TimeToLiveSpecification` en `expiraEn` y `StreamSpecification: NEW_AND_OLD_IMAGES` (creada en la Tarea de infraestructura base) — esta tarea no la vuelve a crear, solo la consume.

**Archivos a crear:**
- `server/api/services/aforo.ts` (+ `.spec.ts`) — `reservarSillas(eventoId, cantidad)`, `confirmarSillas(eventoId, cantidad)`, `liberarSillas(eventoId, cantidad)`
- `server/api/handlers/liberar-reservas.ts` (+ `.spec.ts`) — consumidor de DynamoDB Streams de `agora-compras`

**Qué hacer:**

1. `aforo.ts`, las tres funciones son envolturas delgadas sobre exactamente los tres `UpdateCommand` condicionales que documenta `tech-specs.md` §5.4 (pasos 1-3) — **transcribir esas `ConditionExpression` tal cual, no reinventarlas**:
   - `reservarSillas`: `SET sillasDisponibles = sillasDisponibles - :n, sillasReservadas = sillasReservadas + :n` con `ConditionExpression: sillasDisponibles >= :n AND estado = 'publicado'`. Si falla, propaga un error distinguible (aforo insuficiente vs. evento no publicado) para que el futuro `handlers/compras.ts` (roadmap #9) pueda responder 409 con un mensaje claro — no acá, pero la forma del error debe ya soportarlo.
   - `confirmarSillas`: `SET sillasReservadas = sillasReservadas - :n` con `ConditionExpression: sillasReservadas >= :n`. Si el aforo llega a 0, además transiciona `estado` a `agotado` en la misma escritura.
   - `liberarSillas`: `SET sillasDisponibles = sillasDisponibles + :n, sillasReservadas = sillasReservadas - :n` con `ConditionExpression: sillasReservadas >= :n` — la condición sobre `sillasReservadas` (no un simple "siempre sumar") es lo que hace la operación segura ante un evento de Stream entregado dos veces (*at-least-once*, nunca *exactly-once*).
2. `liberar-reservas.ts`: Lambda con `streamEnabled` sobre el Stream de `agora-compras`, filtra únicamente eventos `REMOVE` (borrado por TTL) cuyo `OLD image` tenía un estado que todavía retenía aforo reservado (`iniciada`, `esperando_comprobante`, `en_revision` — no `aprobada`/`rechazada`/`expirada`, que ya liberaron o confirmaron su aforo por otro camino), y llama `liberarSillas(eventoId, cantidad)`. Idempotente por diseño gracias a la `ConditionExpression` de `liberarSillas` — un reintento del mismo registro de Stream no vuelve a restar de `sillasReservadas` por debajo de lo real porque la condición fallaría.
3. `serverless.yml`: función `liberarReservas` con evento `stream` apuntando al `StreamArn` de `AgoraCompras` (`BatchSize` pequeño, ej. 10, y `StartingPosition: LATEST`), rol IAM propio (`dynamodb:UpdateItem` sobre `agora-eventos` exclusivamente — sin acceso a `agora-compras` más allá de lo que el trigger de Streams ya provee, sin `agora-usuarios`, sin `exigirRol`: esta Lambda nunca la invoca un humano). Agregar a `server/bundle-lambdas.mjs` **solo si** termina dependiendo de algo con árbol de dependencias pesado — de lo contrario, empaquetar como `salud` (patrón simple, sin bundle).

**Definition of done:**
- [ ] Las tres funciones de `aforo.ts` nunca leen el ítem del evento antes de escribir — toda modificación de aforo es una única escritura condicional
- [ ] `liberarSillas` es segura ante un mismo registro de Stream entregado más de una vez (probado explícitamente con una prueba que invoca la función dos veces con el mismo `eventoId`/`cantidad` y verifica que la segunda falla o no duplica el efecto)
- [ ] `liberar-reservas.ts` ignora eventos de Stream que no sean `REMOVE`, y los `REMOVE` cuyo estado previo ya no retenía aforo (`aprobada`/`rechazada`/`expirada`)
- [ ] Rol IAM de `liberarReservas` limitado a `dynamodb:UpdateItem` sobre `agora-eventos`, sin comodines
- [ ] `npm run test:api` en verde (con los registros de Stream simulados vía mocks, sin depender de Streams reales)
- [ ] `npm run build:api` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Compra y reserva de sillas (depende de Motor de aforo)
2. Carga de comprobante por enlace mágico
3. Aprobación del productor
4. Emisión de boletas con QR firmado
5. Validación en puerta
6. Venta en efectivo
7. QR del evento para afiches (depende de CRUD de eventos, ya cerrado — puede promoverse antes si conviene agruparlo con otra tarea de `eventos.ts`)
8. Panel de control básico
9. Dominio personalizado `agora.letiende.co`

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
