# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (09/08/2026, madrugada):** Aprobación del productor (Tarea 2, roadmap #11) se completó, se probó (158 pruebas backend + 143 frontend) y se validó en vivo en staging por el usuario (PR #18, incluyó un bug real de permisos IAM encontrado y corregido en la misma rama — ver `MEMORY.md` §2, §7 y §9). Dominio personalizado (Tarea 1, roadmap #17 del roadmap técnico) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Aprobación del productor lo ocupa **Emisión de boletas con QR firmado** (roadmap #12) — primer ítem del backlog, único que dependía de esa tarea y ahora queda desbloqueado. El usuario confirmó explícitamente que el correo de "compra aprobada" al cliente se difiere a esta tarea (la boleta emitida ES esa notificación, evita construir un correo intermedio que quedaría obsoleto de inmediato).

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

## Tarea 2 — [FEATURE]: Emisión de boletas con QR firmado

**Origen:** `PRD.md` §5.3 (flujo completo, "el sistema emite una boleta digital por cada boleta comprada"), §5.1 CU (boleta digital incluye QR único, datos del evento, dirección, etapa, datos del cliente, logos) · `tech-specs.md` §11 ítem 12 (`services/boleteria.ts`, `lib/firma-boletas.ts`, tabla `agora-boletas`, `features/boleta/`), §5.5 (mecanismo de emisión y de firma del código), §5.1 (`GET /api/boletas/:codigo`), §5.2 (tabla `agora-boletas`, GSIs `eventoId-estado-index`/`compraId-index`), §5.6 (plantilla `boletas_emitidas`, ya prevista en la lista de v1), §9 (`SECRETO_FIRMA_BOLETAS`, ya documentado, todavía sin crear en GitHub) · `CLAUDE.md` §5 (A02 identificador de boleta UUID v4 + firma HMAC, A08 nunca aceptar precio/etapa del cliente)

**Alcance:** cuando `POST /api/aprobaciones/:token/aprobar` confirma una compra, emitir exactamente `cantidad` boletas (una por silla), cada una con un `boletaId` UUID v4 y un código de QR firmado (`{boletaId}.{firma}`, HMAC-SHA256 truncado con `SECRETO_FIRMA_BOLETAS`) que un desconocido no puede adivinar ni falsificar sin la llave. Exponer `GET /api/boletas/:codigo` (público, firma obligatoria) para mostrar la boleta digital, y notificar al cliente por correo con el enlace a cada boleta — esta notificación es, a propósito, la que reemplaza el correo de "compra aprobada" que el usuario preguntó si existía (sesión 08/08/2026 noche): en vez de un correo intermedio que quedaría obsoleto en cuanto existieran boletas reales, se difirió hasta esta tarea a pedido explícito del usuario.

**Decisiones de alcance explícitas (mismo criterio que "boletas gratuitas" y "aprobar no emite boletas" de tareas anteriores — no inventar una implementación a medias):**
- **No incluye `POST /api/boletas/:codigo/validar`** (validación en la puerta, roadmap #13) — esta tarea solo emite y muestra, no valida el ingreso. `handlers/boletas.ts` nace con un único endpoint (`GET`), el `POST` se agrega en la tarea de Validación en puerta sin recrear el archivo.
- **No incluye Venta en efectivo** (roadmap #14) — esa tarea futura reutilizará `emitirBoletas()` de `services/boleteria.ts` sin recrearla, igual que esta tarea reutiliza `confirmarSillas`/`liberarSillas` de `aforo.ts`.
- **El correo no adjunta el PNG del QR** — `services/correo-ses.ts` (`SendEmailCommand`) no soporta adjuntos todavía; el correo trae el enlace a `/boleta/{codigo}`, que sí renderiza el QR (el servidor lo genera en el `GET`, reutilizando `services/qr.ts`, ya existente desde la tarea de QR del evento).

**Gap de modelo de datos descubierto al especificar esta tarea (no es un bug, es información que faltaba hasta ahora):** `agora-compras` no guarda `etapaId` — `handlers/compras.ts` solo persiste `montoTotal`/`cantidad`, suficiente para todo lo implementado hasta hoy, pero `emitirBoletas` sí necesita saber a qué etapa perteneció cada boleta (para mostrarla en la boleta digital). Se agrega `etapaId` a la escritura de `compras.ts` en esta misma tarea. `valorUnitario` **no** se persiste aparte — se deriva en `boleteria.ts` como `compra.montoTotal / compra.cantidad` (división exacta, sin decimales, porque `montoTotal = etapa.precio * cantidad`), evitando un campo redundante.

**Ya existe, se reutiliza sin recrear:**
- `server/api/services/qr.ts`: `generarQrPng`/`generarQrSvg` (roadmap #15, QR del evento) — genera el PNG del código de la boleta a partir de la URL firmada, sin cambios.
- `server/api/lib/enlaces-magicos.ts`: patrón de HMAC con `createHmac('sha256', secreto)` — `lib/firma-boletas.ts` sigue el mismo estilo pero **no** es un enlace mágico de un solo uso (la firma es determinística y reverificable cualquier cantidad de veces, no se persiste ni se consume).
- `server/api/services/aforo.ts`: `confirmarSillas` (ya consumido por `aprobaciones.ts`) — sin cambios, `emitirBoletas` se llama después, en el mismo flujo de `aprobarCompra`.
- `services/notificaciones.ts`: agregar la plantilla `boletas_emitidas` (ya prevista en `tech-specs.md` §5.6, todavía sin implementación).

**Archivos a crear:**
- `server/api/lib/firma-boletas.ts` (+ `.spec.ts`) — `firmarCodigoBoleta(boletaId)`/`verificarFirmaBoleta(boletaId, firma)`, HMAC-SHA256 truncado (documentar la longitud elegida en el propio código) con `SECRETO_FIRMA_BOLETAS`, comparación en tiempo constante (`crypto.timingSafeEqual`, guardando longitudes distintas antes de comparar para no lanzar `RangeError`).
- `server/api/services/boleteria.ts` (+ `.spec.ts`) — `emitirBoletas(compra: { compraId, eventoId, etapaId, montoTotal, cantidad })`: crea `cantidad` ítems en `agora-boletas` (`PutCommand` con `ConditionExpression: attribute_not_exists(boletaId)` por cada uno, mismo criterio de UUID v4 astronómicamente improbable que ya usan `compras.ts`/`eventos.ts`), `numeroEnCompra` de 1 a `cantidad`, `estado: 'valida'`, `emitidaEn`. Devuelve el arreglo de boletas creadas (para que `aprobaciones.ts` arme los enlaces del correo sin releer DynamoDB).
- `server/api/handlers/boletas.ts` (+ `.spec.ts`) — `GET /api/boletas/:codigo` (público): separa `codigo` en `boletaId`+`firma`, **verifica la firma antes de tocar DynamoDB** (rechazo barato) y responde el mismo mensaje genérico tanto si la firma es inválida como si el `boletaId` no existe (nunca distinguir los dos casos — evita un oráculo que permita enumerar boletas reales probando firmas). Con firma válida y boleta existente: `GetItem` de la boleta, del evento (nombre, descripción, fecha, dirección fija "Bogotá, Colombia" — mismo placeholder ya usado en el JSON-LD de `DetalleEventoComponent`, no una dirección real sin verificar; logotipo vía la misma construcción de URL pública que `eventos-publicos.ts`) y de la compra (nombre del cliente); arma el PNG del QR con `generarQrPng` (base64 en la respuesta) y el nombre de la etapa (buscada en `evento.etapas` por `etapaId`).
- `src/app/core/api/boleta-digital.service.ts` (+ `.spec.ts`) — público, sin `Authorization`, mismo criterio que `ComprobantesService`.
- `src/app/features/boleta/boleta-digital.component.ts` (+ `.html`, `.spec.ts`) — ruta pública `/boleta/:codigo`: muestra el QR (imagen `data:image/png;base64,...`), nombre/descripción/fecha del evento, dirección, etapa, nombre del cliente, número de boleta dentro de la compra, y el logotipo del evento si existe.

**Archivos a modificar:**
- `server/api/handlers/compras.ts`: agregar `etapaId` al ítem persistido (ver gap de modelo arriba).
- `server/api/handlers/aprobaciones.ts`: `aprobarCompra()` llama `emitirBoletas` después de `confirmarSillas` (mismo bloque `try/catch` best-effort que ya existe para el aforo — un fallo en la emisión no debe revertir una aprobación ya válida, se registra `compraId` para diagnóstico) y notifica `boletas_emitidas` al cliente con los enlaces a `/boleta/{codigo}` de cada boleta emitida, best-effort.
- `server/api/services/notificaciones.ts`: plantilla `boletas_emitidas`.
- `serverless.yml`: tabla `AgoraBoletas` nueva (`PAY_PER_REQUEST`, PK `boletaId`, GSI `eventoId-estado-index`, GSI `compraId-index`); función `boletas` nueva con rol IAM propio (`dynamodb:GetItem` en `agora-boletas`/`agora-eventos`/`agora-compras`, sin `firebase-admin` — endpoint público, no necesita bundle por ese motivo pero sí por `documentoDynamoDB`, mismo criterio que `eventos-publicos.ts`); rol de `aprobaciones` gana `dynamodb:PutItem` en `agora-boletas`.
- `server/bundle-lambdas.mjs`: agregar `boletas.js`.
- `.github/workflows/deploy.yml`: agregar `SECRETO_FIRMA_BOLETAS` a los dos jobs de deploy **en el mismo cambio que la primera Lambda que lo consume** — la lección de `SES_REMITENTE`/`FIREBASE_SERVICE_ACCOUNT_AGORA` ya se repitió dos veces esta semana (`MEMORY.md` §7), no una tercera.
- `src/app/app.routes.ts`/`app.routes.server.ts`: `/boleta/:codigo` (`RenderMode.Client`, pública, mismo criterio que `/comprobante/:token`/`/aprobaciones/:token`).

**Qué hacer:**

1. **`lib/firma-boletas.ts`**: firma determinística truncada del `boletaId`, verificación en tiempo constante.
2. **Tabla `agora-boletas`** en `serverless.yml`, sin `ProvisionedThroughput`.
3. **`compras.ts`**: persistir `etapaId`.
4. **`services/boleteria.ts`**: `emitirBoletas()`, consumida únicamente por `aprobarCompra()` en esta tarea.
5. **`aprobaciones.ts`**: integrar la emisión y la notificación al cliente en el camino feliz de aprobar.
6. **`handlers/boletas.ts`**: `GET /api/boletas/:codigo`, con el rechazo barato de firma inválida antes de cualquier lectura de DynamoDB.
7. **Frontend**: `BoletaDigitalService` + `BoletaDigitalComponent` en `/boleta/:codigo`, con el QR y los datos de la boleta.
8. **Auditoría** (`CLAUDE.md` §5, A09): `emitidaEn` es append-only (se escribe una sola vez, en la creación de la boleta); ninguna operación de esta tarea sobrescribe un campo ya escrito.

**Definition of done:**
- [ ] Cada aprobación emite exactamente `cantidad` boletas, cada una con `boletaId` UUID v4 (nunca consecutivo ni derivado de datos del cliente)
- [ ] El código de la boleta (`{boletaId}.{firma}`) usa HMAC-SHA256 truncado con `SECRETO_FIRMA_BOLETAS`, verificado en tiempo constante
- [ ] `GET /api/boletas/:codigo` rechaza una firma inválida **antes** de cualquier lectura a DynamoDB, y responde el mismo mensaje genérico para "firma inválida" y para "boleta inexistente" (sin oráculo de enumeración)
- [ ] `aprobar` reutiliza `confirmarSillas` (ya) y ahora también `emitirBoletas` — ninguna reimplementa `aforo.ts`/`boleteria.ts`
- [ ] El cliente recibe `boletas_emitidas` con enlace a cada boleta, best-effort, sin revertir la aprobación si la notificación falla
- [ ] Explícito en código y en `MEMORY.md`: `POST /api/boletas/:codigo/validar` (roadmap #13) y Venta en efectivo (roadmap #14) quedan fuera de esta tarea
- [ ] `SECRETO_FIRMA_BOLETAS` agregado a `deploy.yml` en el mismo commit que lo empieza a consumir, no como fix posterior
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build` sin errores
- [ ] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Validación en puerta (depende de Emisión de boletas)
2. Venta en efectivo (depende de Emisión de boletas)
3. Panel de control básico

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use.
- 🔴 `SECRETO_FIRMA_BOLETAS` **todavía no existe en GitHub** — bloquea la validación en vivo de la Tarea 2 activa (Emisión de boletas). A diferencia del patrón de `SES_REMITENTE` (que falla de forma audible, SES rechaza el envío), un `SECRETO_FIRMA_BOLETAS` vacío en `serverless.yml` (`${env:..., ''}`) **no rompe nada visiblemente** — las firmas se calculan igual, solo que con una llave vacía y predecible, lo que vuelve las boletas falsificables sin acceso al sistema (`CLAUDE.md` §5, A02). Crearlo en GitHub (`staging` primero) **antes** de la primera prueba real en staging de esta tarea, no después de encontrar el problema.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
