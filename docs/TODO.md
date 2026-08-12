# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (12/08/2026, recalculación completa a pedido del usuario):** con el PR #28 fusionado, Etapas de boletería con cierre automático (roadmap #23) queda completa — se elimina de este documento, su resumen ya vive en `MEMORY.md` §2. El usuario pidió explícitamente que **Dominio personalizado** (Tarea 1 anterior) pase detrás de las tareas de `docs/plan-pre-produccion.md`, para poder usar los **2 slots completos** del motor JIT en ese plan — Dominio personalizado pasa a Backlog, pausada, no eliminada. Las dos tareas activas ahora son **T1** y **T2** de `docs/plan-pre-produccion.md` (Fase 1, ajustes menores de UI — ambas sin dependencias entre sí ni con el resto del plan, listas para ejecutar en paralelo o en cualquier orden). Bold, WhatsApp y Google Calendar siguen en el backlog, sin cambios de fondo.

---

## Tarea 1 — [FEATURE]: Header y login — botón "Ingresar" e vínculo "Cartelera"

**Origen:** `docs/ajustes-pre-producción.md` (documento de negocio de OCM), tabla de ajustes menores, filas "Header" (×2) y "Login" · `docs/plan-pre-produccion.md` Fase 1, T1.

**Alcance:**
- `shared/navegacion/barra-navegacion.component.html`: el botón de texto "Ingresar" (visible sin sesión, línea ~13-18) pasa a ser un *icon button* (ícono de persona/login, sin texto), manteniendo el mismo `routerLink="/login"` y con `aria-label` explícito (sin texto visible, el ícono solo no basta para lectores de pantalla).
- `shared/navegacion/secciones-navegacion.ts`: quitar la entrada `{ etiqueta: 'Cartelera', ruta: '/', rolMinimo: 'portero' }` del arreglo `SECCIONES_NAVEGACION` — deja de aparecer en el menú de usuarios autenticados (el logo del header ya enlaza a `/`, siempre visible). La ruta pública `/` no se toca, sigue existiendo y accesible para cualquiera (autenticado o no) vía URL o logo.
- El botón "Ingresar" del header no debe verse en `/login` (se confunde con "Ingresar con Google", ya presente en esa pantalla).

**Decisión a resolver al implementar, con el código real de `BarraNavegacionComponent`/`app.routes.ts` en pantalla:** cómo sabe el header en qué ruta está para ocultar el botón solo en `/login` — evaluar una señal reactiva sobre `Router.events` (`NavigationEnd`) convertida con `toSignal`, vs. un dato de ruta (`data: { ocultarAccesoEnHeader: true }` en la ruta `/login`) leído vía `ActivatedRoute`. Cualquiera de las dos es válida; elegir la que quede más simple con el patrón ya usado en el componente (que hoy no depende de la ruta actual para nada).

**Verificar tras el cambio:** quitar "Cartelera" del arreglo no debe alterar `rutaDestinoParaRol()` para ningún rol — `portero` ya tiene "Efectivo"/"Puerta" como siguiente sección con `findLast`, así que el destino post-login no cambia. Correr `secciones-navegacion.spec.ts` y agregar un caso si no queda cubierto.

**Archivos:** `barra-navegacion.component.html`/`.ts`/`.spec.ts`, `secciones-navegacion.ts`/`.spec.ts`, `app.routes.ts` (si se opta por `data`).

**Definition of done:**
- [ ] El botón "Ingresar" del header es un *icon button* accesible (`aria-label`), sin texto, en cualquier página sin sesión salvo `/login`
- [ ] "Cartelera" ya no aparece en el menú de un usuario autenticado, para ningún rol
- [ ] `rutaDestinoParaRol()` sigue devolviendo el mismo destino de siempre para los tres roles — verificado con test, no solo revisado a ojo
- [ ] `npm run test` en verde (sin impacto en `test:api`, no se toca backend)
- [ ] `npm run build` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Tarea 2 — [FEATURE]: Selector de cantidad de boletas (compra pública + venta en efectivo)

**Origen:** `docs/ajustes-pre-producción.md`, tabla de ajustes menores, filas "Compra de boletas" y "Venta en efectivo" · `docs/plan-pre-produccion.md` Fase 1, T2.

**Alcance:** en `ComprarComponent` (`comprar.component.html:47-61`) y `VentaEfectivoComponent` (mismo patrón — confirmar líneas reales al implementar, no asumirlas idénticas), reemplazar el `<input type="number" formControlName="cantidad">` por un `<select formControlName="cantidad">` con opciones de `1` hasta `Math.min(evento.maxBoletasPorCompra, evento.sillasDisponibles)`. El texto *helper* pasa de "Máximo {N} por compra" a incluir también las sillas disponibles: `Sillas disponibles: {SILLAS_DISPONIBLES}` (redacción literal del documento de negocio).

**Decisión a resolver al implementar, no en abstracto:** confirmar que el `<select>` nuevo sigue disparando `totalEstimado()`/la validación de `cantidad` sin cambios (el valor sigue siendo un número, solo cambia el control de entrada — no debería requerir tocar los `computed`). Si `sillasDisponibles` o `maxBoletasPorCompra` es `0`, el desplegable queda con cero opciones — confirmar que `puedeComprar()` (`ComprarComponent`) y su equivalente en `VentaEfectivoComponent` ya ocultan el formulario completo en ese caso (probablemente sí, ambos ya condicionan la visibilidad), para que nunca se muestre un `<select>` vacío sin explicación.

**Archivos:** `comprar.component.html`/`.ts`/`.spec.ts`, `venta-efectivo.component.html`/`.ts`/`.spec.ts`.

**Definition of done:**
- [ ] El campo "Cantidad de boletas" es un desplegable de `1` a `min(maxBoletasPorCompra, sillasDisponibles)`, en `ComprarComponent` y en `VentaEfectivoComponent`
- [ ] El texto *helper* muestra tanto el máximo por compra como las sillas disponibles
- [ ] `totalEstimado()`/cálculo equivalente sigue funcionando sin cambios de comportamiento
- [ ] Ningún camino deja ver un `<select>` vacío sin explicación cuando no hay sillas/cupo disponible
- [ ] `npm run test` en verde (sin impacto en `test:api`, no se toca backend)
- [ ] `npm run build` sin errores
- [ ] Todo entregado en una rama con PR abierto — **sin fusionar**

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar/Dominio personalizado mientras dure este plan. Los 2 slots del motor JIT están ahora dedicados a T1/T2 de ese plan (Tarea 1/Tarea 2 activas arriba); las siguientes recalculaciones seguirán sacando T3-T8 en orden, sin volver al roadmap v2 normal hasta agotar el plan.

### Pausada, no eliminada — Dominio personalizado `agora.letiende.co`

A pedido explícito del usuario (12/08/2026): queda detrás de las 8 tareas de `docs/plan-pre-produccion.md`, para poder usar ambos slots del motor JIT en el plan — no bloquea UAT (que corre contra `staging`, sin dominio propio). Especificación completa preservada tal cual, sin resumir, para retomarla sin re-derivar nada cuando el plan esté agotado:

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

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #11 del backlog).
- ✅ `SES_REMITENTE`, `URL_BASE_APP` y `SECRETO_ENLACES_MAGICOS` creados en GitHub (`staging`, 08/08/2026) — el correo con el enlace de comprobante llega correctamente, verificado en vivo por el usuario. Falta confirmar que también existan en el entorno `production` antes del primer despliegue real a producción de una tarea que los use.
- ✅ `SECRETO_FIRMA_BOLETAS` creado en GitHub (`staging` **y** `production`, 09/08/2026) — valores distintos por entorno, generados aleatoriamente (256 bits). Wire-up en `deploy.yml` y en la Lambda que lo consume ya completado como parte de Emisión de boletas (PR #19, `MEMORY.md` §2) — bullet dejado como referencia histórica del secreto, no una tarea pendiente.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
