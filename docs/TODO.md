# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (09/08/2026, continuación):** el PR #20 (Validación en puerta) se fusionó. **Venta en efectivo (Tarea 2, roadmap #14) se implementó de punta a punta** en esta sesión: backend (`handlers/ventas-efectivo.ts`, `lib/validaciones.ts` extraído, `medioPago` agregado a ambos handlers), frontend (`SeleccionVentaEfectivoComponent` + `VentaEfectivoComponent`), infraestructura (`serverless.yml`, `bundle-lambdas.mjs`, rutas) — 216 pruebas backend + 186 frontend en verde, `npm run build`/`build:api`/`bundle:api` sin errores, auditoría de costos limpia. **Todavía sin validar en vivo en staging ni fusionada** — el trabajo está commiteado y empujado a `claude/tarea-1-mobile-feasibility-044k5v`, sin PR abierto (no se pidió en esta sesión). Dominio personalizado (Tarea 1, roadmap #17 del roadmap técnico) sigue activa sin cambios, todavía sin empezar — sigue siendo la única tarea disponible para arrancar en paralelo.

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

## Tarea 2 — [FEATURE]: Venta en efectivo

**Origen:** `PRD.md` §5.4 (flujo completo), CU-11 · `tech-specs.md` §11 ítem 14 (`features/evento/venta-efectivo/`), §5.1 (`POST /api/ventas-efectivo`, Portero+, `{ slug, cantidad, cliente }` — "reserva, confirma y emite en una operación"), §4.2 (ruta `/evento/:slug/efectivo`, `GuardiaAuth` + rol ≥ portero) · `CLAUDE.md` §5 (A08 el precio y la etapa se calculan siempre en el servidor)

**Alcance:** cualquier integrante del equipo (`portero`, `productor` o `administrador` — `PRD.md` §5.4 dice "cualquier integrante", así que `rolMinimo: 'portero'`) registra una venta presencial desde la app: ingresa los datos del cliente, confirma, y el sistema reserva el aforo, lo confirma y emite las boletas **en la misma operación**, sin pasar por comprobante ni aprobación. Sirve tanto para venta anticipada en la sede como para quien llega a la puerta el día del evento sin haber comprado.

**Gap de modelo de datos descubierto al especificar esta tarea (no es un bug, es información que faltaba hasta ahora):** `agora-compras` **nunca persiste `medioPago`** — ni `compras.ts` (la compra pública) lo guarda hoy, pese a que `tech-specs.md` §5.1 sí define ese campo en la interfaz `Compra`. Como el objetivo explícito de esta tarea es distinguir una venta en efectivo de una compra normal, el campo por fin hace falta de verdad. Se agrega `medioPago: 'efectivo' | 'transferencia' | 'bold'` a la escritura de **ambos** handlers (`compras.ts` con el medio que el cliente eligió del evento, `ventas-efectivo.ts` con `'efectivo'` fijo) en esta misma tarea — no solo en el nuevo, para no dejar el gap a medias en el handler viejo.

**Riesgo de duplicación a resolver explícitamente al implementar:** `compras.ts` ya tiene, sin exportar, `etapaVigente()` (elige la etapa vigente por `orden`/`cierraEn` — cálculo con consecuencia económica directa, `CLAUDE.md` §5 A08) y `buscarEventoPublicadoPorSlug()`, además de los validadores de `cliente` (`esNombreClienteValido`/`esTelefonoValido`/`esEmailValido`). `ventas-efectivo.ts` necesita exactamente la misma lógica de precio — **exportar y reutilizar desde `compras.ts`, nunca copiar/pegar una segunda versión** de `etapaVigente` en particular: dos copias de "cómo se calcula el precio" es exactamente el tipo de divergencia que A08 existe para prevenir. Los validadores de `cliente`, al tener ahora dos consumidores reales, se extraen a `server/api/lib/validaciones.ts` (archivo ya previsto en el árbol de `tech-specs.md` §3, nunca creado hasta ahora).

**Decisión de diseño resuelta al implementar:** se descartó tanto (a) un botón en `DetalleEventoComponent` como la generalización de `SeleccionPuertaComponent` (vía `data`/`withComponentInputBinding()`, confirmado disponible) — el riesgo de tocar un componente ya en producción y probado no valía el ahorro de DRY para ~30 líneas de UI. Se creó `SeleccionVentaEfectivoComponent`, mismo patrón de lista de eventos, pero en `features/evento/venta-efectivo/` (no en `features/puerta/`) porque `tech-specs.md` §11 roadmap #14 especifica esa carpeta literalmente. Ver `MEMORY.md` §9 para el detalle completo.

**Ya existe, se reutiliza sin recrear:**
- `server/api/services/aforo.ts`: `reservarSillas` + `confirmarSillas` — la operación "reserva, confirma y emite en una operación" de `tech-specs.md` no es una primitiva nueva, son las dos escrituras condicionales ya existentes, invocadas en secuencia (cada una ya es atómica por sí sola).
- `server/api/services/boleteria.ts`: `emitirBoletas` — mismo consumidor que `aprobaciones.ts`, esta tarea es su segundo consumidor real, tal como la especificación de Emisión de boletas ya lo anticipaba.
- `services/notificaciones.ts`: plantilla `boletas_emitidas` — mismo correo que ya recibe un cliente cuya compra fue aprobada.
- `server/api/lib/autorizacion.ts`: `exigirRol('portero')`.

**Archivos a crear:**
- `server/api/handlers/ventas-efectivo.ts` (+ `.spec.ts`) — `POST /api/ventas-efectivo` (`exigirRol('portero')`, `{ slug, cantidad, cliente }`).
- `server/api/lib/validaciones.ts` (+ `.spec.ts`) — validadores de `cliente` extraídos de `compras.ts` (ver riesgo de duplicación arriba).
- `src/app/features/evento/venta-efectivo/venta-efectivo.component.ts` (+ `.html`, `.spec.ts`) — ruta protegida `/evento/:slug/efectivo` (`guardiaRol`, mínimo `portero`), formulario de datos del cliente (mismos campos que `ComprarComponent`, sin comprobante). **Resuelto al implementar:** sí lleva checkbox de `autorizacionDatos` — `CLAUDE.md` §5 exige autorización explícita "en el flujo de compra" sin excepción para ventas presenciales; el checkbox lo marca el equipo, confirmando que el cliente autorizó en persona, no el cliente mismo.
- `src/app/core/api/ventas-efectivo.service.ts` (+ `.spec.ts`) — autenticado.

**Archivos a modificar:**
- `server/api/handlers/compras.ts`: exportar `etapaVigente`/`buscarEventoPublicadoPorSlug`; agregar `medioPago` a la escritura (ver gap de modelo arriba); usar los validadores extraídos a `lib/validaciones.ts` en vez de las copias locales.
- `serverless.yml`: función `ventasEfectivo` nueva con rol IAM propio (`dynamodb:GetItem`/`Query` en `agora-eventos`, `UpdateItem` condicional en `agora-eventos` vía `aforo.ts`, `PutItem` en `agora-compras`, `PutItem` en `agora-boletas` vía `boleteria.ts`, `GetItem` en `agora-usuarios` vía `exigirRol`, `ses:SendEmail` acotado a `letiende.co`).
- `server/bundle-lambdas.mjs`: agregar `ventas-efectivo.js`.
- `src/app/app.routes.ts`/`app.routes.server.ts`: `/evento/:slug/efectivo` (`RenderMode.Client`).

**Qué hacer:**

1. Resolver el punto de diseño de "cómo llega el equipo a `/evento/:slug/efectivo`" antes de escribir el componente.
2. Extraer `lib/validaciones.ts` desde `compras.ts`, y exportar `etapaVigente`/`buscarEventoPublicadoPorSlug` — sin reescribir su lógica, solo moverla/exportarla.
3. Agregar `medioPago` a `compras.ts` (gap de modelo) antes de escribir `ventas-efectivo.ts`, para que el nuevo handler no sea el único lugar que lo persiste.
4. `handlers/ventas-efectivo.ts`: valida payload, calcula precio en el servidor (`etapaVigente`, nunca aceptado del cliente), `reservarSillas` → `confirmarSillas` → `emitirBoletas` → notifica `boletas_emitidas`, best-effort.
5. `VentaEfectivoComponent`: formulario, sin plazo de comprobante (la confirmación es inmediata).

**Definition of done:**
- [x] El precio y la etapa se calculan siempre en el servidor, reutilizando `etapaVigente` de `compras.ts` — nunca una segunda implementación
- [x] La reserva, confirmación y emisión de boletas reutilizan `aforo.ts`/`boleteria.ts` sin reimplementar ninguna escritura condicional
- [x] `medioPago` se persiste tanto en `ventas-efectivo.ts` como en `compras.ts` (gap de modelo cerrado en los dos lugares, no solo en el nuevo)
- [x] Los validadores de `cliente` viven en `lib/validaciones.ts`, consumidos por ambos handlers — no hay una segunda copia
- [x] El cliente recibe `boletas_emitidas`, best-effort
- [x] `npm run test:api` y `npm run test` en verde (216 backend, 186 frontend)
- [x] `npm run build` sin errores (incluye `build:api`/`bundle:api`)
- [x] Auditoría de costos sin coincidencias nuevas
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar** (commiteado y empujado; PR sin abrir todavía, no se pidió en esta sesión)
- [ ] Validado en vivo en staging por el usuario

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (`tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Panel de control básico

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
