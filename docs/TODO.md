# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (11/08/2026):** Exportación XLSX (roadmap #21) quedó implementada — endpoint, IAM, URL prefirmada, botón de descarga, verificación arquitectónica independiente y ajuste de columnas pedido por el usuario (ID de compra en vez de total redundante) — y su PR (#25) está abierto contra `main`, pendiente solo de fusión humana; pasa a completada en `MEMORY.md` §2. Dominio personalizado (Tarea 1) sigue sin cambios. Con el slot libre, la propia nota de backlog de la sesión anterior ya señalaba el candidato: el bug de `etapaId` regenerado en cada `PUT /api/eventos/:eventoId` (`MEMORY.md` §7, fila del 10/08/2026, encontrado durante la verificación del Panel de control) es deuda real que **bloquea directamente** el próximo ítem natural de v2, Etapas de boletería con cierre automático (roadmap #22) — cualquier funcionalidad que dependa de asociar `evento.etapas` con ventas ya existentes hereda el mismo bug si no se corrige primero. Bold y WhatsApp siguen bloqueados por prerrequisitos externos no de código, sin cambios.

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

## Tarea 2 — [FIX]: `etapaId` estable en `PUT /api/eventos/:eventoId`

**Origen:** `docs/MEMORY.md` §7 (fila "Encontrado por una verificación independiente, no en staging (10/08/2026, TODO.md Tarea 2, Panel de control básico) — deuda real, no resuelta, fuera de alcance de esa tarea") y §2 backlog v2 ("candidato natural para una futura tarea del backlog") · bloquea directamente `tech-specs.md` §11 roadmap #22 (Etapas de boletería con cierre automático) — cualquier funcionalidad que dependa de asociar `evento.etapas` con ventas ya existentes hereda el mismo bug si no se corrige primero.

**El bug:** `normalizarEtapas()` (`server/api/handlers/eventos.ts:99-127`) genera `etapaId: randomUUID()` **nuevo para cada etapa, en cada llamada** — se usa tanto en `crearEvento()` (línea 175, correcto, ahí todas las etapas son nuevas) como en `actualizarEvento()` (línea 300, incorrecto: `PUT /api/eventos/:eventoId` la llama con `datos['etapas']` cada vez que el payload incluye `etapas`, y `EditarEventoComponent` siempre envía el arreglo completo aunque el admin solo haya cambiado el nombre del evento o la fecha). `actualizarEvento()` además nunca lee el ítem actual con `GetCommand` antes de escribir (`eventos.ts:245-267`, arma el `UpdateCommand` directo del payload) — no hay ningún punto en el código de hoy donde el `etapaId` "viejo" y el "nuevo" convivan para poder compararlos. Resultado: cualquier `PUT` que incluya `etapas` huerfaniza el `etapaId` de todas las `compras`/`boletas` ya escritas con el valor anterior — el panel de control ya se defendió agrupando por el `etapaId` propio de cada compra con un nombre de respaldo `'Etapa eliminada'` (`reportes.ts`), pero la causa raíz sigue viva y sigue produciendo etapas huérfanas nuevas en cada edición.

**Decisión a resolver explícitamente al implementar, no en abstracto (tensión real con `CLAUDE.md` §5 A08):** la regla general del proyecto es "ningún identificador se acepta del cliente" (`eventoId`, `sillasDisponibles`, y el propio `etapaId` al *crear*, según el comentario ya escrito en `normalizarEtapas()`) — pero `etapaId` no es un identificador de autorización ni de acceso (a diferencia de `eventoId`, no decide qué puede ver o hacer nadie), es solo una llave foránea estable referenciada por `compras`/`boletas`. Dos caminos posibles, a confirmar con el código real de `EditarEventoComponent`/`eventos.ts` en pantalla antes de decidir:
  1. **El backend preserva por posición/coincidencia:** `actualizarEvento()` lee el evento actual (`GetCommand`) antes de construir el `UpdateCommand`, y `normalizarEtapas()` recibe también las etapas existentes para reutilizar el `etapaId` de una etapa que ya tenía uno reconocible (por posición en el arreglo, o por otra heredamos estable) y solo generar UUID nuevo para etapas genuinamente agregadas.
  2. **El frontend hace de fuente de verdad de la identidad:** como `EditarEventoComponent` ya carga el evento completo (con sus `etapaId` reales) para prellenar el `FormArray` al editar, el payload de `PUT` ya puede traer de vuelta el `etapaId` de cada etapa preexistente sin cambios, y `normalizarEtapas()` solo genera UUID nuevo cuando el campo viene ausente/vacío (fila nueva del formulario) — más simple, no requiere una lectura previa en el backend, pero exige validar que el `etapaId` recibido, si viene, tenga forma de UUID y le pertenezca a este mismo evento (no aceptarlo a ciegas).

**Decisión adicional a resolver, con datos reales de staging antes de decidir:** ¿qué hacer con los eventos ya editados desde que existe este bug? Antes de implementar, correr un `Scan`/`Query` de solo lectura contra `agora-eventos-staging`/`agora-compras-staging` (`aws-mcp`, mismo criterio que la investigación del bug de `expiraEn`/TTL) para confirmar cuántas compras reales (si alguna) quedaron con un `etapaId` huérfano — con eso, decidir explícitamente si hace falta un script de backfill una sola vez o si el volumen es cero/despreciable y no amerita nada más que el fix hacia adelante.

**Archivos a modificar:**
- `server/api/handlers/eventos.ts` (+ `.spec.ts`): `normalizarEtapas()` y `actualizarEvento()` — implementar la decisión elegida arriba.
- `src/app/features/admin/gestion-eventos/editar-evento.component.ts` (+ `.spec.ts`): si la decisión es la opción 2, confirmar que el `FormArray` de etapas ya preserva `etapaId` por fila y lo envía de vuelta tal cual al guardar (sin regenerarlo en el cliente).
- `docs/MEMORY.md` §7: marcar la fila del gotcha original como resuelta, sin borrarla (es evidencia histórica de un bug real ya corregido, mismo criterio que otras filas "Confirmado resuelto" de la tabla).

**Definition of done:**
- [ ] Un `PUT /api/eventos/:eventoId` que reenvía `etapas` sin cambiar su contenido real (mismo nombre/precio/cierraEn/orden) **no genera ningún `etapaId` nuevo**
- [ ] Una etapa genuinamente agregada en el mismo `PUT` sí recibe un `etapaId` nuevo generado por el backend, nunca aceptado tal cual de un cliente que pudiera inventarlo
- [ ] Decisión sobre datos ya huérfanos en staging tomada explícitamente (backfill o "volumen cero, no aplica"), no ignorada por omisión
- [ ] `reportes.ts`/`obtenerPanelEvento()` siguen funcionando igual de bien con el nombre de respaldo `'Etapa eliminada'` para cualquier huérfano histórico que quede sin backfillear
- [ ] `npm run test:api` y `npm run test` en verde
- [ ] `npm run build`/`build:api` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21) implementada, PR #25 abierto pendiente de fusión humana. De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo); el fix de `etapaId` (deuda técnica real, `MEMORY.md` §7) ya ocupa la Tarea 2 por bloquear directamente a #22; Etapas de boletería con cierre automático y Google Calendar (#22) — Media prioridad, candidato natural para la recalculación del motor JIT una vez se fusione y resuelva la Tarea 2 actual.

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
