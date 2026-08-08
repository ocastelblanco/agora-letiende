# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (08/08/2026, noche):** Carga de comprobante por enlace mágico (Tarea 2, roadmap #10) se completó, se probó (137 pruebas backend + 124 frontend) y se validó en vivo en staging por el usuario (PR #17, incluyó un bug real de despliegue encontrado y corregido en la misma sesión — ver `MEMORY.md` §2, §7 y §9). Dominio personalizado (Tarea 1, roadmap #17 del roadmap técnico) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Carga de comprobante lo ocupa **Aprobación del productor** (roadmap #11) — es el único ítem del backlog que dependía de esa tarea y ahora queda desbloqueado.

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

## Tarea 2 — [FEATURE]: Aprobación del productor

**Origen:** `PRD.md` §5.3 (flujo completo), CU-08/CU-09/CU-10 · `tech-specs.md` §11 ítem 11, §5.1 (`GET /api/aprobaciones`, `GET /api/aprobaciones/:token`, `POST /api/aprobaciones/:token/aprobar`, `POST /api/aprobaciones/:token/rechazar`), §5.6 (`services/notificaciones.ts`, ya existe), §8.2 (enlaces mágicos, ya existe) · `CLAUDE.md` §5 (A01 jerarquía de roles/pertenencia al evento, A04 confirmarSillas/liberarSillas ya existen, A07 enlaces mágicos, A09 auditoría)

**Alcance:** que un productor vea las compras `en_revision` de sus eventos, revise el comprobante y las apruebe o las rechace. **Decisión de alcance explícita, mismo criterio que "boletas gratuitas" en la Tarea de Compra y reserva:** `POST .../aprobar` confirma el aforo (`confirmarSillas`, ya existe) y transiciona la compra a `aprobada`, **pero no emite boletas** — `tech-specs.md` §5.1 describe la aprobación como si "emitiera boletas" en el mismo paso, pero `agora-boletas`/`firma-boletas.ts` (roadmap #12) todavía no existen. Inventar una emisión falsa aquí sería el mismo tipo de implementación a medias que ya se evitó antes; la tarea de emisión (roadmap #12) es la que cierra ese hueco, leyendo las compras `aprobada` sin boleta emitida.

**Ya existe, se reutiliza sin recrear:**
- `server/api/services/aforo.ts`: `confirmarSillas`/`liberarSillas` — esta tarea es su primer consumidor real (hasta ahora solo tenían pruebas unitarias directas).
- `server/api/lib/enlaces-magicos.ts`: `generarTokenEnlace`/`hashearToken` — el token de aprobación es de 24 horas (`tech-specs.md` §8.2, distinto del de comprobante), pero la derivación es la misma.
- GSI `tokenAprobacionHash-index` en `agora-compras`: ya existe en `serverless.yml` desde la tabla original, todavía sin consumidor.
- `server/api/services/notificaciones.ts`: agregar las plantillas `compra_rechazada` (cliente) y actualizar `aviso_comprobante` para incluir el enlace real de aprobación (hoy dice explícitamente "todavía no existe una página de aprobación" — con esta tarea, ya existe).

**Modificación clave a `comprobantes.ts` (no es un archivo nuevo de esta tarea, pero la tarea lo toca):** `confirmarComprobante()` ya transiciona la compra a `en_revision` y llama `aviso_comprobante` — debe generar también el token de aprobación (`generarTokenEnlace`, expira a las 24 h) en la misma escritura que graba `en_revision`, guardar su hash (`tokenAprobacionHash`) y pasar el enlace real (`${URL_BASE_APP}/aprobaciones/{token}`) a la plantilla en vez de omitirlo.

**Archivos a crear:**
- `server/api/handlers/aprobaciones.ts` (+ `.spec.ts`) — los cuatro endpoints.
- `src/app/core/api/aprobaciones.service.ts` (+ `.spec.ts`) — dos clientes distintos: uno autenticado (`GET /api/aprobaciones`, con `Authorization`) y uno público por token (los otros tres, sin `Authorization`, mismo criterio que `ComprobantesService`).
- `src/app/features/aprobaciones/lista-aprobaciones.component.ts` (+ `.html`, `.spec.ts`) — ruta protegida `/admin/aprobaciones` (`guardiaRol`, mínimo `productor`), lista las compras `en_revision` de los eventos del productor.
- `src/app/features/aprobaciones/revisar-aprobacion.component.ts` (+ `.html`, `.spec.ts`) — ruta pública `/aprobaciones/:token`, muestra los datos de la compra y el comprobante (imagen/PDF vía la URL prefirmada que devuelve el `GET` por token), botones aprobar/rechazar.

**Archivos a modificar:**
- `serverless.yml`: función `aprobaciones` nueva con rol IAM propio — `dynamodb:Scan` en `agora-eventos` (filtrar por `productores` conteniendo el correo del token; ya hay precedente de `Scan` para listados de bajo volumen en `eventos.ts`, no se introduce un GSI nuevo para esto todavía) + `dynamodb:Query` en `agora-compras` (por `eventoId-creadaEn-index` y por `tokenAprobacionHash-index`) + `dynamodb:UpdateItem` condicional en `agora-compras` y `agora-eventos` (vía `aforo.ts`) + `dynamodb:GetItem` en `agora-usuarios` (resolver el rol, vía `exigirRol`) + `s3:GetObject` prefirmado sobre `BucketComprobantes` (mostrar el comprobante al productor) + `ses:SendEmail` acotado a `letiende.co`.
- `server/api/handlers/comprobantes.ts`: generar el token de aprobación al confirmar (ver arriba).
- `server/api/services/notificaciones.ts`: plantilla `compra_rechazada`.
- `server/bundle-lambdas.mjs`: agregar `aprobaciones.js`.
- `src/app/app.routes.ts`/`app.routes.server.ts`: `/admin/aprobaciones` (`RenderMode.Client`, protegida) y `/aprobaciones/:token` (`RenderMode.Client`, pública).
- `shared/navegacion/secciones-navegacion.ts`: nueva sección "Aprobaciones" para `productor`+.

**Qué hacer:**

1. **`GET /api/aprobaciones`** (`exigirRol('productor')`): resuelve los eventos donde el correo del token está en `productores`, y por cada uno hace `Query` sobre `agora-compras` (`eventoId-creadaEn-index`) filtrando `estado = 'en_revision'`. Nunca confía en un `eventoId` que el cliente pase — la pertenencia siempre se verifica contra `evento.productores` (`CLAUDE.md` §5, A01, regla explícita de jerarquía de roles).
2. **`GET /api/aprobaciones/:token`**: valida el token igual que `comprobantes.ts` (existe / no vencido / `estado === 'en_revision'`), devuelve los datos de la compra (sí incluye `cliente`, a diferencia de `GET /api/compras/:id/estado` — acá es información que el productor necesita para verificar el pago) más una URL prefirmada de `GetObject` sobre `comprobanteKey` para mostrar el archivo.
3. **`POST /api/aprobaciones/:token/aprobar`**: `UpdateCommand` condicional `estado = 'en_revision' → 'aprobada'` que además graba `resueltoPor`/`resueltoEn`. Si la condición falla, lee el estado actual y responde "esta compra ya fue resuelta por {resueltoPor}" (CU-10 — bloqueo entre productores, nunca un error genérico). Si la condición pasa, llama `confirmarSillas(eventoId, cantidad)`.
4. **`POST /api/aprobaciones/:token/rechazar`** (`{ motivo? }`): mismo patrón condicional, transiciona a `rechazada`, llama `liberarSillas(eventoId, cantidad)` y notifica al cliente con `compra_rechazada` (incluye `motivo` si se envió), best-effort.
5. **Auditoría** (`CLAUDE.md` §5, A09): tanto aprobar como rechazar son transiciones con consecuencia económica — `resueltoPor` y `resueltoEn` son append-only, nunca se sobrescriben tras la primera escritura (la propia `ConditionExpression` ya lo garantiza).

**Definition of done:**
- [x] Un productor solo ve/resuelve compras de eventos donde está en `productores` — nunca por rol a secas
- [x] La aprobación/rechazo es una única escritura condicional sobre `estado = 'en_revision'` — el segundo productor que intenta resolver la misma compra recibe "ya fue resuelta por {nombre}", no un error genérico (CU-10)
- [x] `aprobar` llama `confirmarSillas`, `rechazar` llama `liberarSillas` — ninguna reimplementa la lógica de `aforo.ts`
- [x] Explícito en código y en `MEMORY.md`: `aprobar` no emite boletas todavía (roadmap #12)
- [x] El cliente recibe la notificación de compra rechazada, con el motivo si el productor lo dio
- [x] `npm run test:api` y `npm run test` en verde (158 backend + 143 frontend)
- [x] `npm run build` sin errores
- [x] Auditoría de costos sin coincidencias nuevas
- [x] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (PR #18)

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Emisión de boletas con QR firmado (depende de Aprobación del productor)
2. Validación en puerta
3. Venta en efectivo
4. Panel de control básico

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use. `SECRETO_FIRMA_BOLETAS` sigue pendiente para más adelante (emisión de boletas, roadmap #12, todavía no implementada).

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
