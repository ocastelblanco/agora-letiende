# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (07/08/2026, noche):** la Tarea 1 (QR del evento para afiches) se completó y se probó de punta a punta (68 pruebas backend + 102 frontend), PR #14 abierto contra `main` — ver `MEMORY.md` §2 y §9. Motor de aforo (Tarea 2, roadmap #8) sigue activa sin cambios, todavía sin empezar. El slot que deja libre QR lo ocupa **Dominio personalizado `agora.letiende.co`** (roadmap #17) — es el único ítem del roadmap v1 que no depende de Motor de aforo (depende solo de #2, infraestructura base, ya completa desde el andamiaje inicial).

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
