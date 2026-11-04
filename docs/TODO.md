# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

---

## Tarea 1 — Rastro de auditoría append-only (`CLAUDE.md` §5 A09)

**Prioridad Alta — brecha de seguridad, no funcionalidad nueva.** Encontrada en la revisión de documentación del 04/11/2026 (PR #118) y priorizada por OCM.

**Origen:** A09 exige que cada transición con consecuencia económica quede registrada, con marca de tiempo UTC y actor, en un rastro que nunca se sobrescribe ni se borra. La tabla `agora-auditoria-{stage}` existe desde la infraestructura base (`serverless.yml`, `entidadId` + `ocurridoEn`), pero **ningún código escribe en ella**: está vacía en staging y en producción (`Scan` con `Select: COUNT` = 0, 04/11/2026), ninguna Lambda recibe su nombre por variable de entorno ni tiene permiso IAM sobre ella, y no existe `services/auditoria.ts`. `tech-specs.md` §5.3 la listaba como escrita por cinco Lambdas; ya se corrigió para decir que es el diseño, no el estado actual.

**Lo que sí hay hoy (parcial):** campos sobre ítems que se actualizan (`resueltoPor`/`resueltoEn` en compras, `ingresoPor`/`ingresoEn` y `emitidaEn` en boletas, `creadoPor`/`duplicadoDe` en eventos) y CloudWatch Logs, que vencen según `logRetentionInDays`. Responden "quién aprobó", pero no el historial completo de una compra ni lo que pasó con el aforo, y nada impide sobrescribirlos.

**Alcance:**
- `server/api/services/auditoria.ts`: una sola función, por ejemplo `registrarEventoAuditoria({ entidadId, tipo, actor, datos })`, que arma el ítem y devuelve la operación `Put` con `ConditionExpression: attribute_not_exists(entidadId)`, para poder usarla sola o dentro de una transacción.
- Transiciones a registrar (lista de A09): creación de compra; aprobación y rechazo, con el email de quien resolvió (`aprobaciones.ts`, más el primero que gana entre varios productores); aprobación o rechazo por Bold (`bold-webhook.ts`); emisión de boletas (`boleteria.ts`); ingreso en puerta (`boletas.ts`); venta en efectivo (`ventas-efectivo.ts`); liberación de reserva expirada (`liberar-reservas.ts`); y los movimientos de aforo de `aforo.ts` (reservar, confirmar, devolver).
- `serverless.yml`: variable `TABLA_AUDITORIA` y permiso **solo `dynamodb:PutItem`** sobre esa tabla en las funciones que registran. Nunca `UpdateItem`, `DeleteItem` ni `BatchWriteItem`: el append-only lo hace cumplir IAM, no la disciplina del código.
- El ítem nunca lleva datos personales completos del cliente ni el contenido del comprobante (A09 y Ley 1581): `compraId`, `eventoId`, `boletaId`, cantidad, sillas, monto, estado anterior y nuevo, actor (email del personal, `cliente`, `bold` o `sistema`).

**Decisiones a resolver al implementar:**
1. **¿Registro y transición en la misma transacción?** Hoy ninguna transición usa `TransactWriteItems`: cada una es un solo `UpdateItem` o `PutItem` condicional. Recomendado: transacción donde la transición es una sola escritura (aprobación, validación en puerta, webhook), para que no exista una transición sin su registro. Donde hay varias escrituras encadenadas (compra = aforo + ítem de compra), registrar después de cada escritura que tuvo éxito. Una transacción cuesta el doble de unidades de escritura; con `PAY_PER_REQUEST` y este volumen es insignificante, pero hay que verificar el precio ese día (`CLAUDE.md` §5-bis).
2. **Clave de ordenamiento sin colisiones:** `ocurridoEn` en milisegundos puede repetirse para la misma entidad (por ejemplo, dos boletas emitidas en la misma compra). Recomendado: `ocurridoEn = <ISO 8601>#<uuid corto>`.
3. **Idempotencia frente a reintentos:** DynamoDB Streams entrega *at-least-once*, así que `liberar-reservas` puede procesar dos veces la misma reserva. Hay que decidir si el registro se deduplica con una clave determinista o si se acepta un duplicado inofensivo.
4. **Lo anterior no se reconstruye:** las transiciones previas a esta tarea quedan solo en los campos de los ítems. Nada de relleno retroactivo, que inventaría marcas de tiempo.

**Definición de terminado:** cada transición de la lista deja exactamente un ítem en `agora-auditoria-staging`, verificado contra DynamoDB real y no solo con mocks: un `ConditionExpression` mal escrito solo falla contra la base real (`CLAUDE.md` §7). Pruebas unitarias por handler; una prueba de que ningún ítem incluye teléfono ni correo del cliente; IAM revisado con `aws iam get-role-policy` tras el despliegue; `tech-specs.md` §5.2/§5.3 y `MEMORY.md` §5 actualizados.

---

## Tarea 2 — Presupuesto de AWS propio de Ágora (`CLAUDE.md` §5-bis)

**Prioridad Alta, tarea de infraestructura corta.** Pedida por OCM en la revisión del 04/11/2026.

**Origen:** `CLAUDE.md` §5-bis exige, antes de tener tráfico real, un presupuesto filtrado por la etiqueta `Proyecto: agora` con umbral de ~US$1, para que un error de Ágora no se pierda dentro de los presupuestos compartidos de la cuenta. Ágora lleva en producción desde el 14/08/2026 sin él. Verificado por API el 04/11/2026: la cuenta solo tiene `Costo diario` (US$4/día) y `Costos promedio` (US$10/mes), los dos de cuenta completa.

**Bloqueante encontrado al planear:** el stack `agora-letiende-production` sí lleva la etiqueta `Proyecto: agora`, pero en Billing **la etiqueta `Proyecto` está `Inactive`** como etiqueta de asignación de costos (`ce list-cost-allocation-tags`, 04/11/2026). Mientras siga inactiva, ni Cost Explorer ni un presupuesto pueden filtrar por ella. Activarla no es retroactivo: el costo anterior a la activación queda sin atribuir, y AWS puede tardar hasta 24 h en aplicarla.

**Precio verificado el 04/11/2026** (https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/): monitorear presupuestos y recibir sus alertas no cuesta nada. Solo se cobran los presupuestos *con acciones* a partir del tercero (US$0,10/día cada uno) y los informes programados (US$0,01 por envío). Este presupuesto no usa ni acciones ni informes: **US$0**.

**Alcance:**
1. Activar la etiqueta `Proyecto` en Billing → Cost allocation tags. Es una configuración de toda la cuenta y también sirve a Babel y Comandante (`ce update-cost-allocation-tags-status`).
2. Crear el presupuesto mensual `Ágora` de US$1, filtrado por `Proyecto: agora`, con alertas por correo al 80 % y 100 % del gasto real y al 100 % del pronóstico, igual que los presupuestos existentes.
3. Registrar ambos en `MEMORY.md` §5 y quitar el pendiente de "Pendientes que no son de código".

**Decisión a resolver al implementar:** dónde vive el presupuesto. (a) `AWS::Budgets::Budget` en `serverless.yml`, creado solo en `production` (es un recurso de la cuenta, no de un stage; sin condición, el stack de staging crearía un duplicado). Queda versionado y revisado en el PR. (b) Por CLI o consola, documentado en `MEMORY.md` §5, como se crearon los dos presupuestos de cuenta. Recomendado (a). Antes de elegirla, revisar el gotcha de eliminar stacks de `CLAUDE.md` §5-bis regla 7: el presupuesto desaparecería junto con el stack.

**Definición de terminado:** `aws budgets describe-budgets` muestra el presupuesto con su filtro y sus tres notificaciones; `ce list-cost-allocation-tags` muestra `Proyecto` en `Active`; 48 horas después, Cost Explorer filtrado por `Proyecto: agora` devuelve datos y la cifra queda anotada en `MEMORY.md` §5.

---

## Backlog

- **Notificaciones por WhatsApp (roadmap #20) — 🔒 bloqueada por prerrequisito externo.** Único ítem de v2 pendiente; depende de la Verificación de Negocio de Meta y de un número de teléfono nuevo que no esté en uso en la app de WhatsApp (ver "Pendientes que no son de código"). Sale del motor JIT mientras siga bloqueada y vuelve a un slot en cuanto exista la WABA.
- **v3** (`PRD.md` §6: validación en puerta sin conexión, devoluciones y transferencias, descuentos y cortesías, historial de compras, métricas por temporada): ningún ítem priorizado. Promover uno es **decisión de OCM, no del agente**.

v1 completa (`PRD.md` §6) y el resto de v2 en producción, resumido en `MEMORY.md` §2. Los planes ya cumplidos están en `docs/archivo/`.

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. El paso a paso de los trámites está en `docs/tareas-a-realizar.md` (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

- 🟢 **Alta de la WABA de WhatsApp** (`tareas-a-realizar.md` §8), que desbloquea WhatsApp (Backlog). Conviene arrancarla pronto porque la Verificación de Negocio de Meta es lenta. Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟡 **Revisar la factura real de Ágora** (una vez cerrada la Tarea 2, que activa la etiqueta) con Cost Explorer filtrado por `Proyecto: agora` (`aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4) y confirmar el objetivo de < US$1/mes. Reemplaza los recordatorios de 48 horas que quedaron de agosto (dominio personalizado, SSM, `boldWebhook`).
