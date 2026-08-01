# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (01/08/2026):** la Tarea 1 original (andamiaje de Angular) se completó — ver `MEMORY.md` §2 y §9. Se promueve el primer ítem del backlog (tema visual completo) al slot que deja libre, junto a la Tarea 2 (infraestructura) que sigue activa e independiente.

---

## Tarea 1 — [FEATURE]: Tema visual Le Tiende completo y `docs/DESIGN.md`

**Origen:** Backlog #1 (`tech-specs.md` §11 ítem 3) · ADR-006

**Archivos a crear:**
- `docs/DESIGN.md`
- `src/app/core/tema/le-tiende-preset.ts` (ampliar — hoy solo mapea `primary`)

**Qué hacer:**

1. Ampliar `le-tiende-preset.ts`: mapear `secondary` (`#E8630A`), `tertiary` como semantic `success` de PrimeNG (`#00B7A3` — así se usa hoy: "mensajes de éxito, veredicto de boleta válida", `tech-specs.md` §4.4) y `danger` como semantic `danger`/`error` (`#C0392B`), con sus respectivas escalas vía `palette()`. Verificar cada una con el mismo método que la Tarea 1 usó para `primary`: inspeccionar el HTML servido por SSR, no solo mirar el navegador.
2. Escribir `docs/DESIGN.md`. **A diferencia del `DESIGN.md` de Babel (que documenta retrospectivamente componentes ya construidos), el de Ágora es prescriptivo por ahora:** todavía no existen páginas de feature más allá de la de verificación de la Tarea 1, así que este documento establece las clases exactas de Tailwind que las páginas futuras deben usar — copiadas/adaptadas de los patrones ya probados en producción de Babel (`tech-specs.md` §4.4 ya cita los valores exactos: contenedor `min-h-screen bg-surface px-4 py-8`, tarjetas `rounded-2xl bg-white shadow-[0_4px_16px_rgba(35,12,0,0.08)]`, botón primario `h-12 rounded-2xl bg-primary text-neutral uppercase`, inputs `rounded-xl border border-primary/20`). Cubrir también anchos `max-w-*` por tipo de pantalla, variantes de botón (secundario/outline, peligro, grande/pequeño) y tokens de color/tipografía. Cuando se construyan páginas reales (backlog #2 en adelante), `DESIGN.md` se actualiza para documentar desvíos reales, igual que ya hace el de Babel.
3. Documentar explícitamente el **patrón de la pantalla de puerta** (`tech-specs.md` §4.4): alto contraste, veredicto a pantalla completa (`tertiary` = pasa, `danger` = no pasa), tipografía grande, un solo objetivo táctil — es la única pantalla que se aparta del patrón general y merece su propia sección en `DESIGN.md` para que no se pierda ese contexto más adelante.

**Definition of done:**
- [ ] `le-tiende-preset.ts` mapea las 4 escalas semánticas (`primary`, `secondary`, `success`/`tertiary`, `danger`), verificadas por inspección del HTML de SSR (no solo visual)
- [ ] `npm run build -- --configuration=production` sigue sin errores tras el cambio
- [ ] `docs/DESIGN.md` existe y cubre: colores, tipografía, contenedor de página, tarjetas, botones (todas las variantes), inputs, y el patrón especial de la pantalla de puerta
- [ ] Las clases documentadas coinciden exactamente con las ya citadas en `tech-specs.md` §4.4 (no se inventan valores nuevos sin verificar contra Babel)
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (`CLAUDE.md` §6)

---

## Tarea 2 — [FEATURE]: Infraestructura base y CI/CD hacia staging

**Origen:** `PRD.md` §6 (v1, "Bases del proyecto") · `tech-specs.md` §7 y §11 ítem 2 · ADR-001

**Archivos a crear:**
- `serverless.yml`
- `.github/workflows/deploy.yml`
- `server/api/handlers/salud.ts` + `server/tsconfig.json`

**Qué hacer:**

0. **Antes de todo lo demás: leer `docs/advertencia-urgente-costos-aws.md` completo.** Documenta un incidente real de Babel (misma cuenta AWS): US$90,34 en un mes por DynamoDB `PROVISIONED` mal configurado. La regla que se deriva es la de mayor prioridad de esta tarea — ver punto 2.
1. Tomar como plantilla el `serverless.yml` de Babel (`~/Documents/LeTiende/letiende.co/babel/serverless.yml`) y adaptarlo:
   - `service: agora-letiende`, `frameworkVersion: '4'`, `runtime: nodejs24.x`, `region: us-east-1`
   - `package: individually`
   - Bloque `custom.nombresTablas` con las 5 tablas de `tech-specs.md` §5.2, sufijadas con `${sls:stage}`
   - Función `salud` (`GET /api/salud`) y función `ssr` (proxy de todo lo demás) con `@codegenie/serverless-express`
   - Un rol IAM por función, de mínimo privilegio (`CLAUDE.md` §5, A05)
   - **Descripciones de función por debajo de 256 caracteres** — gotcha verificado en producción (`MEMORY.md` §7)
   - `provider.stackTags` y `provider.tags` con `Proyecto: agora` y `Stage: ${sls:stage}` (`tech-specs.md` §7.3) — sin esto no se puede atribuir costo a Ágora en la cuenta compartida
   - `provider.logRetentionInDays: 14` (o el valor que se decida) — nunca dejar el default infinito
   - **Verificar, no asumir, que la plantilla de Babel que se copia ya está en `PAY_PER_REQUEST`:** `grep -n "BillingMode\|ProvisionedThroughput" ~/Documents/LeTiende/letiende.co/babel/serverless.yml` antes de copiar nada de ahí. Confirmado en `PAY_PER_REQUEST` el 01/08/2026 (commit `2ce744a` de Babel, tras el incidente) — pero **reverifica el día que ejecutes esta tarea**, no confíes en esta nota.
2. Declarar en `resources` las 5 tablas DynamoDB **con `BillingMode: PAY_PER_REQUEST` explícito en cada una, sin ningún bloque `ProvisionedThroughput`** (ni en la tabla ni en sus GSIs — CloudFormation falla el despliegue si aparece uno), con TTL en `expiraEn` y Streams activados en `agora-compras` (`tech-specs.md` §5.2, con el snippet YAML exacto). **Esta es la regla de mayor prioridad de toda la tarea** — es la que causó el incidente de Babel.
3. Declarar los dos buckets S3: `agora-comprobantes-{stage}` con **Block Public Access y cifrado SSE-S3**, y `agora-activos-{stage}`. Configurar `maxPreviousDeploymentArtifacts: 5` en `provider.deploymentBucket`.
4. Implementar `server/api/handlers/salud.ts` devolviendo `{ estado: 'ok', stage, version }`.
5. Crear `.github/workflows/deploy.yml` a partir del de Babel, con el flujo de `tech-specs.md` §7.2: build + test en PR, deploy a staging desde PR con smoke test contra `/api/salud`, deploy a producción desde push a `main`. **Incluir los grupos de `concurrency`** (`desplegar-staging` con `cancel-in-progress: true`, `desplegar-produccion` con `false`) — gotcha verificado en producción.
6. Configurar en GitHub los secretos mínimos para desplegar: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY` (`tech-specs.md` §9). **No se genera un usuario IAM nuevo** — se reutiliza el mismo usuario AWS compartido que ya usan Babel y Comandante (ADR-009 en `MEMORY.md`); las credenciales se copian de ahí, según `docs/tareas-a-realizar.md` §2-3. Los secretos de negocio (Firebase, HMAC, SES) se agregan en su propia tarea; `serverless.yml` debe tolerar su ausencia con valor por defecto `''`.
7. Antes de desplegar, ejecutar la auditoría de `CLAUDE.md` (sección "Costos de infraestructura"): `grep -nE "PROVISIONED|ProvisionedThroughput|CapacityUnits|ProvisionedConcurrency|NatGateway|AWS::RDS|AWS::ElastiCache|AWS::OpenSearch" serverless.yml` — cualquier coincidencia se justifica explícitamente o se elimina antes de continuar.

**Definition of done:**
- [ ] `npx serverless package --stage staging` termina sin errores
- [ ] `npx serverless deploy --stage staging` crea el stack y devuelve un endpoint
- [ ] `curl https://{endpoint}/api/salud` devuelve HTTP 200 con `stage: "staging"`
- [ ] Las 5 tablas existen en DynamoDB con el sufijo `-staging`, y `agora-compras` tiene TTL en `expiraEn` y Streams activados (verificado en la consola o con `aws dynamodb describe-table`)
- [ ] **Verificado por CLI, no por lectura del YAML, que las 5 tablas quedaron en `PAY_PER_REQUEST`** tras el despliegue real: `aws dynamodb describe-table --table-name <tabla> --query "Table.BillingModeSummary.BillingMode"` para cada una — debe decir `PAY_PER_REQUEST`, no vacío ni `PROVISIONED`
- [ ] `agora-comprobantes-staging` tiene Block Public Access activado (verificado con `aws s3api get-public-access-block`)
- [ ] El workflow corre en el PR y comenta la URL de staging
- [ ] Cada función tiene su propio **rol de ejecución** IAM, sin `AdministratorAccess` ni comodines sobre `dynamodb:*` en `Resource: "*"` — esto es independiente de que el *usuario* con el que se despliega sí tenga `AdministratorAccess` (ADR-009); lo que este ítem verifica es el rol que la Lambda asume en tiempo de ejecución, no quién la desplegó
- [ ] Ninguna descripción de función supera 256 caracteres
- [ ] `logRetentionInDays` definido, no el default infinito
- [ ] Recursos etiquetados con `Proyecto: agora` (verificable con `aws resourcegroupstaggingapi get-resources`)
- [ ] Ningún NAT Gateway creado; ninguna Lambda en VPC sin justificación escrita
- [ ] Estimación de costo mensual escrita en la descripción del PR, con la fuente de cada precio citado
- [ ] Recordatorio agendado (o anotado en `docs/MEMORY.md` §9) para revisar el costo diario real 48 horas después del despliegue a staging
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (de `tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Autenticación con Google y resolución de roles (`agora-usuarios`)
2. Gestión de usuarios
3. CRUD de eventos
4. Cartelera pública y página de evento (SEO/Open Graph/JSON-LD)
5. Motor de aforo (reserva condicional, TTL, liberación por Streams)
6. Compra y reserva de sillas
7. Carga de comprobante por enlace mágico
8. Aprobación del productor
9. Emisión de boletas con QR firmado
10. Validación en puerta
11. Venta en efectivo
12. QR del evento para afiches
13. Panel de control básico
14. Dominio personalizado `agora.letiende.co`

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

**✅ Lo que bloqueaba las tareas activas de arriba ya está resuelto (01/08/2026):** rama `main` protegida, usuario AWS compartido confirmado (ADR-009), y los secretos `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY` y `FIREBASE_SERVICE_ACCOUNT_AGORA` cargados en GitHub Actions. La Tarea 2 puede desplegar sin bloqueos externos.

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega en cuanto la Tarea 2 genere el endpoint.
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7).

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).
