# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (07/08/2026):** la Tarea 1 (Menú de navegación) se completó y se validó en vivo en staging por el usuario — ver `MEMORY.md` §2, §7 y §9 (incluye dos bugs reales de CSS de Angular Material encontrados y corregidos, no relacionados con el menú en sí). Motor de aforo (Tarea 2, roadmap #8) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Menú de navegación lo ocupa **QR del evento para afiches** (roadmap #15) — es el único ítem del backlog que no depende de Motor de aforo (depende solo de #6, CRUD de eventos, ya completo) y estaba explícitamente marcado como promovible ("puede promoverse antes si conviene agruparlo con otra tarea de `eventos.ts`").

---

## Tarea 1 — [FEATURE]: QR del evento para afiches

**Origen:** `PRD.md` línea 104 ("Al crear el evento, el sistema genera automáticamente un código QR con el enlace del evento, descargable en formato vectorial y de imagen, para imprimir en afiches y volantes"), CU-02/CU-03 (líneas 271-272) · `tech-specs.md` §11 ítem 15 (depende solo de #6, CRUD de eventos, ya completo) · `CLAUDE.md` §5 (A08 — el `slug` codificado en el QR se lee siempre de la base de datos, nunca de un payload)

**Alcance:** el QR codifica la URL pública del evento (`https://agora.letiende.co/evento/{slug}`, la misma página que ya sirve Cartelera pública) — es un QR de *marketing* para imprimir, sin firma ni validación en puerta. No confundir con el QR de la boleta digital (roadmap #12, HMAC firmado, todavía no existe). Se genera **bajo demanda**, sin almacenarse en DynamoDB ni S3 — regenerarlo es barato y evita gestionar un activo más.

**Archivos a crear:**
- `server/api/services/qr.ts` (+ `.spec.ts`) — `generarQrSvg(url: string): Promise<string>`, `generarQrPng(url: string): Promise<Buffer>`, usando el paquete `qrcode` (nueva dependencia).

**Archivos a modificar:**
- `server/api/handlers/eventos.ts`: nueva subruta `GET /api/eventos/:eventoId/qr?formato=svg|png` (default `svg`), dentro del mismo handler que ya despacha por `rawPath`/método — exclusiva de `administrador` (ya pasa por `exigirRol` al inicio del handler, sin cambios ahí). Lee el evento real de DynamoDB para tomar su `slug` — el QR nunca codifica un slug u otro dato que llegue en la URL o el payload de la petición. Responde con `Content-Type: image/svg+xml` o `image/png` según `formato`, y `Content-Disposition: attachment; filename="qr-{slug}.{svg|png}"` para que el navegador lo descargue directo en vez de intentar mostrarlo inline.
- `serverless.yml`: sin función nueva — vive en la Lambda `eventos` ya existente, mismo rol IAM (no necesita ningún permiso adicional, no toca DynamoDB más allá de la lectura que ya hacía, no toca S3). Si `qrcode` termina con un árbol de dependencias transitivas grande, se empaqueta igual que el resto de `eventos.ts` (ya pasa por esbuild en `server/bundle-lambdas.mjs` por depender de `firebase-admin` vía `exigirRol`) — no hace falta ningún cambio ahí, ya está cubierto.
- `src/app/features/admin/gestion-eventos/editar-evento.component.ts`/`.html`: en modo edición (evento ya creado, mismo criterio que ya deshabilita `slug`/`sillasTotales` y habilita la subida de activos), agregar dos botones "Descargar QR (SVG)"/"Descargar QR (PNG)". Como es una descarga con autenticación, **no un `<a href>` plano** (no puede llevar el header `Authorization`) — usar `HttpClient` con `responseType: 'blob'`, más un `<a>` temporal + `URL.createObjectURL()` para disparar la descarga, mismo patrón que cualquier endpoint protegido que devuelve un archivo.
- `src/app/core/api/eventos.service.ts` (+ `.spec.ts`): método nuevo `descargarQr(eventoId, formato)` que encapsula esa llamada `blob` + `Authorization` header (reutiliza `servicioAuth.obtenerIdToken()`, mismo patrón que el resto del servicio).

**Definition of done:**
- [ ] El QR codifica exactamente `https://agora.letiende.co/evento/{slug}` del evento real, leído de DynamoDB — nunca un slug recibido en la petición
- [ ] Ambos formatos (SVG y PNG) descargables desde `EditarEventoComponent` en modo edición
- [ ] Endpoint exclusivo de `administrador` (reutiliza `exigirRol`, sin nueva lógica de autorización)
- [ ] Sin almacenamiento persistente nuevo — ni tabla, ni atributo, ni bucket S3
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
3. `serverless.yml`: función `liberarReservas` con evento `stream` apuntando al `StreamArn` de `AgoraCompras` (`BatchSize` pequeño, ej. 10, y `StartingPosition: LATEST`), rol IAM propio (`dynamodb:UpdateItem` sobre `agora-eventos` exclusivamente — sin acceso a `agora-compras` más allá de lo que el trigger de Streams ya provee, sin `agora-usuarios`, sin `exigirRol`: esta Lambda nunca la invoca un humano). **Empaquetar siempre con esbuild (`server/bundle-lambdas.mjs`), nunca "simple" como `salud`** — `aforo.ts` importa `documentoDynamoDB` (`@aws-sdk/lib-dynamodb`), y eso ya es suficiente para que la Lambda se caiga al arrancar si el paquete excluye `node_modules` (bug real encontrado en staging el 07/08/2026 con `eventosPublicos`, mismo motivo exacto — ver `MEMORY.md` §7). El criterio nunca fue "¿usa `firebase-admin`?", es "¿importa algo de `node_modules` en tiempo de ejecución?".

**Definition of done:**
- [ ] Las tres funciones de `aforo.ts` nunca leen el ítem del evento antes de escribir — toda modificación de aforo es una única escritura condicional
- [ ] `liberarSillas` es segura ante un mismo registro de Stream entregado más de una vez (probado explícitamente con una prueba que invoca la función dos veces con el mismo `eventoId`/`cantidad` y verifica que la segunda falla o no duplica el efecto)
- [ ] `liberar-reservas.ts` ignora eventos de Stream que no sean `REMOVE`, y los `REMOVE` cuyo estado previo ya no retenía aforo (`aprobada`/`rechazada`/`expirada`)
- [ ] Rol IAM de `liberarReservas` limitado a `dynamodb:UpdateItem` sobre `agora-eventos`, sin comodines
- [ ] `liberarReservas` empaquetada con esbuild (`server/bundle-lambdas.mjs`), no con `package.patterns` manual
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
7. Panel de control básico
8. Dominio personalizado `agora.letiende.co`

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
