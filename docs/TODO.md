# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (07/08/2026, noche):** Motor de aforo (Tarea 2, roadmap #8) se completó, se probó (92 pruebas) y se fusionó (PR #15) — ver `MEMORY.md` §2 y §9. Dominio personalizado (Tarea 1, roadmap #17) sigue activa sin cambios, todavía sin empezar. El slot que deja libre Motor de aforo lo ocupa **Compra y reserva de sillas** (roadmap #9) — es el único ítem del backlog que dependía de Motor de aforo y ahora queda desbloqueado; el resto del backlog (comprobante, aprobación, emisión, puerta, efectivo) depende en cadena de esta tarea.

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

## Tarea 2 — [FEATURE]: Compra y reserva de sillas

**Origen:** `PRD.md` §5.3 (flujo completo), CU-04/CU-06/CU-17 · `tech-specs.md` §11 ítem 9, §5.1 (`POST /api/compras`, `GET /api/compras/:compraId/estado`), §5.4 (usa `services/aforo.ts`, ya completo), §5.6 (`services/notificaciones.ts`), §8.2 (enlaces mágicos), §8.3 (superficie pública) · `CLAUDE.md` §5 (A04, A07, A08, Habeas Data)

**Alcance de esta tarea — solo el camino de evento PAGO:** crear la compra, reservar el aforo con `aforo.ts` (ya completo) y enviarle al cliente un enlace mágico para cargar el comprobante. **No incluye**: la página que consume ese enlace (`handlers/comprobantes.ts`, roadmap #10), la aprobación (roadmap #11), ni la emisión de boletas (roadmap #12). **Decisión de alcance explícita:** el camino de boleta gratuita (CU-07, `precio = 0`) responde `501` con un mensaje claro en vez de simularse a medias — emitir una boleta sin comprobante es responsabilidad de la tarea de emisión (roadmap #12), que todavía no existe; falsear el flujo aquí produciría una compra "confirmada" sin boleta real, el tipo exacto de implementación a medias que el proyecto evita.

**Gaps documentados a propósito (no silenciados):**
- **Rate limiting: todavía sin implementar.** Se investigó `provider.httpApi.throttle` — **verificado que no existe** para HTTP API en Serverless Framework (solo aplica a REST API vía `usagePlan`; hay un issue abierto pidiéndolo desde hace tiempo, `serverless/serverless#8589`, sin resolver). La única vía real es el plugin `serverless-apigateway-route-settings` (no evaluado todavía contra Serverless Framework 4) o un `resources.extensions` de CloudFormation escrito a mano sobre el Stage autogenerado (`RouteSettings`/`DefaultRouteSettings`), no verificable sin desplegar en este entorno. `POST /api/compras` queda **sin límite de tasa real** hasta que se resuelva — es la primera mejora de seguridad a cerrar antes de tráfico real.
- **CORS:** se mantiene `httpApi.cors: true` global (mismo que el resto de la API) — restringirlo al origen exacto de la app (`tech-specs.md` §8.3) es un cambio transversal que afecta todos los endpoints ya en producción/staging, fuera del radio de esta tarea atómica.
- **Texto legal:** el checkbox de aceptación usa un texto honesto basado en lo ya documentado en `CLAUDE.md` (Habeas Data), **no es texto legal revisado por un humano** — debe reemplazarse antes de vender boletas reales.

**Archivos a crear:**
- `server/api/lib/enlaces-magicos.ts` (+ `.spec.ts`) — `generarTokenEnlace()` (token aleatorio ≥128 bits + su hash HMAC-SHA256 con `SECRETO_ENLACES_MAGICOS`) y `hashearToken(token)` (misma derivación, para que la tarea de comprobante — roadmap #10 — pueda consumirlo sin reimplementar el hashing). **Nota de propiedad de archivo:** el roadmap técnico (`tech-specs.md` §11 ítem 10) asigna este archivo a la tarea de comprobante, pero como esta tarea ya necesita *generar* el token, se adelanta aquí; la tarea 10 lo reutiliza para *consumirlo*, no lo recrea.
- `server/api/services/correo-ses.ts` (+ `.spec.ts`) — envoltura mínima de `@aws-sdk/client-ses` (`SendEmailCommand`), nueva dependencia.
- `server/api/services/notificaciones.ts` (+ `.spec.ts`) — interfaz `CanalNotificacion` (`tech-specs.md` §5.6) e implementación `CanalCorreoSes`. Solo se implementa la plantilla que esta tarea usa (enlace de comprobante); las otras cuatro plantillas listadas en `tech-specs.md` §5.6 se agregan en las tareas que las necesitan, no como stubs vacíos ahora.
- `server/api/handlers/compras.ts` (+ `.spec.ts`) — `POST /api/compras`, `GET /api/compras/:compraId/estado`.
- `src/app/core/api/compras.service.ts` (+ `.spec.ts`) — cliente público (sin `Authorization`, mismo criterio que `EventosPublicosService`).
- `src/app/features/evento/comprar/comprar.component.ts` (+ `.html`, `.spec.ts`) — formulario de compra en `/evento/:slug/comprar`.

**Archivos a modificar:**
- `serverless.yml`: nuevo GSI `tokenComprobanteHash-index` en `AgoraCompras` (mismo patrón que el `tokenAprobacionHash-index` ya existente); función `compras` nueva con rol IAM propio (`dynamodb:Query`+`GetItem` en `agora-eventos` para resolver el `slug` y clasificar fallos de `aforo.ts`, `dynamodb:UpdateItem` en `agora-eventos` para `reservarSillas`, `dynamodb:PutItem`+`GetItem` en `agora-compras`, `ses:SendEmail`); `provider.httpApi.throttle` global nuevo.
- `server/bundle-lambdas.mjs`: agregar `compras.js` (depende de `documentoDynamoDB` y de `@aws-sdk/client-ses`).
- `src/app/features/evento/detalle-evento.component.ts`/`.html`: botón "Comprar boletas" hacia `/evento/:slug/comprar`, visible solo si `estado === 'publicado'` y `sillasDisponibles > 0`.
- `src/app/app.routes.ts`: ruta `evento/:slug/comprar` (`RenderMode.Client`, mismo criterio que `/admin/*` — es un formulario interactivo, no una página que deba indexarse).

**Qué hacer:**

1. **Precio siempre calculado en el backend** (`CLAUDE.md` §5, A08): la "etapa vigente" es, entre las `etapas` del evento ordenadas por `orden`, la primera cuyo `cierraEn` todavía no pasó. Si ninguna aplica, `409` ("no hay una etapa de boletería vigente"). El total nunca llega ni se acepta desde el cliente.
2. **`expiraEn` en `agora-compras` se guarda en epoch-segundos (`Number`), no en ISO 8601** — excepción explícita a la regla general de `CLAUDE.md` §4: es el atributo de TTL de DynamoDB (`serverless.yml`, `TimeToLiveSpecification`), y TTL exige un `Number` de epoch-segundos, nunca un string. Documentar esto en el propio código y en `MEMORY.md` §7 para que ninguna sesión futura lo "corrija" a ISO y rompa el TTL en silencio.
3. `POST /api/compras`: valida `slug`/`cantidad` (entero positivo, ≤ `maxBoletasPorCompra`)/`cliente.{nombre,telefono,correo}` (mismo criterio hostil-por-defecto que el nombre de evento, `CLAUDE.md` §5 A03)/`autorizacionDatos === true`. Resuelve el evento por `slug` (Query sobre `slug-index`, nunca `Scan`), calcula la etapa vigente y el total, llama `reservarSillas` — sus errores (`AforoInsuficienteError`/`EventoNoPublicadoError`) se traducen a `409` con mensaje claro (CU-17). Genera el token de comprobante, persiste la compra (`estado: 'esperando_comprobante'`, `expiraEn` = ahora + `plazoComprobanteMinutos`) y envía el correo con el enlace — el envío de correo es best-effort (no revierte la reserva si SES falla; se registra el fallo sin datos personales).
4. `GET /api/compras/:compraId/estado`: público, sin datos del cliente. Si `expiraEn` ya pasó pero el ítem todavía existe (el TTL de DynamoDB no es puntual, `tech-specs.md` §5.4 punto 4), responde `estado: 'expirada'` igual — nunca confía en que el borrado físico ya ocurrió.
5. Frontend: el total mostrado en pantalla es solo para UX (se recalcula localmente con la etapa vigente que ya trae `EventoPublico.etapas`); el backend nunca lo recibe ni lo valida contra lo que el cliente vio.

**Definition of done:**
- [x] El precio/total nunca se acepta desde el cliente — se calcula siempre en `compras.ts` a partir de la etapa vigente real (`etapaVigente()`, primera etapa por `orden` cuyo `cierraEn` no ha pasado)
- [x] `POST /api/compras` reserva aforo con `aforo.ts` (nunca duplica su lógica) y traduce sus errores a respuestas 409 claras (CU-17, incluye `sillasDisponibles` reales)
- [x] El token de comprobante tiene ≥128 bits de entropía (`randomBytes(32)`), se guarda hasheado con HMAC-SHA256 (nunca en claro) y expira con el plazo del evento (`CLAUDE.md` §5, A07)
- [x] `expiraEn` se guarda en epoch-segundos, documentado como excepción a la regla ISO 8601 general (código + `MEMORY.md` §7)
- [x] `GET /api/compras/:compraId/estado` no expone `cliente` ni ningún dato personal
- [x] Boletas gratuitas (`precio = 0`) responden `501` explícito, no una emisión simulada
- [x] Rol IAM de `compras` sin comodines, acotado exactamente a lo que `compras.ts`/`aforo.ts` usan (SES acotado a la identidad `letiende.co`, no `ses:*`)
- [x] `npm run test:api` y `npm run test` en verde (118 pruebas backend + 115 frontend)
- [x] `npm run build` sin errores
- [x] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (implementación lista en `claude/tarea-1-mobile-feasibility-044k5v`; PR pendiente de solicitud explícita del usuario)

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Carga de comprobante por enlace mágico (depende de Compra y reserva de sillas)
2. Aprobación del productor
3. Emisión de boletas con QR firmado
4. Validación en puerta
5. Venta en efectivo
6. Panel de control básico

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
