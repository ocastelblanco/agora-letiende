# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (12/08/2026, confirmación post-fusión):** el usuario fusionó el PR #26 (fix de `etapaId` estable). La recalculación de tarea ya se había hecho en la sesión anterior, antes de la fusión (mismo criterio ya usado con el PR #25) — esta actualización es solo la confirmación factual de que el merge ocurrió, sin cambio de tarea: Dominio personalizado (Tarea 1) sigue sin empezar, y **Etapas de boletería con cierre automático, interfaz pública** (roadmap #23) sigue siendo la Tarea 2, sin empezar todavía. Bold y WhatsApp siguen bloqueados por prerrequisitos externos no de código, sin cambios. Google Calendar (#22) sigue en el backlog, sin desglosar.

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

## Tarea 2 — [FEATURE]: Etapas de boletería con cierre automático — reflejarlo en la interfaz pública

**Origen:** `PRD.md` §6 roadmap v2 ("Etapas de boletería con cierre automático por fecha", Media) · `tech-specs.md` §11 roadmap **#23** (recién agregado, ver nota de arriba — este ítem nunca tuvo entrada propia, se venía confundiendo con #22/Google Calendar) · depende de #9 (Compra y reserva) y #14 (Venta en efectivo), ambos ya completos.

**Lo que ya funciona (verificado leyendo el código real, no asumido):** el cierre automático **ya está resuelto donde más importa** — `etapaVigente()` en `server/api/handlers/compras.ts:97-100` calcula siempre en el servidor cuál es la etapa vigente según `cierraEn`, y el precio/etapa nunca se aceptan del cliente (`CLAUDE.md` §5 A08). `ComprarComponent` y `VentaEfectivoComponent` ya replican esa misma lógica en el frontend (`etapaVigenteParaMostrar()`, duplicada idéntica en `comprar.component.ts:18-21` y `venta-efectivo.component.ts:17-20`) para mostrar el precio correcto antes de confirmar.

**El gap real:** `DetalleEventoComponent` (`detalle-evento.component.html:26-36`) — la página pública del evento, el primer lugar donde un cliente ve los precios, antes de llegar a "Comprar boletas" — lista **todas** las etapas del evento sin distinguir cuál está vigente ni marcar las que ya cerraron. Un cliente puede ver "Preventa $30.000" ya vencida junto a "General $45.000" sin ninguna señal de cuál aplica, y solo descubre el precio real un paso después, en `ComprarComponent`. Esto no es un bug de dinero (el backend nunca cobra mal), es una inconsistencia de UX que puede sentirse como un engaño de precio.

**Qué hacer:**
1. Extraer la función duplicada `etapaVigenteParaMostrar()` (hoy en `comprar.component.ts` y `venta-efectivo.component.ts`) a un utilitario compartido — sugerido `src/app/shared/utilidades/etapa-vigente.ts`, mismo patrón ya usado por `slugificar.ts`/`fecha-bogota.ts` en la misma carpeta — y que ambos componentes lo consuman en vez de mantener dos copias idénticas.
2. `DetalleEventoComponent` consume ese mismo utilitario para calcular la etapa vigente y actualiza el template: la etapa vigente se destaca visualmente (ej. resaltada o con una etiqueta "Vigente"), y cualquier etapa con `cierraEn` ya pasado se marca como cerrada (ej. atenuada/tachada con etiqueta "Cerrada") — no se oculta del todo, el cliente debe poder ver que existió una preventa más barata, solo que ya no aplica.
3. Revisar si el JSON-LD de `actualizarJsonLd()` (`detalle-evento.component.ts:134-142`, hoy lista las mismas etapas sin filtrar como `offers`) debe ajustarse — decisión de bajo impacto SEO, dejar documentada la decisión tomada, no dejarla sin resolver.
4. `docs/tech-specs.md` §11: ya se agregó el ítem #23 en esta sesión: confirmar que la fila queda correcta una vez la implementación esté lista (archivos reales, no solo el nombre sugerido).

**Definition of done:**
- [x] `DetalleEventoComponent` distingue visualmente la etapa vigente de las etapas ya cerradas — un cliente no ve un precio que ya no aplica sin ninguna indicación (badge "Vigente"/`bg-tertiary`, badge "Cerrada" + atenuado + precio tachado, ninguna etapa se oculta)
- [x] `etapaVigenteParaMostrar()` vive en un solo lugar compartido (`src/app/shared/utilidades/etapa-vigente.ts`), consumido por `ComprarComponent`, `VentaEfectivoComponent` y `DetalleEventoComponent` — cero copias duplicadas de la misma lógica
- [x] El cálculo del precio real en el backend (`etapaVigente()` de `compras.ts`) no se toca — verificado por diff, ningún archivo bajo `server/` cambió
- [x] Decisión sobre el JSON-LD (`offers`) tomada explícitamente: se filtra a solo la etapa vigente (omite `offers` por completo si ninguna está vigente, sin dejar un JSON-LD malformado) — documentado con comentario en el código
- [x] `npm run test` en verde (216/216, sin impacto en `test:api`)
- [x] `npm run build` sin errores
- [x] Todo entregado en una rama con PR abierto — **sin fusionar** (rama `feature/etapas-cierre-automatico-ui`)

**Hallazgo no bloqueante de la verificación, fuera de alcance de esta tarea:** cuando TODAS las etapas de un evento ya cerraron, el botón "Comprar boletas" sigue visible (no depende de si hay etapa vigente), lo que puede llevar al cliente a un total de $0 y un `409` del backend. Comportamiento preexistente, no introducido por este cambio — candidato para una futura tarea del backlog, ver `MEMORY.md` §7.

**Corrección adicional sobre el mismo PR, reportada por el usuario probando con datos reales de staging (12/08/2026):** `etapaVigente()`/`etapaVigenteParaMostrar()` ordenaban las etapas por `orden` (posición manual en el formulario) antes de buscar la primera no cerrada — pero `orden` no siempre coincide con el orden cronológico real de `cierraEn`. Ejemplo real: evento con etapa A (cerrada), B (vigente, `orden` 2) y una etapa C agregada después (`orden` 3, al final del formulario) cuyo `cierraEn` es cronológicamente ANTERIOR al de B — el cálculo saltaba a B en vez de reconocer que C era la vigente real, cobrando el precio equivocado. **Bug de dinero real, no solo de presentación** (verificado por el reviewer: cobraba $60.000 en vez de $45.000 en el escenario de prueba). Corregido ordenando por `cierraEn` cronológico en los tres puntos: `etapaVigente()` (backend, `compras.ts`), `etapaVigenteParaMostrar()` (utilitario compartido) y la tabla pública de `DetalleEventoComponent` (`etapasOrdenadas`, nuevo `computed`). Se propaga gratis a dos consumidores no tocados directamente: `ventas-efectivo.ts` (importa `etapaVigente` de `compras.ts`) y el JSON-LD de `DetalleEventoComponent`. El campo `orden` no se tocó — sigue existiendo, requerido, solo dejó de usarse como criterio de ordenamiento en estos tres lugares. **Fuera de alcance, documentado como hallazgo informativo, no corregido:** `reportes.ts` (`porEtapa`, el reporte XLSX) y el formulario de edición de admin todavía ordenan por posición del arreglo (`orden`) — el usuario no lo reportó para esos dos lugares, candidato a revisar si se vuelve a presentar el mismo patrón de bug ahí.

---

## Backlog

Vacío de ítems v1 (`PRD.md` §6) — Panel de control básico fue el último. Exportación XLSX (roadmap #21), fix de `etapaId` y Etapas de boletería con cierre automático (roadmap #23) **fusionados** (PR #25/#26/#28). De v2 (roadmap #19-22): Bold (#19) y WhatsApp (#20) — **Alta** prioridad pero bloqueados por prerrequisitos externos no de código (ver "Pendientes que no son de código" abajo). Queda sin desglosar: Google Calendar (#22) — Media prioridad, más grande que las tareas del plan de abajo y con una decisión externa pendiente (mecanismo de autenticación contra la API de Calendar).

**⚠️ Prioridad temporal, por delante de lo anterior:** el usuario definió `docs/plan-pre-produccion.md` (8 tareas técnicas, desglosadas de `docs/ajustes-pre-producción.md`) — deben completarse **en su totalidad** antes de cualquier prueba UAT, así que superan en prioridad a Bold/WhatsApp/Google Calendar mientras dure este plan. **El PR #28 ya se fusionó (12/08/2026)** — la Tarea 2 de este documento sigue literalmente describiendo Etapas de cierre automático (ya completada) porque `TODO.md` no se tocó todavía para reflejar esto; la próxima recalculación del motor JIT debe mover ese resumen a `MEMORY.md` §2 y poner **T1 del plan** (ajustes de header/login) como la Tarea 2 nueva. Queda pendiente de confirmar con el usuario si también se pausa la Tarea 1 (Dominio personalizado) para acelerar el plan con ambos slots — no se pausó todavía, ver `MEMORY.md` §9 (sesión del 12/08/2026).

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
