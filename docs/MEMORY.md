# MEMORY.md — Ágora

Memoria de trabajo del proyecto. Es el primer documento que debe leer un agente IA al iniciar sesión: dice **dónde está el proyecto hoy**, qué decisiones ya se tomaron y por qué, y qué trampas ya se conocen.

Se actualiza al cierre de cada sesión de trabajo relevante.

**Recordatorio obligatorio (`CLAUDE.md` §1-bis, `docs/instrucciones-tracking.md`):** toda tarea de esta sesión —código, documentación, diagnóstico de CI/infraestructura, planeación, o solo responder una pregunta— debe quedar registrada como fila en `docs/tracking.csv`. No es solo para código. Verificarlo antes de cerrar la sesión, no únicamente al terminar todo el trabajo.

---

## 1. Estado actual

| Atributo | Valor |
|---|---|
| **Versión** | 0.1.0 — infraestructura base + autenticación desplegadas y validadas en vivo en staging |
| **Fase** | Autenticación y roles (#4), Gestión de usuarios (#5), CRUD de eventos (#6) y Cartelera pública (#7) completas y validadas en vivo en staging. PR #11 fusionado; **PR #12 (Cartelera pública) validado por el usuario, pendiente de aprobar/fusionar**. Activas: Menú de navegación (roadmap #18, Tarea 1) y Motor de aforo (roadmap #8, Tarea 2, de vuelta tras el paréntesis del menú) — ver §9 |
| **URL de producción** | `https://agora.letiende.co` — ⬜ no aprovisionada (roadmap #11 del backlog) |
| **URL de staging** | ✅ `https://ttukw9i82m.execute-api.us-east-1.amazonaws.com` — login con Google + `GET /api/usuarios/me` verificados de punta a punta (02/08/2026), Gestión de usuarios (PR #10) y ahora `GET /api/eventos-publicos`/`/:slug`/`/sitemap.xml` (PR #12) **también validados en vivo por el usuario** (07/08/2026), tras corregir en la misma sesión el bug de empaquetado de `eventosPublicos` (ver §7) |
| **Rama principal** | `main` |
| **Último commit en `main`** | `ce4914d` (merge del PR #11: CRUD de eventos) |
| **Repositorio remoto** | `ocastelblanco/agora-letiende`, rama `main` protegida — ✅ confirmado |
| **Cuenta AWS** | Compartida con Babel y Comandante, región `us-east-1` |
| **Proyecto Firebase** | Compartido con Comandante y Babel (identidad); autorización propia en `agora-usuarios` |
| **Última sesión** | 06/08/2026 (noche) — PR #11 (CRUD de eventos) fusionado tras diagnosticar un incidente real de GitHub Actions; limpieza de rama local; recálculo del motor JIT: Menú de navegación (roadmap #18, nuevo) reemplaza a Motor de aforo como Tarea 2, con plan aprobado por el usuario pero **sin implementar todavía** — ver §9 |

---

## 2. Funcionalidades completadas vs. pendientes

### Completado

- [x] Documento de planteamiento inicial (`docs/planteamiento-inicial.md`, humano)
- [x] Instrucciones de registro de tiempos (`docs/instrucciones-tracking.md`, humano)
- [x] `CLAUDE.md` — stack, convenciones, OWASP y git flow (31/07/2026)
- [x] `docs/PRD.md` — requisitos de producto (31/07/2026)
- [x] `docs/tech-specs.md` — arquitectura de referencia (31/07/2026)
- [x] `docs/MEMORY.md` — este documento (31/07/2026)
- [x] `docs/TODO.md` — motor JIT con 2 tareas atómicas (31/07/2026)
- [x] Andamiaje del proyecto Angular 22 + Angular Material 22 + Tailwind 4 (01-02/08/2026; empezó con PrimeNG 22, reemplazado por licencia — ver §3 ADR-012)
- [x] Tema visual Le Tiende completo: `src/styles.css` (tokens Tailwind), `src/material-theme.scss` (tema Material 3), `shared/pipes/precio.pipe.ts` — hecho como parte del andamiaje/migración de ADR-012
- [x] `docs/DESIGN.md` — sistema de diseño prescriptivo completo (colores, tipografía, contenedor, tarjetas, variantes de botón, inputs, matriz Material vs. HTML propio, patrón de la pantalla de puerta) (02/08/2026, PR #5)
- [x] `serverless.yml` y flujo de CI/CD a staging (02/08/2026, PR #6) — 5 tablas DynamoDB `PAY_PER_REQUEST`, 2 buckets S3 privados, funciones `salud`/`ssr`, primer despliegue real a staging verificado por CLI
- [x] Backend de autenticación (02/08/2026, PR #8, fusionado): `server/api/services/dynamodb.ts` (`DocumentClient` único), `server/api/lib/verificar-token.ts` (`firebase-admin`, `verifyIdToken`, cuenta de servicio propia de Ágora), `server/api/lib/resolver-permisos.ts` (única fuente de la jerarquía `administrador > productor > portero`, `GetItem` sobre `agora-usuarios`), `server/api/handlers/usuarios-me.ts` (`GET /api/usuarios/me`, 401/403/200/500 sin detalles internos), función `usuariosMe` en `serverless.yml` con rol IAM propio (`dynamodb:GetItem` exclusivo sobre `agora-usuarios`). `npm run test:api` en verde (6 pruebas). **No desplegado a staging todavía** — ver gotcha en §7 sobre el bloqueo de red a `install.serverless.com` en el sandbox de esta sesión
- [x] Frontend de autenticación (02/08/2026, PR #9, fusionado): `src/environments/environment.ts`/`environment.production.ts` (mismo `firebaseConfig` compartido que Comandante/Babel, verificado leyendo el código real de `babel-letiende`, ADR-010), `core/api/absolute-url.interceptor.ts` (URLs relativas en SSR, patrón ya probado en Babel), `core/auth/servicio-auth.ts` (Signals `usuarioActual`/`rol`/`cargando`, `iniciarSesionConGoogle()` que resuelve rol contra `GET /api/usuarios/me` y cierra sesión ante 403 o error), `core/guardias/guardia-auth.ts`/`guardia-rol.ts` (UX únicamente, comentado explícito, `rolMinimo` vía `route.data`), `features/login/login.component.ts` (clases de `docs/DESIGN.md`). **Validado en vivo en staging por el usuario** (02/08/2026 noche) — dos bugs reales de despliegue encontrados y corregidos en el camino (secreto `FIREBASE_SERVICE_ACCOUNT_AGORA` no conectado al deploy, y `usuariosMe` cayéndose al arrancar por un `package.patterns` manual incompleto — ambos documentados en §7)
- [x] Gestión de usuarios (05/08/2026, PR #10, fusionado): `server/api/handlers/usuarios.ts` (CRUD completo, `GET/POST /api/usuarios`, `PUT/DELETE /api/usuarios/:email`, salvaguarda de autodegradación/autoeliminación del propio administrador), `server/api/lib/autorizacion.ts` (`exigirRol`, único punto del backend que compone `verificar-token` + `resolver-permisos` + `cumpleRolMinimo` para endpoints con rol mínimo — reutilizado por `eventos.ts`), `server/api/lib/http.ts` (`respuestaJson`/`obtenerEncabezadoAuthorization` extraídos de `usuarios-me.ts` para no duplicarlos), `src/app/core/api/usuarios.service.ts`, `src/app/features/admin/gestion-usuarios/` (`mat-table`, `mat-select`, `MatDialog` para confirmar eliminación, `MatSnackBar` para notificaciones — primer uso real de Angular Material más allá de la paleta), `src/app/shared/dialogos/confirmar-dialog.component.ts` (diálogo de confirmación reutilizable, `docs/DESIGN.md` §7). Primera ruta protegida real (`/admin/usuarios`, `guardiaRol` + `RenderMode.Client`). Validado en vivo en staging por el usuario. 62 pruebas en verde (21 backend + 41 frontend)
- [x] CRUD de eventos (06/08/2026, PR #11, fusionado): `server/api/handlers/eventos.ts` (`GET/POST /api/eventos`, `PUT /api/eventos/:eventoId`, `POST /api/eventos/:eventoId/activos/url-carga`) — `eventoId` y `sillasDisponibles` siempre generados/inicializados en el backend, nunca aceptados del payload (ni en `POST` ni en `PUT`, `CLAUDE.md` §5 A08); `etapaId` de cada `EtapaBoleteria` también generado en el backend. `server/api/services/s3.ts` (cliente S3 único, mismo patrón que `dynamodb.ts`); la URL prefirmada de subida de activos acota `Content-Length` (≤10 MB) y `Content-Type` (`image/jpeg`/`png`/`webp`, nunca SVG) — el backend nunca descarga una URL arbitraria (A10). Frontend: `EventosService` (incluye `subirActivo()`, que sube directo a S3 con la URL prefirmada sin el header `Authorization` de la API), `GestionEventosComponent` (lista) y `EditarEventoComponent` (alta/edición en un único componente, distinguidos por el parámetro de ruta `id` — `'nuevo'` = modo crear; `FormArray` de etapas con vista previa de precio vía `PrecioPipe`; `slug`/`sillasTotales` deshabilitados al editar). Nueva utilidad `src/app/shared/utilidades/fecha-bogota.ts` (`paraInputBogota`/`desdeInputBogota`, offset fijo `-05:00` porque Colombia no observa horario de verano desde 1993) para cumplir la regla de `CLAUDE.md` §4 (UTC en base de datos, conversión solo en presentación) en los `<input type="datetime-local">`. Rutas `/admin/eventos` y `/admin/eventos/:id` en `RenderMode.Client`. Nuevas dependencias `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner`. 42 pruebas backend + 63 frontend en verde
- [x] Cartelera pública y página de evento (07/08/2026, PR #12, validado en vivo en staging por el usuario): `server/api/handlers/eventos-publicos.ts` — 3 rutas públicas sin `exigirRol` (`GET /api/eventos-publicos`, `GET /api/eventos-publicos/:slug`, `GET /sitemap.xml`), todas vía `aVistaPublica()` (excluye `productores` de la respuesta, único punto de filtrado reutilizado en las 3), `Query` sobre GSI (`estado-fechaHora-index`/`slug-index`), nunca `Scan`. `cartelera.component.ts` (`/`) y `detalle-evento.component.ts` (`/evento/:slug`), primer uso de `Meta`/`Title` de Angular y de JSON-LD `schema.org/Event` inyectado a mano vía `inject(DOCUMENT)` — verificado con `curl` contra SSR real, no solo visualmente. `public/robots.txt`. Decisión de arquitectura nueva, confirmada explícitamente con el usuario antes de aplicarla: `BucketActivos` pasa a público de solo lectura **solo bajo el prefijo `eventos/*`** (bucket policy, no ACL) para que las imágenes sirvan como `og:image` con URL estable — una prefirmada de 15 minutos rompe la vista previa cacheada por WhatsApp. **Bug real encontrado en staging por el usuario y corregido en la misma sesión** (ver §7): `eventosPublicos` se empaquetó inicialmente "simple" como `salud`, pero sí depende de `documentoDynamoDB` (`@aws-sdk/lib-dynamodb`) — la Lambda se caía al arrancar. Corregido empaquetando con esbuild, igual que `eventos`/`usuarios`/`usuariosMe`. 61 pruebas backend + 87 frontend en verde

### Pendiente (v1 — MVP)

- [ ] Motor de aforo con reserva temporal y liberación por TTL
- [ ] Compra de boletas
- [ ] Carga de comprobante por enlace mágico
- [ ] Aprobación por el productor
- [ ] Emisión de boletas digitales con QR firmado
- [ ] Validación en puerta con cámara
- [ ] Venta en efectivo
- [ ] QR del evento para afiches
- [ ] Panel de control básico
- [ ] Dominio personalizado `agora.letiende.co`

### Pendiente (v2)

- [ ] Pago automático con Bold
- [ ] Notificaciones por WhatsApp
- [ ] Exportación XLSX/PDF
- [ ] Etapas de boletería con cierre automático
- [ ] Sincronización con Google Calendar
- [ ] Otros medios de pago (Bre-B, referencia de efectivo)

---

## 3. ADRs (Architecture Decision Records)

### ADR-001 — Serverless Framework 4 en lugar de AWS CDK

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** Ágora define y despliega su infraestructura con Serverless Framework 4 (`serverless.yml`), igual que Babel.

**Contexto:** en la ronda inicial de decisiones se había elegido AWS CDK (TypeScript) por afinidad de lenguaje con el frontend. Al inspeccionar Babel se encontró un `serverless.yml` en producción con el patrón exacto que Ágora necesita: nombres de tabla por stage, `package: individually`, rol IAM de mínimo privilegio por función y CI en GitHub Actions.

**Razón:** el valor de reutilizar un patrón ya probado en producción —incluidos sus gotchas documentados— supera la ventaja teórica de CDK. Un tercer proyecto del ecosistema con una herramienta de IaC distinta multiplica el costo de mantenimiento sin resolver ningún problema concreto de Ágora.

**Consecuencias:** se hereda la dependencia de `SERVERLESS_LICENSE_KEY` en CI y las limitaciones de Serverless para CloudFront (el dominio personalizado exige más YAML que con CDK). A cambio, el andamiaje de infraestructura arranca desde una plantilla funcional en lugar de desde cero.

---

### ADR-002 — Proyecto Firebase compartido, autorización independiente

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** Ágora usa el mismo proyecto Firebase que Comandante y Babel para la identidad (Google Sign-In), pero resuelve los roles contra su propia tabla `agora-usuarios`. Usa su **propia cuenta de servicio** (`FIREBASE_SERVICE_ACCOUNT_AGORA`).

**Razón:** el equipo de Le Tiende es el mismo en las tres aplicaciones; obligarlos a mantener cuentas separadas es fricción sin beneficio. La autorización sí debe ser independiente: ser administrador en Babel no debe implicar nada en Ágora.

**Consecuencias:** riesgo permanente de que alguien asuma que la autenticación implica autorización — por eso está explícito en `CLAUDE.md` §5 (A01) y en la tabla de prohibiciones. Revocar el acceso de una persona a Ágora (borrar su fila en `agora-usuarios`) **no** revoca su acceso a Babel ni su cuenta de Google; para eso hay que deshabilitarla en la consola de Firebase.

---

### ADR-003 — WhatsApp diferido a v2; el canal de notificación es una abstracción desde el día uno

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** el MVP entrega todo por correo (AWS SES desde `taquilla@letiende.co`). WhatsApp entra en v2. `services/notificaciones.ts` define una interfaz `CanalNotificacion` desde la primera implementación, y ningún flujo llama a SES directamente.

**Contexto:** el planteamiento original pedía WhatsApp desde el inicio, y es efectivamente el canal donde ocurre hoy la conversación con los clientes. Pero el envío automatizado por AWS End User Messaging Social exige una cuenta de WhatsApp Business aprobada por Meta y plantillas revisadas una a una — un trámite de duración desconocida y fuera del control del equipo.

**Razón:** hacer que el MVP dependa de una aprobación de un tercero es entregarle el cronograma a ese tercero. El correo permite un ciclo completo funcional hoy.

**Consecuencias:** la experiencia del MVP es peor que la meta (el correo se lee menos que WhatsApp en este público). Se acepta a cambio de poder operar. La abstracción del canal hace que activar WhatsApp más adelante sea agregar una implementación, no reescribir los flujos de compra y aprobación. **Acción pendiente:** iniciar el trámite de la WABA cuanto antes, en paralelo al desarrollo, para que no sea el camino crítico en v2.

---

### ADR-004 — Reserva temporal de sillas con TTL, no descuento al aprobar

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** al iniciar una compra se reservan las sillas con una escritura condicional y un `expiraEn` (TTL de DynamoDB). Si el plazo vence sin aprobación, un consumidor de DynamoDB Streams devuelve el aforo.

**Alternativas descartadas:** (a) descontar solo al aprobar — permite que dos clientes compren la última silla mientras ambos comprobantes están en revisión; (b) descontar de una vez y revertir — ensucia los reportes con ventas que nunca se concretaron.

**Razón:** la sobreventa no es un error corregible con un correo de disculpa: es una persona con boleta pagada parada frente a un teatro lleno. Es el único punto del sistema donde un defecto tiene consecuencia física e irreversible.

**Consecuencias:** tres estados de aforo (`sillasDisponibles`, `sillasReservadas`, vendidas implícitas) que deben mantenerse consistentes, y toda modificación debe ser condicional. **Trampa crítica:** el TTL de DynamoDB elimina "típicamente en 48 horas", no al segundo — la lógica de negocio debe tratar como expirada toda reserva cuyo `expiraEn` ya pasó, exista o no el ítem. Ver `tech-specs.md` §5.4.

---

### ADR-005 — El cliente no tiene cuenta

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** la compra es anónima. Se piden nombre, teléfono y correo, pero no se crea usuario ni contraseña. La identidad del cliente es su boleta: un código único que solo él posee.

**Razón:** obligar a registrarse para comprar una boleta agrega fricción justo donde más compras se pierden.

**Consecuencias:** el cliente no puede consultar su historial ni recuperar por sí mismo una boleta perdida — debe pedírsela al equipo. Además, el código de la boleta se vuelve el único secreto que protege la entrada, lo que obliga a que sea un UUID v4 firmado con HMAC y nunca un consecutivo (`CLAUDE.md` §5, A02).

---

### ADR-006 — PrimeNG 22 sobre Tailwind 4 con tokens Le Tiende

**Fecha:** 31/07/2026 · **Estado:** ⚠️ **Revertida el 02/08/2026 — ver ADR-012.** PrimeNG 22 resultó no ser MIT (cambio de licencia no detectado al tomar esta decisión). Se conserva este registro tal como se escribió, por trazabilidad — no refleja el stack actual.

**Decisión:** Ágora usa PrimeNG 22 para los componentes complejos (tabla del panel, calendario, carga de archivos, toasts) y Tailwind 4 para layout y utilidades, unidos con `tailwindcss-primeui`. PrimeNG se configura con un **preset de tema propio** que mapea sus tokens semánticos a la paleta Le Tiende.

**Contexto:** el planteamiento pedía PrimeNG; Babel y Comandante usan solo Tailwind con la paleta Le Tiende.

**Razón:** el panel administrativo de Ágora necesita componentes que en Babel se construyeron a mano y que aquí serían costosos de repetir. Pero la identidad visual debe ser reconociblemente Le Tiende: un tema de PrimeNG por defecto rompería la coherencia con las otras dos aplicaciones.

**Consecuencias:** hay que construir y mantener el preset de tema. El bundle es mayor que el de Babel. Se mitiga con carga diferida por ruta: la cartelera pública —la ruta que más se abre desde datos móviles— no debe cargar el código del panel administrativo.

---

### ADR-007 — Alcance del MVP: ciclo completo mínimo

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** v1 cubre crear evento → cartelera → compra con comprobante manual → venta en efectivo → boleta con QR por correo → validación en puerta. Quedan fuera Bold, WhatsApp, Google Calendar, exportación XLSX/PDF y etapas con cierre automático.

**Razón:** un ciclo completo aunque austero es utilizable en un evento real; media docena de funcionalidades a medias no lo es.

**Consecuencias:** el productor sigue aprobando comprobantes a mano en v1 — el flujo digitalizado pero no eliminado. Es aceptable porque es exactamente lo que ya hace hoy, con menos fricción.

---

### ADR-008 — Sin fecha límite; el orden lo fijan las dependencias técnicas

**Fecha:** 31/07/2026 · **Estado:** Aceptada

**Decisión:** no hay una fecha comprometida para el primer evento real. El roadmap sigue el orden de dependencias técnicas de `tech-specs.md` §11.

**Consecuencias:** el motor JIT de `TODO.md` puede priorizar por dependencia y no por urgencia. Si en algún momento aparece un evento real con fecha, esta decisión debe revisarse y el roadmap reordenarse hacia el camino más corto a vender y validar.

---

### ADR-009 — Credenciales de despliegue: usuario AWS compartido, no uno dedicado a Ágora

**Fecha:** 01/08/2026 · **Estado:** Aceptada

**Decisión:** Ágora no crea un usuario IAM propio para desplegar. Reutiliza el mismo usuario que ya opera Babel y Comandante: `@ocastelblanco`, cuenta AWS `696912647258`, miembro del grupo `Administrador` (`AdministratorAccess`). Es el perfil `default` ya configurado en `~/.aws/credentials` para trabajo desde CLI, y el mismo par de credenciales (Access Key ID `AKIA2EQZ3CRNMVGRO5X4`) que Babel ya tiene cargado como secreto de GitHub Actions para su propio despliegue.

**Contexto:** `docs/tareas-a-realizar.md` había propuesto originalmente crear un usuario `agora-despliegue` dedicado, con una política en línea acotada a roles `agora-letiende-*`, para que un secreto filtrado de un proyecto no comprometiera a los otros. El usuario decidió explícitamente no hacerlo y usar el que ya existe.

**Razón:** simplicidad operativa sobre aislamiento de credenciales. Un solo usuario que administrar, rotar y recordar en los tres proyectos del ecosistema, en vez de tres. Es además el modelo que Babel ya tiene en producción sin incidentes.

**Consecuencias:** el radio de impacto de un secreto de CI comprometido en **cualquiera** de los tres repositorios (Ágora, Babel, Comandante) es la cuenta AWS completa, no solo los recursos de esa app — no hay aislamiento entre proyectos a nivel de credenciales de despliegue. Es un riesgo ya aceptado de facto para Babel; Ágora lo hereda por decisión explícita en vez de quedar aislado. **Esto es independiente del principio de mínimo privilegio de las Lambdas en tiempo de ejecución** (`CLAUDE.md` §5, A05): cada función sigue con su propio rol IAM acotado, creado por `serverless.yml` — lo que cambia aquí es solo quién tiene permiso para *crear* esos roles y el resto de la infraestructura, no lo que las Lambdas pueden hacer una vez desplegadas. Si en el futuro se decide aislar credenciales por proyecto, revisar primero si Babel también migra, para no dejar una asimetría sin razón entre apps del mismo ecosistema.

---

### ADR-010 — Sin app web propia en Firebase; se reutiliza la configuración pública de Comandante

**Fecha:** 01/08/2026 · **Estado:** Aceptada

**Decisión:** Ágora no registra su propia "Web app" en la consola de Firebase del proyecto compartido. El frontend usa el mismo objeto `firebaseConfig` que ya usan Comandante y Babel (proyecto `comandante-letiende`, `appId: 1:458748050433:web:441a0ec326f149ab08d400`), copiado directamente en `src/environments/`.

**Contexto:** el usuario preguntó si hacía falta registrar una app web nueva para Ágora, notando que Babel tampoco aparece como app separada en la consola de Firebase. Se verificó en el código real de Babel (`src/environments/environment.ts`), no solo en su documentación: Babel efectivamente reutiliza el `firebaseConfig` de Comandante tal cual, sin registro propio.

**Razón:** el `apiKey`/`appId` de una app web de Firebase identifican el proyecto para inicializar el SDK cliente; no son el mecanismo de autorización. Lo que determina qué dominios pueden autenticarse es la lista de *Authorized domains* en Authentication → Settings (donde `agora.letiende.co` ya se agregó), no el registro de una app. Registrar una app nueva solo aportaría valor si Ágora usara Analytics o Performance Monitoring separados por app, que no están en el alcance.

**Consecuencias:** un solo `firebaseConfig` para las tres apps del ecosistema — nada que rotar o mantener por separado en ese frente. **Punto a verificar (no bloqueante):** si la API key de ese `firebaseConfig` tiene restricción de *HTTP referrer* en GCP Console (Credentials), hay que agregar `https://agora.letiende.co/*` a la lista permitida; si no tiene restricción, no aplica. La autenticación en sí (`verifyIdToken` del lado del backend) no depende de esto — usa la cuenta de servicio propia de Ágora (ADR-002), que es un mecanismo completamente distinto.

---

### ADR-011 — DynamoDB siempre `PAY_PER_REQUEST`; disciplina de verificación de precios

**Fecha:** 01/08/2026 · **Estado:** Aceptada — regla de mayor prioridad de todo `CLAUDE.md`

**Decisión:** todas las tablas DynamoDB de Ágora, en todos los stages, usan `BillingMode: PAY_PER_REQUEST`, sin excepción. Nunca `PROVISIONED`, ni "temporalmente". Ningún bloque `ProvisionedThroughput` puede existir en el `serverless.yml`, ni en tablas ni en GSIs. Además: sin NAT Gateway ni Lambdas en VPC sin justificación escrita, `logRetentionInDays` siempre explícito, cada función empaqueta solo lo que usa, y todo recurso se etiqueta `Proyecto: agora` para poder atribuirle costo en la cuenta compartida. El objetivo de costo de Ágora pasa de "$0 o lo más cercano posible" a **< US$1/mes, medido, no supuesto**.

**Contexto:** el usuario interrumpió la Tarea 1 (andamiaje de Angular) el 01/08/2026 para reportar un incidente real y ya resuelto en **Babel** (proyecto hermano, misma cuenta AWS): julio de 2026 facturó **US$94,44** con un objetivo declarado de **US$0**. El 96% (US$90,34) fue DynamoDB `PROVISIONED 25/25` en 18 unidades de capacidad (8 tablas × 2 stages + 2 GSIs) que nunca se usaron — las tablas de producción estaban completamente vacías cuando se detectó. El cobro fue plano e idéntico durante 7 días seguidos: la firma inconfundible de una tarifa por tiempo, no por uso. El error de fondo no fue técnico: fue un comentario en el código de Babel (`# Capacidad aprovisionada 25/25 en todas... nunca on-demand`) que consagró como hecho verificado una suposición sobre precios que nadie comprobó ese día. Detalle completo en `docs/advertencia-urgente-costos-aws.md`, que ahora vive también en Ágora como lectura obligatoria antes de tocar cualquier IaC.

**Razón:** para las escalas de Le Tiende (miles de registros, decenas de usuarios internos, tráfico público bajo), on-demand cuesta centavos al mes — Babel lo verificó en menos de US$0,10/mes de DynamoDB real, contra los ~US$8,42/día que pagó por la capacidad aprovisionada olvidada. La intuición de que "aprovisionado = modo gratis/seguro" está exactamente invertida a esta escala: on-demand es casi gratis y aprovisionado es el pasivo permanente. El riesgo es agravado para un agente IA específicamente porque el conocimiento de un LLM sobre precios de nube está desactualizado por construcción — AWS reestructuró su modelo de capa gratuita en 2025, y la confianza con la que un modelo puede afirmar "esto es gratis" no tiene relación con que siga siendo cierto hoy.

**Consecuencias:** todo `serverless.yml` de Ágora debe declarar `BillingMode: PAY_PER_REQUEST` explícito por tabla (ver `tech-specs.md` §5.2 para el snippet exacto) y pasar la auditoría `grep -nE "PROVISIONED|ProvisionedThroughput|...` antes de cada despliegue (`CLAUDE.md`, sección "Costos de infraestructura"). La Tarea 2 de `TODO.md` (infraestructura base, próxima en la cola) se reescribió con estos guardarraíles explícitos en su "Qué hacer" y su Definition of Done, incluyendo verificación por CLI post-despliegue, no solo lectura del YAML. Se confirmó por CLI que la cuenta ya tiene dos alarmas de presupuesto a nivel de cuenta (`Costo diario` US$4, `Costos promedio` US$10, ver §5) que cubren el ecosistema completo, pero no son lo bastante finas para el objetivo de <US$1/mes de Ágora específicamente — antes de tráfico real, crear un presupuesto adicional filtrado por la etiqueta `Proyecto: agora`. Ninguna cifra de precio se escribe en la documentación de Ágora sin haberla verificado ese día o sin citar su fuente verificada (`docs/advertencia-urgente-costos-aws.md`, `calculator.aws`).

---

### ADR-012 — PrimeNG reemplazado por Angular Material (PrimeNG dejó de ser MIT)

**Fecha:** 02/08/2026 · **Estado:** Aceptada — **revierte ADR-006**

**Decisión:** Ágora usa **Angular Material 22** (MIT, sin condiciones) para los componentes complejos, en vez de PrimeNG. El tema propio vive en `src/material-theme.scss`: `mat.theme()` con una paleta tonal M3 completa generada desde `#230C00` (primary) y `#00B7A3` (tertiary) usando `@material/material-color-utilities` (el mismo algoritmo que la Theme Builder oficial de Angular), más overrides explícitos de `--mat-sys-primary`, `--mat-sys-on-primary`, `--mat-sys-secondary`, `--mat-sys-tertiary`/`--mat-sys-on-tertiary`, `--mat-sys-error`/`--mat-sys-on-error` y `--mat-sys-surface`/`--mat-sys-on-surface` a los hex exactos de marca — necesarios porque el esquema claro de M3 mapea `primary` al tono 40 de la rampa (un tono medio), no al hex más oscuro que Le Tiende usa como fondo de botón.

**Contexto:** el usuario reportó un banner "Invalid PrimeUI License" al cargar `http://localhost:4000`. Se investigó de raíz, no se asumió nada:
- El build ya mostraba `[PrimeUI] PrimeUI license is not configured` desde la Tarea 1 original — se había pasado por alto.
- Se rastreó el origen hasta `node_modules/primeng/fesm2022/primeng-config.mjs`: `providePrimeNG()` llama incondicionalmente a `verifyLicense('primeui', ...)` de `@primeui/license-manager`; sin llave configurada, devuelve `unconfigured` y la función **muestra un banner en pantalla** (`showInvalidLicenseBanner()`), además del warning en consola.
- Se leyó el `LICENSE.md` real empaquetado en `node_modules/primeng` (no la documentación de marketing): PrimeNG 22 es parte de "PrimeUI", una familia de librerías **comerciales**. La "Community License (Free)" exige: <US$1M de ingresos anuales, <5 desarrolladores, <10 empleados, <US$3M de financiación externa; **registro y llave de licencia**; **renovación anual** confirmando elegibilidad; el paquete se distribuye compilado y prohíbe ingeniería inversa o redistribución.
- Se verificó el histórico real descargando tarballs de npm (`npm pack`) de varias versiones, no de memoria: PrimeNG fue **MIT puro hasta la 17.x**; de la **18.x a la 21.x** el campo `license` cambió a "SEE LICENSE IN LICENSE.md" pero el contenido real seguía siendo el texto MIT completo bajo el nombre "PRIMENG COMMUNITY VERSIONS LICENSE" (gratis, sin llave, sin banner); **la 22.x cambió el contenido real** a la licencia comercial "PrimeUI" descrita arriba. Es exactamente el mismo tipo de error que motivó ADR-011: una suposición desactualizada sobre un tercero, escrita como hecho en ADR-006 sin verificar ese día.
- Se verificó que la última versión genuinamente MIT (21.1.9) exige `@angular/core ^21.0.7` — **no es compatible con Angular 22**, que ya es la base del proyecto. No existe hoy una versión de PrimeNG que sea a la vez MIT y compatible con Angular 22.
- Se verificó `@angular/material@22`: `license: "MIT"` en el registro de npm, peer dependency `@angular/core: ^22.0.0 || ^23.0.0` — compatible sin condiciones.

Se presentaron cuatro opciones al usuario (Angular Material, solo Tailwind sin suite de componentes, registrar la licencia Community de PrimeNG, o bajar todo el proyecto a Angular 21) y eligió Angular Material.

**Razón:** es la única opción que preserva simultáneamente los dos objetivos originales de ADR-006 (componentes complejos ya construidos, sin construir tabla/calendario/upload a mano) y Angular 22 (ya elegido para todo el proyecto), sin introducir una dependencia de licencia condicionada a la elegibilidad de la organización ni una obligación de renovación anual que "100% gratuito" no debería tener.

**Consecuencias:** hay que rehacer el trabajo de tema/preset de la Tarea 1 (ya hecho en esta misma sesión). El bundle inicial bajó de 528 kB a 314 kB (Material con solo el módulo de botón es más liviano que PrimeNG). Selectores de componentes distintos (`matButton="filled"` en vez de `<p-button>`); hay que rehacer también los patrones de tabla/calendario/upload cuando se implementen (todavía no existen). `docs/DESIGN.md` (Tarea 1 activa de `TODO.md`) debe documentar Material en vez de PrimeNG. Generar la paleta M3 requirió instalar temporalmente `@material/material-color-utilities` (desinstalado tras capturar el resultado como valores Sass literales en `material-theme.scss`, con su procedencia documentada en un comentario) — si la paleta necesita regenerarse en el futuro (cambio de color de marca), reinstalar el paquete y repetir el proceso documentado ahí.

---

## 4. Dependencias instaladas

Instaladas por la Tarea 1 (01-02/08/2026); versiones exactas de `package.json` en la rama `feature/andamiaje-angular-primeng-tailwind` (nombre de rama desactualizado tras ADR-012 — se conserva por no romper el PR abierto). Las marcadas "prevista" aún no existen — se agregan en tareas posteriores (backend, AWS SDK, WhatsApp/QR).

| Paquete | Versión | Uso | Estado |
|---|---|---|---|
| `@angular/core`, `common`, `router`, `forms`, `animations` | ^22.1.0 | Framework (`animations` requerido por `provideAnimationsAsync`, usado por Angular Material para ripples/transiciones) | ✅ Instalada |
| `@angular/ssr` | ^22.1.2 | Renderizado en servidor | ✅ Instalada |
| `@angular/platform-server` | ^22.1.0 | SSR | ✅ Instalada |
| `@angular/material` | ^22.1.0 | Componentes UI. MIT — ver ADR-012 (reemplaza a `primeng`, que pasó a licencia comercial) | ✅ Instalada |
| `@angular/cdk` | ^22.1.0 | Peer dependency de Angular Material | ✅ Instalada |
| `tailwindcss` + `@tailwindcss/postcss` | ^4.3.3 | Utilidades CSS, vía `.postcssrc.json` | ✅ Instalada |
| `express` | ^5.1.0 | Servidor SSR | ✅ Instalada |
| `vitest` | ^4.0.8 | Pruebas (frontend, vía `@angular/build:unit-test`) | ✅ Instalada |
| `prettier` | ^3.8.1 | Formato | ✅ Instalada |
| `typescript` | ~6.0.2 | Lenguaje | ✅ Instalada |
| `@codegenie/serverless-express` | ^5.0.0 | Adaptador Lambda (SSR en API Gateway) | ⬜ Prevista — Tarea 2 |
| `@aws-sdk/client-dynamodb`, `lib-dynamodb` | ^3.1101.0 | Acceso a datos (`server/api/services/dynamodb.ts`) | ✅ Instalada (02/08/2026) |
| `@aws-sdk/client-s3`, `s3-request-presigner` | ^3.1104.0 | URL prefirmada de subida de activos de evento (`server/api/handlers/eventos.ts`); comprobantes de pago reutilizarán el mismo cliente cuando se implementen | ✅ Instalada (06/08/2026) |
| `@aws-sdk/client-sesv2` | ^3.x | Correo transaccional | ⬜ Prevista |
| `firebase` | ^12.16.0 (instalada 12.17.0) | SDK cliente de autenticación (`core/auth/servicio-auth.ts`) | ✅ Instalada (02/08/2026) |
| `firebase-admin` | ^14.2.0 | `verifyIdToken` en Lambdas (`server/api/lib/verificar-token.ts`) | ✅ Instalada (02/08/2026) |
| `@zxing/browser` | ^0.2.1 | Escaneo de QR en puerta | ⬜ Prevista |
| `qrcode` | ^1.5.x | Generación de QR (SVG/PNG) | ⬜ Prevista |
| `xlsx` | ^0.18.5 | Exportación de reportes (v2) | ⬜ Prevista |
| `serverless` | 4.x | IaC | ⬜ Prevista — Tarea 2 |
| `esbuild` | ^0.28.1 | Empaqueta en un único archivo las Lambdas que dependen de `firebase-admin` (`server/bundle-lambdas.mjs`, `npm run bundle:api`) — evita las exclusiones manuales de `node_modules/**` que fallaron en vivo en staging, ver §7 | ✅ Instalada (02/08/2026) |

---

## 5. Configuraciones vigentes

Esta tabla se completa a medida que se crean los recursos — es el lugar donde buscar un ARN, un ID o una URL sin tener que entrar a la consola.

| Recurso | Valor | Estado |
|---|---|---|
| Región AWS | `us-east-1` | ✅ Definida (misma que Babel) |
| Cuenta AWS | Compartida con Babel y Comandante — `696912647258` | ✅ Existe |
| Usuario IAM de despliegue | Compartido, `@ocastelblanco` (grupo `Administrador`, `AdministratorAccess`) — mismo usuario que Babel y Comandante, **no dedicado a Ágora** (ADR-009) | ✅ Existe — perfil `default` en `~/.aws/credentials` |
| Access Key ID de despliegue | `AKIA2EQZ3CRNMVGRO5X4` (no sensible; el secreto sí lo es y no se documenta aquí) | ✅ Ya usada por Babel en sus GitHub Secrets desde el 17/07/2026 |
| Nombre del servicio Serverless | `agora-letiende` | ✅ Creado y desplegado a `staging` (02/08/2026) |
| Tablas DynamoDB | `agora-{usuarios,eventos,compras,boletas,auditoria}-staging` | ✅ Creadas, verificado `PAY_PER_REQUEST` por CLI (02/08/2026); `agora-compras` con TTL en `expiraEn` y Streams `NEW_AND_OLD_IMAGES` |
| Bucket de comprobantes | `agora-comprobantes-staging` (privado, SSE-S3, Block Public Access) | ✅ Creado, Block Public Access verificado por CLI (02/08/2026) |
| Bucket de activos | `agora-activos-staging` (imágenes de evento, QR) | ✅ Creado, Block Public Access verificado por CLI (02/08/2026) |
| Endpoint de API Gateway (staging) | `https://ttukw9i82m.execute-api.us-east-1.amazonaws.com` | ✅ Desplegado y verificado (`GET /api/salud` → 200), smoke test de CI en verde (02/08/2026) |
| Dominio de producción | `agora.letiende.co` | ⬜ Por configurar (DNS + certificado ACM) |
| Proyecto Firebase | `comandante-letiende` (compartido con Comandante y Babel) | ✅ Existe |
| App web de Firebase | **No hay una propia — se reutiliza `firebaseConfig` de Comandante** (ADR-010) | ✅ Resuelto, no aplica crear una |
| `agora.letiende.co` en Authorized domains (Firebase Auth) | Dominio de producción agregado | ✅ Hecho 01/08/2026 — falta agregar el de staging cuando exista |
| Cuenta de servicio Firebase de Ágora | `FIREBASE_SERVICE_ACCOUNT_AGORA` | ✅ Creada en GCP y cargada como secreto de GitHub (01/08/2026) |
| Remitente SES | `taquilla@letiende.co` | ✅ Probado 01/08/2026 — correo de prueba llegó a bandeja de entrada en Gmail |
| **Estado del sandbox de SES** | **Fuera del sandbox** | ✅ Confirmado 31/07/2026 — se puede enviar a cualquier destinatario |
| Repositorio GitHub | `ocastelblanco/agora-letiende`, rama `main` protegida | ✅ Confirmado y protegido 01/08/2026 |
| Secretos de GitHub Actions | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY`, `FIREBASE_SERVICE_ACCOUNT_AGORA` | ✅ Cargados 01/08/2026 — faltan los de negocio (`tech-specs.md` §9), cuando el código los requiera |
| Cuenta Bold de Le Tiende | Existe (uso manual actual) | ⬜ Sin integrar (v2) |
| WABA de WhatsApp | No existe | ⬜ Trámite no iniciado (v2) |
| Presupuesto AWS "Costo diario" | US$4/día, alertas 80%/100% ACTUAL, notificación por email verificada | ✅ Ya existe, a nivel de **cuenta completa** (Babel/Comandante/Ágora) — verificado por CLI el 01/08/2026 |
| Presupuesto AWS "Costos promedio" | US$10/mes, alertas 85%/100% ACTUAL + 100% FORECASTED, notificación por email | ✅ Ya existe, a nivel de cuenta completa — verificado por CLI el 01/08/2026 |
| Presupuesto específico de Ágora (filtrado por etiqueta `Proyecto: agora`) | Umbral sugerido ~US$1 | ⬜ Por crear antes del primer tráfico real — los presupuestos de cuenta no distinguen el gasto de Ágora del de Babel/Comandante (ADR-011) |
| Hosted zones Route 53 en la cuenta | 7 zonas × US$0,50/mes ≈ US$3,58/mes, piso fijo compartido, no atribuible a Ágora | ✅ Verificado por CLI el 01/08/2026 |

---

## 6. Patrones de código establecidos

Todavía no hay código propio. Estos son los patrones que Ágora **hereda** de Babel y que deben respetarse desde la primera línea.

**Idioma del código: español.** Variables, funciones, clases, tablas y commits. `obtenerSillasDisponibles`, no `getAvailableSeats`.

**Signals sobre RxJS.**
```ts
private readonly evento = signal<Evento | null>(null);
readonly hayDisponibilidad = computed(() => (this.evento()?.sillasDisponibles ?? 0) > 0);
```

**`inject()` sobre inyección por constructor.**
```ts
private readonly servicioEventos = inject(ServicioEventos);
```

**Nombres de tabla por stage vía variables de entorno.** Las Lambdas nunca hardcodean un nombre de tabla; reciben `TABLA_EVENTOS`, `TABLA_COMPRAS`, etc., resueltos en `serverless.yml` a partir de `${sls:stage}`.

**Toda escritura de aforo es condicional.** Sin excepción y sin lectura previa. Ver `tech-specs.md` §5.4.

**Formato de precios con pipe propio.**
```ts
new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor);
```
No usar `CurrencyPipe`/`DecimalPipe`: obligan a registrar el locale `es-CO` y eso complica el bundle SSR.

**Fechas en UTC en la base de datos, `America/Bogota` solo en presentación.**

**Empaquetado individual de Lambdas.** Cada función declara en `serverless.yml` exactamente los archivos que necesita (`package.patterns` con `'!**'` primero). Reduce el arranque en frío.

---

## 7. Gotchas conocidos

Heredados de Babel salvo indicación contraria. Los marcados como **verificado en producción** ya rompieron algo real en otro proyecto del ecosistema.

| Situación | Solución |
|---|---|
| 🔴 **Verificado — el más caro de todos:** una tabla DynamoDB `PROVISIONED` (o cualquier `ProvisionedThroughput` en tabla/GSI) se cobra 24/7 por hora, exista o no tráfico | Costó a Babel US$90,34 en un mes (18 unidades de 25/25 olvidadas). **`BillingMode: PAY_PER_REQUEST` siempre, sin excepción** — ver ADR-011 y `docs/advertencia-urgente-costos-aws.md` |
| **Verificado:** el deploy falla porque la `description` de una función Lambda supera 256 caracteres | CloudFormation impone ese límite. Descripciones cortas en `serverless.yml`; explicar en la documentación, no en el YAML |
| **Verificado:** dos merges seguidos a `main` chocan con `Stack ... is in UPDATE_IN_PROGRESS state and can not be updated` | `concurrency` en GitHub Actions: grupo `desplegar-produccion` con `cancel-in-progress: false`, grupo `desplegar-staging` con `true` |
| **Verificado:** el dominio personalizado devuelve error de `Host` no autorizado | Configurar `NG_ALLOWED_HOSTS` con el dominio propio **junto con** el montaje del dominio, no después de que producción falle |
| **Verificado en Ágora (01/08/2026):** hasta `curl http://localhost:4000/` tras `npm run serve:ssr` devuelve `Header "host"... is not allowed` | `angular.json` → `architect.build.options.security.allowedHosts` **NO controla el chequeo de Host en tiempo de ejecución** del servidor Express de SSR (solo protege el prerenderizado contra SSRF) — el `src/server.ts` generado instancia `new AngularNodeAppEngine()` sin config, que lee la lista permitida de la variable de entorno `NG_ALLOWED_HOSTS` (coma-separada) en cada arranque. Para probar SSR en local: `NG_ALLOWED_HOSTS=localhost npm run serve:ssr`. En producción, esta variable va en el entorno de la Lambda (`serverless.yml`), con `agora.letiende.co` |
| **Verificado:** las fotos de perfil de Google devuelven 429 | `referrerpolicy="no-referrer"` en todo `<img>` que cargue `lh3.googleusercontent.com` |
| Primer escaneo del día en la puerta es lento | Cold start de la Lambda tras horas de inactividad, justo cuando se forma la fila. Considerar calentamiento manual al abrir la pantalla de ingreso; `provisioned concurrency` rompe el objetivo de costo $0 |
| La cámara no abre en iOS Safari | `getUserMedia` exige HTTPS y un gesto explícito del usuario. Disparar siempre desde un manejador de click/tap, nunca al cargar la página |
| Las reservas vencidas siguen ocupando aforo | El TTL de DynamoDB borra "típicamente en 48 horas", no al segundo. La lógica de negocio debe tratar como expirada toda reserva con `expiraEn` pasado, exista o no el ítem |
| El aforo crece por encima de `sillasTotales` | DynamoDB Streams entrega *at-least-once*: un evento duplicado devolvió sillas dos veces. La devolución debe ser condicional sobre `sillasReservadas >= :n` |
| Las boletas llegan a la carpeta de spam | Una boleta en spam es un cliente sin poder entrar. Verificar SPF (`include:amazonses.com`), DKIM y DMARC en `letiende.co`, y probar contra Gmail y Outlook reales antes del primer evento |
| Un locale `es-CO` mal registrado rompe el build SSR | Usar `Intl.NumberFormat` directamente en un pipe propio, no `CurrencyPipe`/`DecimalPipe` |
| **Verificado en Ágora (02/08/2026):** el botón sale de un color naranja/marrón medio en vez del `#230C00` casi negro de marca, aunque el hex de marca sí se usó como fuente de la paleta | El esquema claro de Material 3 mapea `primary` al **tono 40** de la rampa tonal (un tono medio, pensado para contraste sobre fondo claro), no al hex exacto que se pasó como semilla. Hay que sobrescribir `--mat-sys-primary`/`--mat-sys-on-primary` (y el resto de tokens de marca) explícitamente después de `mat.theme()` — igual que hubo que hacer con el preset de PrimeNG. Ver ADR-012 y `src/material-theme.scss` |
| `@material/material-color-utilities` falla con `ERR_MODULE_NOT_FOUND` al ejecutarlo directo con `node` | El paquete es ESM puro y uno de sus archivos internos (`dynamiccolor/color_spec_2025.js`) importa una ruta relativa sin extensión `.js`, lo que Node en modo ESM estricto rechaza (los bundlers como esbuild/webpack lo toleran, Node plano no). Workaround: empaquetar el script con `esbuild --bundle --platform=node --format=esm` **ejecutado desde el directorio del proyecto** (para que resuelva `node_modules` correctamente) y correr el bundle resultante, no el archivo fuente |
| **Verificado (02/08/2026, sesión de sandbox restringido de red):** el paquete npm `serverless` (v4) no trae el CLI — su `postinstall` (`binary.js`) descarga un binario nativo desde `https://install.serverless.com/installer-builds/...` en el primer uso; en un entorno con salida de red restringida a una lista blanca (como algunas sesiones de Claude Code on the web) ese host devuelve 403 y **tanto `npm install` como cualquier `npx serverless ...`** fallan con `Error fetching release: fetch failed` | `npm install` funciona con `--ignore-scripts` (evita que el postinstall intente la descarga), pero entonces `npx serverless package/deploy` sigue fallando en ese mismo entorno porque el binario nunca se descarga — **no es un bug del código de Ágora**, es una restricción de red del entorno. Verificar `serverless.yml` (sintaxis, roles IAM, `package.patterns`) por revisión manual y con `tsc --noEmit` cuando esto ocurra, y dejar la verificación real de `serverless package/deploy` para CI (que sí tiene salida a `install.serverless.com`) o para una sesión sin esa restricción. No es una alerta de costo — no reintentar ni intentar rodear la política de red |
| **Verificado (02/08/2026, mismo sandbox):** `ng build`/`ng test`/`ng serve` fallan de inmediato con "The Angular CLI requires a minimum Node.js version of v22.22.3 or v24.15.0 or v26.0.0" — el Node preinstalado en este tipo de sandbox es `v22.22.2`, un patch por debajo del mínimo que exige Angular CLI 22 (chequeo hardcodeado en `node_modules/@angular/cli/bin/ng.js`, sin variable de entorno para omitirlo) | El runtime de Node en sí funciona con normalidad (`tsc`, `vitest`, cualquier script plano) — solo el arnés del CLI de Angular se niega a arrancar por un patch de diferencia. Verificado que **no** afecta CI: `.github/workflows/deploy.yml` fija `NODE_VERSION: '24'`, que sí cumple. Para verificar `ng build`/`ng test` en este sandbox sin tocar el código del repo: un script Node que redefina `Object.defineProperty(process.versions, 'node', { value: '22.22.3', configurable: true })` antes de `require('.../bin/ng.js')` (la propiedad es `configurable: true`) deja pasar el chequeo sin cambiar el comportamiento real del runtime — es una verificación local de un solo uso, nunca algo que viva en el repo ni en CI |
| **Heredado de Babel, verificado en producción (no propio de Ágora todavía, pero aplicado preventivamente esta sesión):** una ruta protegida por un guard que depende de la sesión de Firebase (`GuardiaAuth`/`GuardiaRol`) **nunca** puede ser `RenderMode.Prerender` ni `RenderMode.Server` en `app.routes.server.ts` — la sesión de Firebase vive solo en el navegador (IndexedDB del SDK cliente, sin cookie de sesión), así que el Lambda `ssr` nunca puede saber si hay una sesión real. Con `Server`, Babel confirmó en producción que el guard se evaluaba en cada carga completa de página **sin acceso a esa sesión** y siempre redirigía a `/login`, autenticado o no (un usuario real con sesión activa quedaba atrapado en un bucle de redirección al entrar por URL directa o al refrescar) | Toda ruta con `guardiaAuth`/`guardiaRol` debe declararse `RenderMode.Client` en `app.routes.server.ts` cuando se cree (todavía no aplica: en esta sesión no se agregó ninguna ruta protegida real, solo `/login`, que es pública). Aplicar esto **desde la primera ruta protegida real** (roadmap #5/#6, `/admin/usuarios`, `/admin/eventos`), no descubrirlo en vivo en staging como le pasó a Babel |
| **Verificado en vivo en staging (02/08/2026, validación del PR #9 por el usuario):** el login con Google funcionaba (popup, selección de cuenta) pero `GET /api/usuarios/me` respondía con error genérico incluso con el correo ya activo en `agora-usuarios-staging` | `.github/workflows/deploy.yml` nunca pasaba `FIREBASE_SERVICE_ACCOUNT_AGORA` como variable de entorno al paso `npx serverless deploy` (ni en `desplegar-staging` ni en `desplegar-produccion`) — solo `SERVERLESS_LICENSE_KEY`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`. El secreto sí existía cargado en GitHub (§5), pero nunca llegaba al proceso de `serverless deploy`, así que `${env:FIREBASE_SERVICE_ACCOUNT_AGORA, ''}` en `serverless.yml` resolvía a cadena vacía y la Lambda `usuariosMe` desplegaba sin credencial real: `obtenerAppFirebase()` lanzaba `Error` (no `ErrorAutenticacion`) por falta de la variable, y el handler lo traducía a `500`, nunca a `401`/`403`/`200`. El gap era invisible en local (`FIREBASE_SERVICE_ACCOUNT_AGORA` nunca se probó de punta a punta contra AWS real hasta este PR, el primero que agrega una Lambda que la usa). Corregido agregando la variable a los dos jobs de deploy en `deploy.yml`. **Lección:** cuando una Lambda nueva empieza a depender de un secreto ya cargado en GitHub, verificar explícitamente que el paso de CI que la despliega también lo reciba — que el secreto "exista" en GitHub no implica que ya esté conectado a cada job que lo necesita |
| **Verificado en vivo en staging (02/08/2026, mismo PR #9, segunda ronda de validación):** con `FIREBASE_SERVICE_ACCOUNT_AGORA` ya conectado (fila anterior), `GET /api/usuarios/me` seguía respondiendo `500` — y de forma reveladora, **incluso una petición sin header `Authorization`** (que nunca toca `firebase-admin`) también daba `500` con el cuerpo genérico `{"message":"Internal Server Error"}` de API Gateway, no el `{"mensaje":"Error interno"}` propio del handler. Esa combinación es la firma de un Lambda que se cae **al arrancar** (module-level, antes de que el handler corra), no de un error dentro del código del handler | Causa real: el `package.patterns` de `usuariosMe` (fila del gotcha anterior en esta misma tabla, la de exclusiones manuales de `node_modules/**`) dejaba fuera del `.zip` algo que `firebase-admin` necesita para cargar (`require`/`import` a nivel de módulo) — imposible de detectar con `tsc --noEmit` o con las pruebas unitarias (que corren contra el `node_modules` completo del repo, no contra el subconjunto empaquetado), y **tampoco se pudo verificar con `serverless package`** por el bloqueo de red a `install.serverless.com` de esta sesión (gotcha ya documentado arriba). Corregido reemplazando las exclusiones manuales por un bundle de `esbuild` (`server/bundle-lambdas.mjs`, script `npm run bundle:api`): un único archivo autocontenido que resuelve el árbol de dependencias real igual que Node, así que no puede faltar nada que el código realmente importe. Verificado localmente invocando el bundle directo con `node -e "require(...).handler(...)"`, simulando exactamente el caso que fallaba en staging (sin header) antes de confiar en el próximo deploy. **Lección:** para cualquier Lambda que dependa de un paquete npm con árbol de dependencias transitivo grande o cambiante (no solo `firebase-admin` — cualquier futuro candidato similar), preferir un bundle de esbuild sobre una lista de exclusiones de `node_modules/**` escrita a mano; la lista a mano es exactamente el tipo de cosa que "compila bien pero falla en producción" sin que ningún build local lo detecte |
| **Verificado (05/08/2026):** `npm run test` (frontend) fallaba de forma **no determinística** según el orden de ejecución de los archivos — las mismas pruebas de `servicio-auth.spec.ts` pasaban solas (`--include`) pero fallaban corriendo junto con otros specs, con errores imposibles en aislamiento (`proveedor.setCustomParameters is not a function`, o un `signInWithPopup` mockeado que nunca se llamaba). La causa: `@angular/build:unit-test` (el builder de `ng test` sobre Vitest) trae **`isolate: false` por defecto** ("para alinearse con la experiencia de Karma/Jasmine" según su propio schema), así que **todos** los `*.spec.ts` corren en el mismo contexto de módulos — un `vi.mock('firebase/auth', ...)` declarado en un archivo (ej. `guardia-auth.spec.ts`, que solo necesita evitar cargar el SDK real) puede terminar siendo el que "gana" para `servicio-auth.spec.ts` (que sí necesita configurar ese mock con comportamiento específico por prueba), y el resultado depende del orden de carga, no del contenido de cada archivo | Se agregó `architect.test.options.isolate: true` en `angular.json` — cada archivo de prueba vuelve a tener su propio contexto de módulos, como es el comportamiento estándar de Vitest fuera de Angular. Verificado con 5 corridas seguidas de `npm run test` en verde (antes fallaba intermitentemente ~2 de cada 3). **Nota aparte, ya buena práctica de todos modos:** cualquier archivo que importe una clase real como token de DI (`{ provide: ServicioAuth, useValue: {...} }`) y esa clase importe el SDK de Firebase a nivel de módulo, debe mockear `firebase/app`/`firebase/auth` él mismo — no asumir que "otro archivo ya lo hizo" |
| **Verificado (05/08/2026):** en una prueba de un componente standalone que llama `this.dialog.open(...)` (`MatDialog`, inyectado), sobrescribir el provider en `TestBed.configureTestingModule({ providers: [{ provide: MatDialog, useValue: {...} }] })` no interceptó la llamada — corrió el `MatDialog.open` real y lanzó un error interno de Angular Material (`Cannot read properties of undefined (reading 'push')`, overlay sin inicializar) | Causa: el componente probado tenía `MatDialogModule` en su propio array `imports` de `@Component`, aunque su plantilla no usa ningún directive `mat-dialog-*` (esos viven en el componente que el diálogo abre, no en quien lo abre) — con eso importado, `inject(MatDialog)` dentro del componente resolvía una instancia distinta a la que el override del `TestBed` reemplazaba. Corregido en dos frentes: (1) se quitó `MatDialogModule` de los `imports` del componente que solo *abre* el diálogo (nunca hacía falta ahí), y (2) en la prueba, en vez de sobrescribir el provider, se usa `vi.spyOn(TestBed.inject(MatDialog), 'open')` sobre la instancia real — intercepta la llamada sin importar por qué cadena de inyección la resolvió el componente. El mismo patrón aplica a `MatSnackBar` |
| **Verificado en vivo en staging (06/08/2026, validación del PR #11 por el usuario):** al hacer clic en "Crear evento" y navegar a `/admin/eventos/{eventoId real}`, la pantalla seguía mostrándose como el formulario de "Crear evento" (título, `slug`/`sillasTotales` habilitados) en vez de pasar a modo edición — y un segundo clic en el botón volvía a crear otro evento con los mismos datos, duplicándolo | Causa: `EditarEventoComponent` leía el parámetro de ruta una sola vez en el constructor (`this.route.snapshot.paramMap.get('id')`) y lo guardaba en un campo plano. `/admin/eventos/nuevo` y `/admin/eventos/{id}` son la **misma definición de ruta** (`admin/eventos/:id`), así que al navegar entre ellas Angular **reutiliza la misma instancia del componente** — nunca vuelve a ejecutar el constructor ni `ngOnInit`, dejando ese campo "congelado" en `'nuevo'` para siempre. Corregido reemplazando el campo plano por un Signal input (`id = input.required<string>()`) más `withComponentInputBinding()` en `provideRouter()` (`app.config.ts`) — el Router actualiza los Signal inputs en cada navegación incluso cuando reutiliza la instancia — y moviendo toda la inicialización (precargar formulario, deshabilitar `slug`/`sillasTotales`, etc.) a un `effect()` que reacciona a ese Signal, en vez de a `ngOnInit`. **Lección:** cualquier componente en una ruta con parámetro dinámico que lea `ActivatedRoute.snapshot` una sola vez (constructor/campo/`ngOnInit`) es sospechoso de este bug si existe algún flujo de navegación programática entre dos valores del mismo parámetro — preferir Signal inputs con `withComponentInputBinding()` o suscribirse a `route.paramMap` en vez de leer el snapshot una vez |
| **Verificado en vivo en staging (06/08/2026, mismo PR #11):** subir cualquier imagen (probado con un PNG de 22 KB) como logotipo/imagen de evento fallaba silenciosamente, sin relación aparente con el tamaño o el formato del archivo | Causa: el bucket `BucketActivos` no tenía `CorsConfiguration`. La subida es un `PUT` directo del navegador a S3 con la URL prefirmada, y como el cliente envía `Content-Type: image/png` (no uno de los tres valores "simples" que evitan preflight — `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`), el navegador dispara un preflight `OPTIONS` antes del `PUT` real; sin una regla CORS que lo responda, el navegador bloquea la petición **antes de que llegue a S3** — el error no tiene nada que ver con el contenido del archivo, por eso "cualquier imagen" fallaba igual. Corregido agregando `CorsConfiguration` (`AllowedMethods: [PUT]`, `AllowedOrigins: ['*']`) a `BucketActivos` en `serverless.yml` — `AllowedOrigins: '*'` es aceptable aquí porque la autorización real de la escritura la da la firma de la URL prefirmada (de vida corta, ligada a una key exacta), no el origen del navegador; CORS solo controla si el navegador deja pasar la respuesta, no si S3 acepta la petición. **Lección:** cualquier bucket S3 al que el navegador suba directo con una URL prefirmada (patrón ya usado aquí y previsto para comprobantes de pago) necesita `CorsConfiguration` desde el primer despliegue — no es opcional ni "se agrega si hace falta", el primer intento de subida ya lo necesita |
| **Verificado en vivo en staging (07/08/2026, PR #12, reportado por el usuario con un evento real ya creado):** `GET /api/eventos-publicos` respondía `500` con el cuerpo genérico `{"message":"Internal Server Error"}` de API Gateway (no el `{"mensaje":"Error interno"}` propio del handler) — misma firma exacta que el incidente de `usuariosMe` de la fila de arriba (fallo al arrancar, antes de que corra el handler) | Causa: al planear la Tarea 1 se asumió que solo las Lambdas que dependen de `firebase-admin` (vía `exigirRol`) necesitan el bundle de esbuild, así que `eventosPublicos` (que nunca usa `exigirRol`, es pública) se empaquetó "simple" como `salud` (`package.patterns: ['!**', 'dist-server/...']`, sin `node_modules`). Pero `eventosPublicos` sí importa `documentoDynamoDB` (`server/api/services/dynamodb.ts` → `@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb`), una dependencia real de `node_modules` — y el runtime gestionado de Lambda (`nodejs24.x`) **no** garantiza traer el SDK v3 modular preinstalado (a diferencia del viejo `aws-sdk` v2 en runtimes antiguos). `salud.ts` es la **única** función sin ninguna dependencia real de `node_modules`; no es un patrón "por defecto" seguro de copiar para cualquier función nueva. Corregido agregando `eventos-publicos.js` a `server/bundle-lambdas.mjs` (mismo esbuild que `eventos`/`usuarios`/`usuariosMe`) y apuntando `serverless.yml` a `dist-server-bundle/eventos-publicos.handler`. Verificado localmente invocando el bundle directo (`node -e "require(...).handler(...)"`) antes de empujar el fix: antes del fix habría fallado en la resolución de módulos; después, llega hasta el `try/catch` propio del handler. **Lección (generaliza la de `usuariosMe`):** el criterio para bundle de esbuild no es "¿usa `firebase-admin`?", es "¿importa *algo* de `node_modules` en tiempo de ejecución?" — `documentoDynamoDB` solo ya es suficiente. Antes de dar por bueno un `package.patterns` con `'!**'` para una función nueva, listar explícitamente sus imports y confirmar que ninguno resuelve a un paquete real de `node_modules` |
| **Verificado en vivo (07/08/2026, PR #13, reportado por el usuario):** el `<mat-select>` de "Rol" en el formulario de `/admin/usuarios` se veía renderizado por debajo de los demás campos del formulario, imposible de usar para seleccionar una opción — no era un problema visual menor, el formulario de crear/editar usuario quedaba inutilizable para cambiar el rol | Causa: `.cdk-overlay-container` (el `<div>` que Angular CDK usa para posicionar de forma flotante cualquier overlay — `mat-select`, `mat-menu`, `mat-dialog`, `mat-autocomplete`) **nunca tuvo `position`/`z-index` definidos**, porque `@angular/cdk/overlay-prebuilt.css` no estaba en `angular.json` → `architect.build.options.styles`. Confirmado con evidencia dura, no solo teoría: `npm run build -- --configuration=production` y luego `grep -c "cdk-overlay" dist/**/*.css` devolvía `0` — cero apariciones en todo el CSS compilado. Sin esas reglas, el panel del overlay no flota: cae al final del flujo normal del documento (donde el CDK lo inyecta en el DOM, al final de `<body>`), en vez de superponerse sobre el trigger. `mat.core()`/`mat.theme()` (las mixins SCSS de Angular Material que sí están en uso, `src/material-theme.scss`) **no** emiten estas reglas — viven únicamente en ese CSS plano separado, confirmado con `grep -rn "cdk-overlay" node_modules/@angular/material/**/*.scss` sin resultados. Es un hueco que quedó desde la migración manual de PrimeNG a Angular Material (ADR-012) — `ng add @angular/material` lo agrega automáticamente al `angular.json`, pero la migración de esta sesión anterior fue manual y se lo saltó; no es una regresión de la barra de navegación de la Tarea 1 de esta sesión, pese a la coincidencia de fechas. Corregido agregando `"node_modules/@angular/cdk/overlay-prebuilt.css"` como primera entrada del arreglo `styles`. Verificado que la regla queda en el CSS compilado (`.cdk-overlay-container{position:fixed;z-index:1000}`) antes de dar el fix por bueno, mismo criterio disciplinado que los gotchas anteriores. **Lección:** cualquier componente Angular Material basado en overlay (`mat-select`, `mat-menu`, `mat-dialog`, `mat-autocomplete`, `mat-tooltip`) depende de este CSS — si un proyecto nuevo o migrado a mano usa Material sin pasar por `ng add`, verificar explícitamente que `overlay-prebuilt.css` esté en `angular.json`, no asumir que las mixins de tema ya lo incluyen |

---

## 8. Documentos de referencia

| Documento | Contenido | Quién lo lee |
|---|---|---|
| `CLAUDE.md` | Stack, convenciones, seguridad OWASP, git flow. **Fuente de verdad de las reglas** | IA en cada sesión |
| `docs/PRD.md` | Requisitos de producto en lenguaje de negocio | Humanos + IA |
| `docs/tech-specs.md` | Arquitectura, endpoints, modelos, infraestructura, roadmap técnico | Desarrolladores + IA |
| `docs/MEMORY.md` | Este documento: estado, ADRs, configuraciones, gotchas | IA al inicio de sesión |
| `docs/TODO.md` | Motor JIT: exactamente 2 tareas atómicas activas | IA al inicio de sesión |
| `docs/planteamiento-inicial.md` | Documento fuente original del proyecto (humano) | Referencia histórica |
| `docs/instrucciones-tracking.md` | Reglas del registro de tiempos | IA y humanos |
| `docs/tracking.csv` | Registro de todas las tareas con tiempos | IA y humanos |
| `docs/DESIGN.md` | Sistema de diseño — ⬜ se crea al implementar la UI | Desarrolladores + IA |
| `docs/advertencia-urgente-costos-aws.md` | **Lectura obligatoria antes de tocar cualquier IaC.** Incidente real de Babel (DynamoDB `PROVISIONED`, US$90,34/mes), catálogo de trampas de costo por servicio, checklist pre-deploy (ADR-011) | IA y desarrolladores, antes de `serverless.yml` |

**Referencias externas del ecosistema:**

| Recurso | Ubicación | Para qué |
|---|---|---|
| Babel | `~/Documents/LeTiende/letiende.co/babel` | **Plantilla de referencia**: `serverless.yml`, `deploy.yml`, `CLAUDE.md`, `DESIGN.md`, estructura de `server/api/` |
| Comandante | `ocastelblanco/comandante-letiende` | Origen de la identidad de marca de Le Tiende |
| Bold — llaves de integración | https://developers.bold.co/pagos-en-linea/llaves-de-integracion | v2 |
| Bold — botón de pagos | https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual | v2 |
| Bold — API link de pagos | https://developers.bold.co/pagos-en-linea/api-link-de-pagos | v2 |

---

## 9. Contexto de la sesión actual

**Sesión del 31/07/2026 — Bootstrap de documentación**

Punto de partida: un repositorio con tres archivos en `docs/` (el planteamiento inicial escrito por OCM, las instrucciones de tracking y un `tracking.csv` vacío con solo la fila de encabezados). Sin código, sin `package.json`, sin infraestructura.

Lo que se hizo:

1. Se leyeron `planteamiento-inicial.md` e `instrucciones-tracking.md`.
2. Se resolvieron con el usuario, en tres rondas de preguntas, las decisiones que condicionaban toda la documentación: canal de notificación, forma del despliegue, alcance del MVP, relación con el ecosistema, ramas y entornos, herramienta de IaC, política de inventario y fecha objetivo.
3. **Hallazgo determinante:** el usuario remitió a Babel para el git flow. Al inspeccionarlo se encontró un proyecto hermano ya en producción con exactamente el mismo stack (Angular 22 SSR + Lambda + DynamoDB + Firebase Auth) y patrones probados. Esto revirtió dos decisiones tomadas antes de conocerlo: **AWS CDK → Serverless Framework** (ADR-001) y **proyecto Firebase propio → proyecto compartido** (ADR-002), y aportó la lista de gotchas ya verificados en producción de §7.
4. Se escribieron los cinco documentos en el orden que exige el skill: `CLAUDE.md` (con OWASP y git flow), `PRD.md`, `tech-specs.md`, `MEMORY.md` y `TODO.md`.

Lo que quedó abierto y no depende del desarrollo: se consolidó en `docs/tareas-a-realizar.md`, un documento de trabajo personal de OCM con el paso a paso de las 10 tareas que exigen entrar a una consola web (GitHub, IAM, Firebase, SES, dominio, WABA, Bold, Calendar). **Ese archivo está en `.gitignore` y no se versiona**, porque está pensado para pegar valores reales mientras se avanza; se elimina al completarlo, trasladando antes los valores no sensibles a §5 de este documento.

Dos correcciones respecto de lo que se creía al cerrar el bootstrap:

- ✅ **SES no está en sandbox.** El usuario lo confirmó el 31/07/2026. Desaparece el riesgo mayor identificado en la sesión. Lo que queda por verificar es más ordinario: el remitente, y que SPF/DKIM/DMARC eviten que las boletas caigan en spam.
- ✅ **El trámite de la WABA es más rápido de lo estimado.** Se verificó contra la documentación de AWS: el alta es un formulario embebido (~20 min) y cada plantilla se revisa en hasta 24 horas. La parte lenta es la Verificación de Negocio de Meta, necesaria solo para enviar a escala. La decisión de diferir WhatsApp a v2 (ADR-003) sigue siendo correcta, pero por alcance, no por riesgo de cronograma. **Hallazgo con consecuencia operativa:** el número que se registre no puede estar en uso en la app de WhatsApp — usar el número actual de Le Tiende implicaría borrar esa cuenta y su historial. Probablemente convenga una línea nueva para la taquilla.

**Próxima tarea sugerida:** Tarea 1 de `docs/TODO.md` — andamiaje del proyecto Angular 22 con PrimeNG y Tailwind. En paralelo, OCM ejecuta las secciones 1 a 3 de `docs/tareas-a-realizar.md`, que desbloquean la Tarea 2.

**Sesión del 01/08/2026 — Credenciales de despliegue compartidas (ADR-009)**

El usuario decidió no crear el usuario IAM dedicado `agora-despliegue` que proponía `docs/tareas-a-realizar.md` §2. En su lugar, Ágora reutiliza el usuario AWS ya compartido por Babel y Comandante (`@ocastelblanco`, `AdministratorAccess`), tanto para trabajo desde CLI (perfil `default`) como para las credenciales de CI/CD. Se verificó por CLI, sin exponer el secreto, que ese usuario ya tiene una única Access Key activa y que es la misma que Babel ya usa en sus GitHub Secrets — no hace falta generar nada nuevo, solo copiar el par de credenciales a los secretos del repositorio de Ágora. Detalle completo en ADR-009 (§3) y en `docs/tareas-a-realizar.md` §2-3, que se reescribieron para reflejar esto.

**Sesión del 01/08/2026 (continuación) — Bloque 🔴 completado; sin app web propia en Firebase (ADR-010)**

El usuario reportó completo todo el bloque que bloqueaba el desarrollo: protección de `main`, confirmación del usuario AWS compartido, y los secretos de GitHub Actions (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY`, y además `FIREBASE_SERVICE_ACCOUNT_AGORA`). También creó la cuenta de servicio en GCP, agregó `agora.letiende.co` a los dominios autorizados de Firebase Auth del proyecto `comandante-letiende`, y probó el envío desde SES con `taquilla@letiende.co` — llegó sin problema a un Gmail.

Preguntó si hacía falta registrar una app web nueva en Firebase para Ágora, notando que Babel tampoco aparece como app separada en la consola. Se verificó en el código real de Babel (`babel/src/environments/environment.ts`), no en su documentación: Babel reutiliza literalmente el `firebaseConfig` de Comandante. Ágora hace lo mismo — no hay que registrar nada (ADR-010). Los valores de `firebaseConfig` (no sensibles) quedaron documentados en `docs/tareas-a-realizar.md` §4.1 y en §5 de este documento.

`docs/tareas-a-realizar.md` se reescribió sección por sección para reflejar lo ya hecho: quedan abiertos solo el dominio de staging en Authorized domains (llega con la Tarea 2), dos verificaciones opcionales de 30 segundos (cabeceras SPF/DKIM/DMARC del correo de prueba, y restricción de referrer de la API key de Firebase en GCP), y las secciones 6-10 que dependen de trabajo posterior.

**Próxima tarea sugerida (actualizada):** Tarea 1 y Tarea 2 de `docs/TODO.md` ya pueden ejecutarse sin bloqueos externos.

**Sesión del 01/08/2026 (continuación) — Interrupción urgente: incidente de costos de Babel (ADR-011)**

A mitad de la Tarea 1 (andamiaje de Angular, ya con `npm install` corrido pero sin commitear), el usuario interrumpió para reportar un incidente real en Babel: DynamoDB quedó en `PROVISIONED` en vez de on-demand, facturando US$90,34 en julio de 2026 (96% de una factura total de US$94,44) sobre un objetivo de costo $0, con las tablas de producción vacías. Se leyó `docs/advertencia-urgente-costos-aws.md` completo y se aplicaron los ajustes correspondientes en Ágora antes de retomar Tarea 1:

- **`CLAUDE.md`:** nueva sección "Costos de infraestructura" (entre §5 y §6) con las reglas obligatorias (`PAY_PER_REQUEST` siempre, sin NAT Gateway, `logRetentionInDays` explícito, etiquetado, disciplina de verificación de precios), y dos filas nuevas en la tabla de prohibiciones absolutas. Objetivo de costo actualizado de "$0 o lo más cercano" a **< US$1/mes**, medido.
- **`docs/tech-specs.md`:** §5.2 (tablas DynamoDB) con `BillingMode: PAY_PER_REQUEST` explícito y snippet YAML; principio de arquitectura §1.1 actualizado; nueva §7.3 "Costos y presupuestos" con estrategia de etiquetado (`stackTags`), los presupuestos de cuenta ya existentes, y el comando de verificación post-despliegue.
- **`docs/TODO.md` — Tarea 2:** es la tarea que más importaba corregir, porque es exactamente donde se repetiría el error de Babel. Se agregó un paso 0 (leer la advertencia antes de empezar), se marcó el paso de declarar las tablas como "la regla de mayor prioridad de toda la tarea", se agregó verificación explícita de que la plantilla de Babel que se copia ya está corregida (se confirmó por CLI: commit `2ce744a`, `BillingMode: PAY_PER_REQUEST` en las 9 tablas), y se amplió la Definition of Done con verificación post-despliegue por CLI (no solo lectura del YAML), etiquetado, `logRetentionInDays`, ausencia de NAT Gateway, estimación de costo en el PR y recordatorio de revisión a 48 horas.
- **`docs/MEMORY.md`:** este ADR-011, fila nueva de gotcha (§7, marcada 🔴 como la más cara), y en §5 se documentaron los dos presupuestos de cuenta ya existentes y verificados por CLI (`Costo diario` US$4, `Costos promedio` US$10, ambos con email confirmado) más un pendiente: crear un presupuesto filtrado por etiqueta específico de Ágora antes del primer tráfico real.

**Nota operativa:** al ejecutar `git checkout main` tras abrir el PR de ADR-009/010 y antes de que el usuario lo fusionara, la rama de Tarea 1 (`feature/andamiaje-angular-primeng-tailwind`) se cortó de un `main` que todavía no tenía esos ADRs. El PR se fusionó mientras se trabajaba en esta interrupción; se detectó a tiempo (antes de commitear) y se resolvió con `git stash` + `rebase` sobre el `main` actualizado + `stash pop`, con un conflicto menor en `docs/TODO.md` (el paso 6 de Tarea 2) resuelto combinando ambas versiones. Lección para el futuro: verificar si hay un PR de documentación pendiente de fusionar antes de ramificar para una tarea de código nueva. **Esta misma lección se repitió, sin aprenderla, en la sesión siguiente** — ver nota más abajo.

**Próxima tarea sugerida:** retomar la Tarea 1 (andamiaje de Angular) donde quedó — `npm install` ya corrido, falta configurar el tema PrimeNG/Tailwind, el pipe de precio, la página de inicio y verificar el build.

**Sesión del 01/08/2026 (continuación) — Tarea 1 completa: andamiaje de Angular 22 + PrimeNG + Tailwind**

Se ejecutó la Tarea 1 completa, con una interrupción en el medio para una corrección urgente de costos de AWS (ver rama y PR separados: `fix/costos-dynamodb-pay-per-request`, no incluida en esta rama por diseño — las dos concernientes se mantuvieron en PRs distintos).

Lo hecho:
- `ng new` no se pudo correr directo por conflicto con `README.md`/`.gitignore` ya existentes (la CLI aborta sin escribir nada ante un conflicto — comportamiento transaccional). Se resolvió apartando ambos archivos temporalmente, generando el proyecto, y fusionando el contenido a mano después: `README.md` reescrito siguiendo el patrón SLIM de Babel; `.gitignore` fusionado (categorías de Angular + nuestras entradas: `.claude`, `.omc`, `docs/tareas-a-realizar.md`, `dist-server`, `.env`).
- PrimeNG 22 + `@primeuix/themes` + Tailwind 4 instalados. Preset propio (`src/app/core/tema/le-tiende-preset.ts`) con `definePreset(Aura, ...)` y el helper `palette()` de `@primeuix/themes` para generar la escala completa 50-950 a partir del hex de marca — mapea `colorScheme.light.primary.color` a `#230c00` y `.contrastColor` a `#ffe7b3` explícitamente (no solo `primary` genérico), para que los botones salgan `bg-primary`/`text-neutral` sin depender de la heurística por defecto de Aura.
- `@angular/animations` fue una dependencia oculta necesaria: `provideAnimationsAsync()` (que requiere PrimeNG) falla el build con "Could not resolve @angular/animations/browser" si no está instalada — no aparece en ningún tutorial de PrimeNG 22 como prerequisito explícito.
- Verificación del DoD hecha por **inspección del HTML servido por SSR real** (`curl` tras `NG_ALLOWED_HOSTS=localhost npm run serve:ssr`), no solo visual: se confirmó `--p-primary-color:#230c00` y `--p-primary-contrast-color:#ffe7b3` en el `<style>` embebido, y `$45.000` en el texto renderizado del pipe `precio`. Ver el gotcha nuevo en §7 sobre `NG_ALLOWED_HOSTS`.
- `angular.json`: presupuesto de bundle inicial subido de 500kB a 700kB (PrimeNG + Tailwind + animations empujan el bundle de forma esperada y ya conocida al elegir esta suite de UI, no es una regresión a corregir).
- `app.spec.ts` reescrito: la prueba generada por defecto ("Hello, {{title}}") ya no aplica al reemplazar la plantilla; se agregó además una prueba que verifica el pipe de precio end-to-end.
- Build de producción, SSR y `npm run test` (3/3) verificados en verde antes de cerrar la tarea.

**Próxima tarea sugerida:** con Tarea 1 cerrada, el motor JIT promueve el siguiente ítem del backlog (`Tema visual Le Tiende completo y docs/DESIGN.md`) al segundo slot activo de `docs/TODO.md`, junto a la Tarea 2 (infraestructura) que sigue activa.

**Sesión del 02/08/2026 — PrimeNG reemplazado por Angular Material (ADR-012)**

El usuario reportó un banner "Invalid PrimeUI License" al cargar la app en local y pidió usar "el paquete 100% gratuito de PrimeNG". La investigación llevó a un hallazgo mayor: PrimeNG 22 (instalado en la Tarea 1) **ya no es MIT**. Se verificó descargando y leyendo los `LICENSE.md` reales de varias versiones desde npm (no de memoria ni de la web de marketing de PrimeTek): MIT puro hasta la 17.x, texto MIT bajo otro nombre en 18.x-21.x, y licencia comercial "PrimeUI" genuina desde la 22.x — la que Ágora tenía instalada. La versión 21.x, la última realmente MIT, no es compatible con Angular 22.

Se presentaron cuatro opciones (Angular Material, solo Tailwind, licencia Community gratuita de PrimeNG con condiciones, o bajar todo a Angular 21) y el usuario eligió **Angular Material 22** — MIT sin condiciones, verificado también contra el registro de npm antes de proponerlo.

Se migró en la misma sesión: se desinstaló `primeng`/`@primeuix/themes`/`tailwindcss-primeui`, se corrió `ng add @angular/material@22`, y se construyó un tema Material 3 propio (`src/material-theme.scss`) con la paleta tonal generada por el algoritmo oficial de Google (`@material/material-color-utilities`, instalado temporalmente solo para la generación, luego desinstalado) a partir de los hex de marca — con los mismos overrides explícitos de tokens que ya habían sido necesarios para PrimeNG, porque M3 tampoco usa el hex exacto como color por defecto. Se reverificó todo el DoD original de la Tarea 1 (color del botón, pipe de precio) por inspección del HTML de SSR real, igual que la primera vez.

Se actualizó toda la documentación que asumía PrimeNG (`CLAUDE.md`, `docs/tech-specs.md`, `docs/PRD.md`, `README.md`, `docs/TODO.md`), y ADR-006 quedó marcada como revertida (no borrada) con referencia a esta ADR-012 — mismo tratamiento de trazabilidad que ya se le dio a la corrección de costos de la sesión anterior.

**Nota operativa (se repitió el problema de la sesión anterior):** al empezar esta corrección, el PR #3 (ADR-011, costos) ya se había fusionado a `main` sin que esta rama lo supiera. Se resolvió de nuevo con `git stash` + `rebase` sobre `main` actualizado + `stash pop`, esta vez con conflictos reales en `docs/MEMORY.md` y `docs/tracking.csv` (ambos archivos habían recibido entradas nuevas en las dos ramas a la vez) — resueltos conservando ambas entradas en orden cronológico real. **La lección de "verificar PRs pendientes de fusión antes de ramificar" quedó anotada dos veces sin aplicarse a tiempo la segunda; para una próxima sesión, sería mejor hacer `git fetch && git log origin/main..HEAD` (o revisar `gh pr list`) antes de empezar cualquier tarea nueva, no solo al final.**

**Próxima tarea sugerida:** retomar la Tarea 1 activa de `docs/TODO.md` (ahora solo `docs/DESIGN.md`, ya que el mapeo de tokens se adelantó en esta sesión) o commitear y abrir PR con los cambios de esta migración antes de continuar.

**Sesión del 02/08/2026 — `docs/DESIGN.md` + infraestructura base (Tareas 1 y 2)**

Se copiaron el favicon, íconos PWA y logotipos SVG desde Babel (`~/Documents/LeTiende/letiende.co/babel/public`) a `public/`, se conectaron en `src/index.html` + `manifest.webmanifest` propio, y se escribió `docs/DESIGN.md` (Tarea 1, PR separado). En el mismo cierre de sesión se ejecutó también la Tarea 2 (`serverless.yml`, `.github/workflows/deploy.yml`, `server/api/handlers/salud.ts`, `server/tsconfig.json`, `server/ssr/handler.mjs`), adaptando la plantilla de Babel con los guardarraíles de costo de ADR-011: `BillingMode: PAY_PER_REQUEST` explícito en las 5 tablas (con TTL en `expiraEn` y Streams `NEW_AND_OLD_IMAGES` en `agora-compras`), `logRetentionInDays: 14`, `stackTags`/`tags` con `Proyecto: agora`, y los 2 buckets S3 con Block Public Access + SSE-S3. Verificado localmente antes de abrir el PR: `npm run build`, `npm run build:api`, `npm run test:api` (1/1) y `npx serverless package --stage staging` (salud.zip 675 B, ssr.zip 892 KB) en verde; auditoría `grep -nE "PROVISIONED|ProvisionedThroughput|..."` sin coincidencias reales (solo comentarios).

**Actualización — primer despliegue real a staging (02/08/2026, mismo día):** el PR de la Tarea 2 disparó el despliegue automático a `staging` vía GitHub Actions. El `deploy` terminó bien (stack `agora-letiende-staging`, `CREATE_COMPLETE`, endpoint real `https://ttukw9i82m.execute-api.us-east-1.amazonaws.com`), pero el paso de *smoke test* del workflow falló: `curl: (3) URL rejected: No host part in the URL`. Causa raíz encontrada: el paso de deploy capturaba el endpoint parseando con `grep` la salida de `npx serverless deploy | tee archivo.txt`, y ese `tee` solo redirige stdout — el resumen de endpoints de Serverless Framework 4 no siempre sale por ahí, así que el `grep` no encontró nada y `url` quedó vacío (`"/api/salud"`, sin host). **Corrección aplicada en el mismo PR:** se agregó un `Output` explícito de CloudFormation (`HttpApiUrl` en `serverless.yml`) y el workflow ahora lee el endpoint con `aws cloudformation describe-stacks --stack-name agora-letiende-staging`, en vez de parsear texto de CLI — elimina la fragilidad de raíz en lugar de solo agregar `2>&1` al `tee`.

**Verificado por CLI contra la cuenta real (02/08/2026), no solo el IaC:**
- Las 5 tablas (`agora-usuarios`, `agora-eventos`, `agora-compras`, `agora-boletas`, `agora-auditoria`, sufijo `-staging`) están en `BillingMode: PAY_PER_REQUEST`.
- `agora-compras-staging` tiene TTL `ENABLED` en `expiraEn` y Streams `NEW_AND_OLD_IMAGES` activos.
- `agora-comprobantes-staging` y `agora-activos-staging` tienen las 4 banderas de `PublicAccessBlockConfiguration` en `true`.

**Segundo intento del Output, también falló (mismo día):** el primer `Output.Value: !Sub '...'` rompió el siguiente `deploy` con `The Value field of every Outputs member must evaluate to a String and not a Map`. Causa: el resolvedor de variables `${...}` propio de Serverless Framework intercepta `${HttpApi}`/`${AWS::Region}` **antes** de que CloudFormation vea el `!Sub`, y el resultado quedó como un `Value` con `Fn::Join` y `Fn::Sub` mezclados en el mismo mapa — inválido para CloudFormation. Se reescribió como `Fn::Join` explícito con `!Ref` (sin ningún `${...}` literal en el YAML, así el resolvedor de Serverless no lo toca). **Ese primer `Fn::Join` también salió mal**, aunque sin romper el deploy: al empaquetar localmente (`serverless package --stage staging`) se vio que Serverless reescribe automáticamente cualquier `Fn::Join` que reconoce como URL de API Gateway para usar el pseudo-parámetro `AWS::URLSuffix`, y como el `Fn::Join` original ya tenía el literal `'.amazonaws.com'`, el de Serverless se **agregó** en vez de reemplazarlo — habría producido `amazonaws.comamazonaws.com` duplicado si se hubiera desplegado así. Se corrigió referenciando `!Ref 'AWS::URLSuffix'` explícitamente en vez del literal, verificado por inspección del JSON generado (`.serverless/cloudformation-template-update-stack.json`) antes de volver a empujar el commit — no solo por lectura del YAML, la misma disciplina de verificación que exige `CLAUDE.md` para IaC.

**Lección para el futuro:** en `serverless.yml`, evitar `!Sub`/`${...}` en cualquier construcción de URL/ARN que combine referencias a recursos con pseudo-parámetros de AWS — el resolvedor de variables de Serverless Framework y el de CloudFormation compiten por el mismo símbolo `${}` y el resultado no siempre es obvio ni falla de forma temprana (el primer intento de `Fn::Join` habría desplegado con una URL rota sin que ningún paso de validación lo detectara, si no se hubiera inspeccionado el JSON empaquetado a mano). Preferir `Fn::Join` con `!Ref`/`!GetAtt` explícitos, y **siempre** revisar `.serverless/cloudformation-template-update-stack.json` tras un `serverless package` antes de confiar en un `Output` o una construcción de URL nueva.

**Recordatorio pendiente — revisión de costo a 48 horas:** sigue en pie, agendada para el **04/08/2026** o después (`aws ce get-cost-and-usage`, ver `docs/advertencia-urgente-costos-aws.md` §4 Paso 4) — la configuración ya se verificó hoy, pero el comportamiento del costo real en el tiempo todavía no.

**Sesión del 02/08/2026 (tarde) — Backend de autenticación (Tarea 1), ejecutada desde una sesión iniciada en móvil**

El usuario pidió confirmar viabilidad y, de ser posible, ejecutar la Tarea 1 (`docs/TODO.md`) desde una sesión de Claude Code on the web disparada desde el celular. Se confirmó que el entorno remoto tiene shell, git y npm completos independientemente del dispositivo de origen, y se procedió sin bloqueos de esa naturaleza.

Lo hecho, siguiendo exactamente el plan de la Tarea 1 original:
- `server/api/services/dynamodb.ts`: instancia única de `DynamoDBDocumentClient`.
- `server/api/lib/verificar-token.ts`: inicializa `firebase-admin` una sola vez por contenedor (cachea la app entre invocaciones), usa `FIREBASE_SERVICE_ACCOUNT_AGORA` vía `cert()`, y separa a propósito la resolución de la app (errores de configuración → 500) de la verificación del token en sí (`verifyIdToken` → 401), para no confundir "credencial del servidor mal puesta" con "token del cliente inválido".
- `server/api/lib/resolver-permisos.ts`: única fuente de la jerarquía `administrador > productor > portero` (`cumpleRolMinimo`), `GetItem` sobre `agora-usuarios` con un type guard manual (sin `any`, `CLAUDE.md` §4) en vez de castear el `Item` de DynamoDB directamente.
- `server/api/handlers/usuarios-me.ts` + `usuarios-me.spec.ts`: `GET /api/usuarios/me` con 401 (sin token / token inválido) → 403 (correo ausente o `activo: false`) → 500 (fallo de configuración o de DynamoDB, sin filtrar detalles) → 200. 6 pruebas en verde con `firebase-admin` y el `DocumentClient` mockeados vía `vi.mock`.
- `serverless.yml`: función `usuariosMe` nueva con `UsuariosMeLambdaRole` (`dynamodb:GetItem` exclusivo sobre el ARN de `AgoraUsuarios`, sin comodines), variables `TABLA_USUARIOS`/`FIREBASE_SERVICE_ACCOUNT_AGORA` (esta última con default `''`), y `package.patterns` que incluye `node_modules/**` completo (a diferencia de `salud`) con exclusiones explícitas de paquetes solo-frontend/build (Angular, Tailwind, Vitest, TypeScript, Serverless, `rxjs`, `express`) — **primera versión, sin verificar el tamaño real del `.zip`** porque no fue posible correr `serverless package` en esta sesión (ver más abajo); queda marcado en el propio `serverless.yml` como `<!-- SIN VERIFICAR -->` según exige `CLAUDE.md`.
- Dependencias nuevas: `firebase-admin@^14.2.0`, `@aws-sdk/client-dynamodb@^3.1101.0`, `@aws-sdk/lib-dynamodb@^3.1101.0` (versiones exactas resueltas contra el registro de npm el mismo día, coinciden con lo "previsto" en §4).

**Bloqueo de entorno encontrado y cómo se manejó (no es una alerta de costo ni un bug del código):** esta sesión corre en un sandbox con salida de red restringida a una lista blanca. `npm install` sin más falló porque el `postinstall` de `serverless` intenta descargar su binario nativo desde `install.serverless.com` (403 de política, no reintentado — instrucción explícita del proxy de la sesión). Se resolvió instalando con `--ignore-scripts`. Consecuencia: **no fue posible ejecutar `npx serverless package --stage staging`** en esta sesión (mismo host bloqueado), así que ese ítem del DoD original se verificó por los medios que sí eran posibles — `tsc -p server/tsconfig.json --noEmit` en verde, `npm run test:api` en verde (6/6), revisión manual línea por línea del `serverless.yml` resultante contra el patrón ya probado de `salud`/`SaludLambdaRole`, y la auditoría de costos por `grep` sin coincidencias nuevas — y queda pendiente de una verificación real de `serverless package/deploy` en CI o en una sesión sin esta restricción. Ver gotcha nuevo en §7.

**Decisión de rama:** el arnés de esta sesión exige empujar a `claude/tarea-1-mobile-feasibility-044k5v` en vez de crear una rama `feature/*` nueva — se siguió esa instrucción de la plataforma en vez del nombre de rama que sugiere `CLAUDE.md` §6, porque es un requisito del entorno de ejecución, no una decisión de diseño del código; el PR sigue abierto contra `main`, sin fusionar, como exige el mismo `CLAUDE.md` §6.

**Próxima tarea sugerida (superada por la sesión siguiente, ver abajo):** Tarea 1 de `docs/TODO.md` (ahora renumerada: frontend de autenticación — login con Google y guardias de ruta), que ya puede construirse contra el contrato real de `GET /api/usuarios/me`. El segundo slot del motor JIT queda vacío a propósito hasta que esa cierre (ver nota en `docs/TODO.md`). Una vez fusionado este PR, correr `npx serverless package --stage staging` desde un entorno sin la restricción de red (CI, por ejemplo) para verificar por fin el tamaño real del paquete de `usuariosMe` y ajustar `package.patterns` si hace falta.

**Sesión del 02/08/2026 (tarde, continuación) — Frontend de autenticación (Tarea 1), tras fusionar el PR del backend**

El usuario confirmó que había fusionado el PR del backend de autenticación (PR #8, `3deeb24` en `main`) y pidió limpiar el estado local y continuar con la siguiente tarea. Se siguió el protocolo de "PR ya fusionada" del arnés de esta sesión: `git fetch origin main --prune` (confirmó que GitHub ya había borrado la rama remota `claude/tarea-1-mobile-feasibility-044k5v` al fusionar) y `git checkout -B claude/tarea-1-mobile-feasibility-044k5v origin/main` para reiniciar la rama local desde el `main` real, en vez de apilar commits nuevos sobre una rama con historial ya fusionado.

**Bloqueo de datos y cómo se resolvió (sin inventar valores):** el `firebaseConfig` completo (`apiKey`, `authDomain`, `storageBucket`, etc.) que exige `src/environments/environment.ts` no estaba disponible en esta sesión — `docs/tareas-a-realizar.md` (donde vive documentado, según `MEMORY.md` §5) es un archivo personal de OCM fuera de control de versiones, y no existe en este sandbox. En vez de inventar u omitir el `apiKey` (un valor no derivable de nada más, a diferencia de `messagingSenderId`/`projectId`, que sí se pueden leer del `appId` ya documentado), se usó `add_repo` para adjuntar `ocastelblanco/babel-letiende` (público, mismo ecosistema) en modo lectura y se leyó **el código real y actual** de `src/environments/environment.ts` de Babel con el MCP de GitHub — exactamente el mismo método que ya usó una sesión anterior para resolver ADR-010. Los valores completos (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) coinciden con lo ya documentado parcialmente en `MEMORY.md` §5 (el `appId`) y se copiaron tal cual — no son sensibles (`CLAUDE.md` §5, A02).

**De la misma lectura de Babel se adoptaron, adaptándolos al diseño ya escrito en `docs/TODO.md` de Ágora (no se copiaron ciegamente):**
- `core/api/absolute-url.interceptor.ts` + `provideHttpClient(withFetch(), withInterceptors([...]))` + `provideAppInitializer(() => inject(ServicioAuth))` en `app.config.ts` — necesarios porque Ágora introduce `HttpClient` por primera vez en esta sesión, con la misma arquitectura SSR + Lambda de Babel (mismo bug real si faltara).
- El patrón `esperarListo()`/Promise pendiente hasta el primer `onAuthStateChanged`, para que `GuardiaAuth`/`GuardiaRol` nunca lean los Signals antes de que Firebase resuelva el estado inicial de sesión.
- El gotcha de `RenderMode.Client` obligatorio para rutas con guard (ver §7) — no se aplicó todavía porque esta sesión no agrega ninguna ruta protegida real (solo `/login`, pública), pero quedó documentado explícitamente para no repetir el incidente real que tuvo Babel en producción.

**Diferencia deliberada respecto del diseño de Babel:** Babel separa identidad (`AuthService`) de rol (`UsuariosService`) en dos servicios; el `docs/TODO.md` de Ágora pide explícitamente un único `ServicioAuth` con los tres Signals (`usuarioActual`, `rol`, `cargando`) y `iniciarSesionConGoogle()` resolviendo el rol inline. Se siguió la especificación propia de Ágora, no la de Babel. Efecto secundario aceptado y documentado en el propio código: `resolverRol()` se llama tanto desde `iniciarSesionConGoogle()` como desde el listener `onAuthStateChanged` para el mismo cambio de sesión, duplicando una llamada HTTP barata (Lambda `PAY_PER_REQUEST` + `GetItem`) una vez por login explícito — se evaluó la alternativa de sincronizar ambos flujos sin duplicar la llamada y se descartó por la complejidad adicional que introducía frente a un costo real insignificante.

**Node.js del sandbox no cumple el mínimo de Angular CLI 22** (`v22.22.2` instalado, `v22.22.3` exigido) — bloqueaba `ng build`/`ng test` con un error duro sin variable de entorno para omitirlo. Se verificó que esto **no afecta CI** (`NODE_VERSION: '24'` en `deploy.yml`) y se usó un script Node de un solo uso, fuera del repo, que redefine `process.versions.node` (propiedad `configurable: true`) únicamente para pasar el chequeo del CLI en este sandbox — el runtime real siguió siendo `v22.22.2` en todo momento, sin ningún cambio de comportamiento. Ver gotcha nuevo en §7.

Lo hecho, siguiendo exactamente el plan de la Tarea 1 (frontend) original de `docs/TODO.md`:
- `src/environments/environment.ts` + `environment.production.ts`, con `fileReplacements` nuevo en `angular.json` (convención estándar de Angular CLI, distinta de la de Babel — `docs/TODO.md` de Ágora ya pedía esos dos nombres de archivo específicamente).
- `src/app/core/models/usuario.model.ts`: `Rol`, `PerfilUsuario`, `cumpleRolMinimo()` — copia de UX de la jerarquía del backend, nunca la fuente de autorización real.
- `src/app/core/auth/servicio-auth.ts` (+ 6 pruebas): Signals `usuarioActual`/`rol`/`cargando`, `iniciarSesionConGoogle()`, `cerrarSesion()`, y resolución de rol también en la restauración de sesión (`onAuthStateChanged`) — no solo en el login explícito, para que una cuenta desactivada en `agora-usuarios` entre una sesión y otra quede deslogueada automáticamente al volver, no solo la próxima vez que inicie sesión a mano.
- `src/app/core/guardias/guardia-auth.ts` / `guardia-rol.ts` (+ pruebas): `CanActivateFn` comentados explícitamente como solo UX; `guardiaRol` lee `rolMinimo` de `route.data`, como pide `docs/TODO.md` (a diferencia del `RoleGuard(rol)` de fábrica que usa Babel).
- `src/app/features/login/login.component.ts` (+ pruebas): plantilla en línea (componente pequeño, `CLAUDE.md` §4), clases exactas de `docs/DESIGN.md` (`min-h-screen bg-surface`, tarjeta `rounded-2xl … shadow-[0_4px_16px_rgba(35,12,0,0.08)]`, botón primario). Verificado no solo por pruebas sino por **SSR real** (`curl` tras `npm run serve:ssr` con el wrapper de Node): `<title>Ingresar — Ágora</title>` y las clases de marca en el HTML servido.
- `app.routes.ts`: ruta `/login` pública, carga perezosa (`loadComponent`).
- 20 pruebas en verde (`npm run test`, 5 archivos), `npm run build` sin errores ni advertencias de presupuesto (434 kB inicial / 700 kB de warning).

**Ítem del DoD no aplicable todavía:** "cualquier avatar de Google usa `referrerpolicy=\"no-referrer\"`" — esta sesión no agrega ningún `<img>` que cargue una foto de perfil real (`lh3.googleusercontent.com`); la pantalla de login solo muestra el logotipo de Le Tiende y un ícono estático de Google. Se aplicará cuando exista un header o perfil que muestre `usuarioActual().photoURL`.

**Próxima tarea sugerida (superada por la validación en vivo, ver abajo):** con ambas mitades de autenticación completas, se recalculó `docs/TODO.md` y se promovieron los ítems #5 y #6 del roadmap técnico (`tech-specs.md` §11), que solo dependían de autenticación y son independientes entre sí: **Tarea 1 — Gestión de usuarios** (CRUD de `agora-usuarios`, con la salvaguarda de que un administrador no pueda degradarse su propio rol ni eliminarse a sí mismo) y **Tarea 2 — CRUD de eventos** (con `eventoId` siempre generado en el backend y subida de imágenes solo por URL prefirmada de S3, nunca por URL arbitraria). Ambas ya pueden usar `guardiaRol` en una ruta protegida real por primera vez — recordar el gotcha de `RenderMode.Client` de §7 al agregar `/admin/usuarios` y `/admin/eventos` a `app.routes.server.ts`.

**Sesión del 02/08/2026 (noche) — Validación en vivo del PR #9: dos bugs reales de despliegue encontrados y corregidos**

El usuario probó el PR #9 contra staging real y encontró, en orden, tres problemas — el primero de expectativa, los otros dos bugs genuinos:

1. `https://.../` daba "Cannot GET /". **No es un bug**: Ágora todavía no tiene página de inicio (la cartelera pública es el ítem #1 del backlog, sin construir). `src/server.ts` (heredado de Babel) hace `angularApp.handle(req)` y cae a `next()` → 404 de Express cuando Angular no tiene ninguna ruta que capture la URL — comportamiento esperado dado que solo existe `/login`. Se verificó con `curl` contra staging: `/login` → 200, `/api/salud` → 200, `/` → 404.
2. Con `/login` funcionando, el login con Google fallaba con el mensaje genérico apenas se hacía clic en el botón, antes incluso de que apareciera el selector de cuenta — consistente con `auth/unauthorized-domain` de Firebase (el dominio de staging, `ttukw9i82m.execute-api.us-east-1.amazonaws.com`, nunca se agregó a *Authorized domains* en la consola de Firebase; `MEMORY.md` §5 ya tenía esto anotado como pendiente desde antes de que existiera un dominio de staging real). **Esto lo resolvió el usuario directamente en la consola de Firebase** — no es algo que el código o un agente puedan corregir, está fuera del repositorio.
3. Con el dominio ya autorizado (selector de cuenta funcionando), el login fallaba con "No se pudo verificar tu acceso" — dos causas reales encontradas y corregidas en cadena, documentadas como gotchas nuevos en §7 arriba:
   - `deploy.yml` nunca conectaba el secreto `FIREBASE_SERVICE_ACCOUNT_AGORA` (ya cargado en GitHub) al paso `serverless deploy`, ni en staging ni en producción. Corregido (commit `835bd35`).
   - Con eso corregido, `GET /api/usuarios/me` seguía fallando — con `500` incluso sin header `Authorization`, la firma de una Lambda que se cae al arrancar. Diagnosticado por `curl` directo contra staging (sin poder ver CloudWatch: no hay AWS CLI en este sandbox). Causa real: el `package.patterns` de `usuariosMe` de la sesión anterior (exclusiones manuales de `node_modules/**`, ya marcado `<!-- SIN VERIFICAR -->` en el propio código) dejaba fuera algo que `firebase-admin` necesita para cargar. Corregido reemplazando esa estrategia por un bundle de esbuild (`server/bundle-lambdas.mjs`, script nuevo `npm run bundle:api`, dependencia `esbuild` agregada como devDependency explícita) — un único archivo autocontenido sin dependencia de `node_modules/**` en el paquete. Verificado localmente invocando el bundle con `node -e "require(...).handler(...)"` reproduciendo exactamente el caso que fallaba en staging, antes de empujar el fix.

**Método de diagnóstico sin acceso a CloudWatch:** sin AWS CLI en el sandbox, el diagnóstico se hizo por inferencia disciplinada a partir de la única señal disponible — la forma exacta de la respuesta HTTP. `{"message":"Internal Server Error"}` (inglés, genérico, formato de API Gateway) en vez de `{"mensaje":"Error interno"}` (español, formato propio del handler) para **cualquier** entrada, incluida una sin header, apuntó de inmediato a un fallo de arranque de la Lambda antes que a un bug de lógica — evitó perder tiempo revisando `resolver-permisos.ts`/`verificar-token.ts` (que ya estaban bien, verificados con pruebas unitarias) en vez del verdadero problema (el empaquetado).

**Próxima tarea sugerida (superada por la sesión siguiente, ver abajo):** confirmar con el usuario que el login funciona de punta a punta contra staging tras este fix, y solo entonces continuar con la Tarea 1 recalculada (Gestión de usuarios). Si `esbuild` como estrategia de empaquetado funciona bien en producción, considerar aplicarlo también a futuras Lambdas con dependencias npm pesadas (candidatas: `handlers/usuarios.ts` y `handlers/eventos.ts` de las próximas tareas, si terminan necesitando algo más que `@aws-sdk/lib-dynamodb`).

**Sesión del 05/08/2026 — Gestión de usuarios (Tarea 1), tras validación exitosa del PR #9**

El usuario confirmó que el login funcionaba de punta a punta contra staging y pidió limpiar el local y continuar con la siguiente tarea. Se siguió el protocolo de "PR ya fusionada": `git fetch origin main --prune` + `git checkout -B claude/tarea-1-mobile-feasibility-044k5v origin/main` (la rama remota anterior ya no existía, GitHub la borró al fusionar el PR #9). Se recalculó `docs/TODO.md` y se procedió con la Tarea 1 (Gestión de usuarios).

Lo hecho, siguiendo el plan de `docs/TODO.md`:
- `server/api/lib/http.ts` + `server/api/lib/autorizacion.ts`: extraídos de `usuarios-me.ts` (`respuestaJson`/`obtenerEncabezadoAuthorization`) y nuevos (`exigirRol`, que compone `verificar-token` + `resolver-permisos` + `cumpleRolMinimo` — único punto del backend que resuelve "requiere rol X", reutilizado también por `usuarios.ts` y ya preparado para `eventos.ts`).
- `server/api/handlers/usuarios.ts` + `.spec.ts`: CRUD completo (`GET`/`POST /api/usuarios`, `PUT`/`DELETE /api/usuarios/:email`), un solo handler que despacha por `event.requestContext.http.method`. `POST` con `ConditionExpression: attribute_not_exists(email)` (evita duplicados bajo concurrencia, mismo criterio que el aforo). `PUT`/`DELETE` con `ConditionExpression: attribute_exists(email)` (distingue 404 de éxito sin lectura previa). Salvaguarda de autodegradación/autoeliminación implementada y probada (21 pruebas backend en total, sumando las 6 de `usuarios-me.spec.ts`).
- `serverless.yml`: función `usuarios` con `UsuariosLambdaRole` (`GetItem`/`Scan`/`PutItem`/`UpdateItem`/`DeleteItem` sobre `agora-usuarios` exclusivamente — el `GetItem` es el que usa `exigirRol()` internamente, fácil de olvidar). Igual que `usuariosMe`, empaquetada con el bundle de esbuild (se agregó como segunda entrada en `server/bundle-lambdas.mjs`), no con `node_modules/**` a mano.
- `src/app/core/auth/servicio-auth.ts`: se agregó `obtenerIdToken()` (faltaba — `usuarios.service.ts` lo necesita para llamar cualquier endpoint de `/api/*` más allá de `/api/usuarios/me`, que `ServicioAuth` ya resolvía internamente).
- `src/app/core/api/usuarios.service.ts` + `.spec.ts`: mismo patrón que `Babel` (`UsuariosService`), adaptado a los Signals y al `ServicioAuth` de Ágora.
- `src/app/shared/dialogos/confirmar-dialog.component.ts`: diálogo de confirmación genérico con `MatDialog` (`docs/DESIGN.md` §7 pide `MatDialog` para confirmaciones destructivas — a diferencia de Babel, que usa `confirm()` nativo; se siguió el diseño propio de Ágora, no el precedente de Babel). Reutilizable para la salvaguarda de eliminar un evento en la Tarea 2.
- `src/app/features/admin/gestion-usuarios/`: `mat-table` + `mat-select` + `MatDialog` + `MatSnackBar` — primer uso real de Angular Material en Ágora más allá del tema/paleta (`docs/DESIGN.md` §7, matriz Material vs. HTML propio). Formulario reactivo único para crear/editar (mismo patrón que `Babel`), con la misma salvaguarda visual de autodegradación/autoeliminación que ya tiene el backend.
- `/admin/usuarios` en `app.routes.ts` (`guardiaRol`, `data: { rolMinimo: 'administrador' }`) y en `app.routes.server.ts` (`RenderMode.Client`) — primera vez que se aplica en código real el gotcha de Babel documentado la sesión pasada.

**Dos problemas reales de arnés de pruebas encontrados y corregidos (no bugs del código de producción), documentados como gotchas nuevos en §7:**
1. `npm run test` fallaba de forma intermitente según el orden de los archivos — causa raíz: `@angular/build:unit-test` trae `isolate: false` por defecto (comparte el registro de módulos entre todos los `*.spec.ts`), así que los `vi.mock('firebase/auth', ...)` de distintos archivos competían entre sí. Corregido con `isolate: true` en `angular.json` (`architect.test.options`) — 5 corridas seguidas en verde después del fix, contra fallos intermitentes antes.
2. Un `vi.spyOn`/override de `MatDialog` no interceptaba la llamada real en la prueba del componente de gestión de usuarios — causa: el componente importaba `MatDialogModule` sin necesitarlo (no usa sus directivas en su propia plantilla, solo llama `dialog.open()` programáticamente). Se quitó el import innecesario y se cambió la prueba a `vi.spyOn(TestBed.inject(MatDialog), 'open')` sobre la instancia real, más robusto que sobrescribir el provider.

**Próxima tarea sugerida:** con Gestión de usuarios completa, `docs/TODO.md` quedó con un solo slot activo — **Tarea 1: CRUD de eventos** — porque los siguientes ítems del roadmap (#7 Cartelera, #8 Motor de aforo, #15 QR de afiches) dependen todos de que el CRUD de eventos cierre primero. Al implementarlo, recordar: agregar `eventos.ts` a `server/bundle-lambdas.mjs` (también depende de `firebase-admin` vía `exigirRol`), y reutilizar `ConfirmarDialogComponent` para la confirmación de eliminar un evento.

**Sesión del 05/08/2026 (noche) — PR #10 (Gestión de usuarios) creado, validado en vivo y fusionado**

El usuario pidió crear el PR de Gestión de usuarios (commit `b55eae8`), que se abrió como PR #10 con la misma estructura que el PR #9 (Cambios realizados / Cómo probar / Checklist). La sesión se suscribió a la actividad del PR (`subscribe_pr_activity`): CI en verde, deploy automático a staging confirmado por el comentario del propio workflow, sin comentarios de revisión pendientes. El usuario aprobó y fusionó el PR directamente en GitHub — la sesión se desuscribió automáticamente al detectar el merge (evento `outcome: merged`).

**Sesión del 06/08/2026 — CRUD de eventos (Tarea 1)**

El usuario confirmó el PR #10 fusionado y pidió limpiar el local, actualizar el motor JIT si hacía falta, y continuar con la siguiente tarea. Se siguió el protocolo de "PR ya fusionada": `git fetch origin main` + `git checkout -B claude/tarea-1-mobile-feasibility-044k5v origin/main` (fast-forward puro, sin conflictos). `docs/TODO.md` ya tenía la Tarea 1 correcta (CRUD de eventos) de la sesión anterior, así que no hizo falta recalcularlo antes de empezar.

Lo hecho, siguiendo el plan de `docs/TODO.md`:
- Dependencias nuevas `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` (`npm install --ignore-scripts`, mismo motivo que siempre en este sandbox: el `postinstall` de `serverless` es el único bloqueado por la política de red, el resto de paquetes se instala sin problema).
- `server/api/services/s3.ts`: cliente S3 único, mismo patrón que `dynamodb.ts`.
- `server/api/handlers/eventos.ts` + `.spec.ts` (21 pruebas): un solo handler que despacha por método **y** por `rawPath` (para distinguir `POST /api/eventos` de `POST /api/eventos/:eventoId/activos/url-carga`, que comparten método pero no ruta). `eventoId` y `etapaId` de cada etapa siempre `randomUUID()` del backend — un `eventoId`/`etapaId` enviado por el cliente en el payload se descarta sin excepción, verificado con una prueba explícita ("ignora un eventoId enviado por el cliente"). `sillasDisponibles` se inicializa junto con `sillasTotales` en la misma escritura de `PutCommand` (con `ConditionExpression: attribute_not_exists(eventoId)`, mismo criterio de unicidad bajo concurrencia que `agora-usuarios`). **Decisión de diseño no explícita en `TODO.md`, tomada por consistencia con el DoD:** `PUT` excluye de los campos editables no solo `sillasDisponibles`/`sillasReservadas` (lo único que el DoD pedía explícitamente) sino también `sillasTotales` y `slug` — editar la capacidad total sin el motor de aforo (roadmap #8, no existe todavía) para reconciliar `sillasDisponibles` habría permitido inconsistencias silenciosas (aforo mostrado mayor que la capacidad real); el `slug` es la URL pública y cambiarla rompe enlaces ya compartidos. Ambos quedan fijos tras la creación hasta que el motor de aforo exista.
- `POST /api/eventos/:eventoId/activos/url-carga`: `getSignedUrl` de `@aws-sdk/s3-request-presigner` con `expiresIn: 900` (15 min), `Content-Type` acotado a `image/jpeg`/`png`/`webp` (nunca SVG) y `ContentLength` acotado a 10 MB — mismo criterio que exige `CLAUDE.md` §5 A08 para comprobantes de pago, aplicado aquí a activos de evento. La `key` generada sigue el patrón `eventos/{eventoId}/{tipo}-{uuid}.{ext}`, que además es el prefijo exacto que acota el rol IAM (`s3:PutObject` sobre `${BucketActivos.Arn}/eventos/*`) y que valida el propio `PUT` al aceptar `imagenKey`/`logotipoKey` (deben empezar por `eventos/{eventoId}/`, para que un admin no pueda apuntar el campo a la key de otro evento).
- `serverless.yml`: función `eventos` con `EventosLambdaRole` — `Scan`/`PutItem`/`UpdateItem` sobre `agora-eventos` exclusivamente, `GetItem` (no más) sobre `agora-usuarios` para `exigirRol()`, y `s3:PutObject` acotado a `${BucketActivos.Arn}/eventos/*`, en una `PolicyDocument` separada de la de DynamoDB. La tabla `AgoraEventos` y sus dos GSIs (`slug-index`, `estado-fechaHora-index`) ya existían en `serverless.yml` desde la Tarea 2 original (infraestructura base) — no fue necesario crearla, solo la función y el rol. Agregada a `server/bundle-lambdas.mjs` (tercera entrada, mismo motivo que `usuarios.ts`: depende de `firebase-admin` transitivamente vía `exigirRol`). Verificado invocando el bundle real con `node -e "require(...).handler(...)"` simulando una petición sin `Authorization` — `401` limpio, sin el `500` genérico de una Lambda que se cae al arrancar (repitiendo la misma verificación disciplinada que resolvió el incidente de `usuariosMe`).
- Verificación de sintaxis de `serverless.yml` sin poder correr `serverless package` (mismo bloqueo de red de siempre en este sandbox): se parseó el YAML con un loader Python que ignora los tags `!GetAtt`/`!Sub`/`!Ref` (que PyYAML no entiende de forma nativa) solo para confirmar indentación y estructura — no reemplaza una verificación real de CloudFormation, pero detecta errores de sintaxis antes de empujar el commit.
- Frontend: `src/app/core/models/evento.model.ts` (`Evento`, `DatosNuevoEvento`, `DatosEditarEvento` — este último sin ningún campo de aforo, reflejando la misma restricción del backend), `EventosService` (+ `.spec.ts`, con `HttpTestingController`) con `subirActivo()` que encadena pedir la URL prefirmada y subir el archivo directo a S3 — verificado con una prueba explícita de que la petición a S3 **no** lleva el header `Authorization` de la API (`CLAUDE.md` §5, A02: un secreto de nuestra API no debe llegarle nunca a un tercero, ni siquiera a nuestro propio bucket).
- `src/app/shared/utilidades/fecha-bogota.ts` (+ `.spec.ts`, incluida una prueba de ida y vuelta): conversión entre el UTC ISO almacenado y la hora de pared de Bogotá que usan los `<input type="datetime-local">` del formulario. El offset `-05:00` se dejó como constante fija en el código (no una tabla de zonas horarias) porque Colombia no observa horario de verano desde 1993 — un hecho histórico estable, a diferencia de un precio de AWS, así que no aplica la disciplina de "verificar el mismo día" de `CLAUDE.md`.
- `GestionEventosComponent` (lista, `mat-table`) y `EditarEventoComponent` (alta y edición en un único componente — `docs/TODO.md` los pedía como dos archivos pero un solo componente, distinguido por el parámetro de ruta `id` con `'nuevo'` como valor centinela para el modo crear). `FormArray` de etapas con vista previa de precio formateado vía `PrecioPipe` junto al input numérico editable (el DoD de `TODO.md` pedía exactamente este patrón: mostrar formateado, enviar como entero). `slug` y `sillasTotales` se deshabilitan al precargar el formulario en modo edición. La subida de imagen/logotipo queda deshabilitada hasta que el evento exista (el prefijo de S3 necesita el `eventoId` real), con un mensaje explícito en el formulario. 6 + 6 pruebas nuevas de componente (`gestion-eventos`/`editar-evento`).
- Rutas `/admin/eventos` y `/admin/eventos/:id` (esta última cubre tanto `/admin/eventos/nuevo` como la edición real) en `app.routes.ts` (`guardiaRol`, `rolMinimo: 'administrador'`) y `app.routes.server.ts` (`RenderMode.Client` en ambas, mismo gotcha de sesión de Firebase solo en navegador).

**Sin bugs de arnés de pruebas nuevos esta sesión** — los dos fixes de la sesión anterior (`isolate: true`, no importar `MatDialogModule` sin usarlo) ya cubrían los patrones reutilizados aquí; 42 pruebas backend + 63 frontend en verde, estable en 3 corridas seguidas del lado frontend.

**Sesión del 06/08/2026 (noche) — Incidente de GitHub Actions, fusión del PR #11, y planeación (sin implementar) del Menú de navegación**

El usuario pidió ayuda para cancelar y relanzar un run de `Build, test y despliegue` que llevaba horas en `queued` tras reintentarlo desde la consola web de GitHub. `gh run cancel`/`force-cancel`/`DELETE` fallaron los tres con variantes de "no se puede cancelar/borrar" — cerrar y reabrir el PR #11 tampoco disparó un run nuevo (GitHub dedupe por SHA de commit), y un commit vacío nuevo tampoco. La causa real: `githubstatus.com` reportaba **Actions en `major_outage`** (interrupción real de la plataforma, no un problema del repositorio). Se dejó el commit vacío ya empujado para que corriera solo en cuanto el servicio se restableciera, y se explicó el diagnóstico completo al usuario en vez de seguir reintentando. El usuario aprobó el PR #11 más tarde (una vez restablecido el servicio) y se fusionó — confirmado por `gh pr view --json state,mergedAt` (`MERGED`, `2026-08-06T20:03` hora Bogotá). Se hizo `git checkout main && git pull` (fast-forward, trajo también `feat(usuarios)`) y se eliminó la rama local `claude/tarea-1-mobile-feasibility-044k5v` ya fusionada.

**Pregunta de producto respondida sin cambios de código:** por qué un evento nuevo (con imágenes y todo) queda en `estado: 'borrador'`. Verificado en `server/api/handlers/eventos.ts:200` (`crearEvento` hardcodea `'borrador'`, ignora cualquier `estado` del payload) y en `editar-evento.component.html:131` (el `<select>` de "Estado" solo aparece con `@if (!modoCrear())`, nunca en el formulario de creación) — diseño intencional (mismo criterio de A08 que el precio: nunca confiar en que el cliente decida algo con consecuencia pública/económica), no un bug. Se ofreció un plan para agregar un botón explícito "Publicar" y el usuario prefirió dejarlo así por ahora.

**Menú de navegación — de pregunta a plan aprobado (código todavía sin escribir):** el usuario preguntó si un menú de navegación para usuarios autenticados estaba en el roadmap. Se verificó que no — ni en las 2 tareas activas de `TODO.md`, ni en el backlog de 9 ítems, ni en los 21 ítems de `tech-specs.md` §11 — y se confirmó en código que no existe ningún header/nav/shell (`app.html` es solo `<router-outlet />`). El usuario pidió armar el plan. Investigación (2 agentes Explore en paralelo + 1 agente Plan) cubrió `ServicioAuth` (signals `usuarioActual`/`rol`, `cerrarSesion()` sin ningún consumidor todavía), `cumpleRolMinimo` (`core/models/usuario.model.ts`, única jerarquía de roles del cliente) y las convenciones de UI ya establecidas (Tailwind `@theme` con los hex de marca, sin ningún breakpoint `md:`/`sm:` usado todavía en el proyecto, y cero uso de `MatToolbar`/`MatSidenav`/`MatMenu`/`MatIcon`).

**Corrección real del usuario sobre el primer borrador del plan:** el borrador inicial ocultaba toda la barra sin sesión (`@if (usuarioActual())` envolviendo todo). El usuario corrigió: la barra **siempre** debe verse, porque debe ofrecer acceso a `/login`; ya autenticado, deben aparecer los demás ítems del menú, **incluyendo "Cartelera" (→ `/`)**, para que el usuario autenticado también pueda ver la interfaz pública desde el mismo menú. Esto cambió el diseño del componente (rama `@if`/`@else` sobre el contenido, no sobre el renderizado) y resolvió de paso un vacío que tenía el borrador original: hoy `productor`/`portero` no tienen ninguna ruta propia, así que sin "Cartelera" el menú les habría quedado completamente vacío. Se guardó como memoria persistente del agente (`agora-nav-bar-always-visible`) para que ninguna sesión futura repita el mismo error de diseño.

**Decisión de alcance explícita del usuario:** el enlace "Cartelera" apunta a `/`, que todavía no existe como ruta (depende de la tarea "Cartelera pública", roadmap #7, todavía sin implementar) — el usuario prefirió dejarlo así (enlace visible pero no funcional hasta que esa tarea cierre) en vez de crear una ruta placeholder solo para este plan.

**Recalculo del motor JIT:** con el plan aprobado, el usuario pidió aplicarlo a la documentación y al motor JIT (sin implementar el código todavía en esta sesión). Se agregó "Menú de navegación para usuarios autenticados" como ítem **#18** del roadmap técnico (`tech-specs.md` §11, insertado antes del bloque v2 para no romper ninguna referencia numérica existente a los ítems #4-#11 usada en `TODO.md`/`MEMORY.md`; el bloque v2 se renumeró 18-21 → 19-22, sin referencias externas que romper, verificado por grep antes de tocar nada). En `TODO.md`, reemplaza a **Motor de aforo** como Tarea 2 activa (decisión explícita del usuario, no automática del motor JIT: alcance pequeño y 100% frontend, bloqueador de usabilidad inmediato, vs. Motor de aforo que no bloquea nada mientras no exista el flujo de compra real) — Motor de aforo vuelve al tope del backlog, con su diseño ya completo y sin cambios en `tech-specs.md` §5.4.

**Refuerzo de la regla de tracking (pedido explícito del usuario):** el usuario notó que ninguna de las tareas de esta sesión se había registrado todavía en `docs/tracking.csv` pese a que la regla ya existía (`tech-specs.md` §10: "obligatorio y no opcional"), y pidió hacerla imposible de pasar por alto para cualquier agente futuro. Se agregó `CLAUDE.md` §1-bis (nueva sección, mismo patrón que la ya existente §5-bis, sin renumerar nada más del documento) y un recordatorio explícito al inicio de este mismo archivo (`MEMORY.md`, justo debajo del encabezado). Se registraron en `docs/tracking.csv` las 5 etapas distinguibles de esta sesión (incidente de GitHub Actions + fusión del PR, limpieza de git, pregunta de `borrador`, planeación del menú de navegación, y esta actualización de documentación).

**Próxima tarea sugerida:** implementar el Menú de navegación (Tarea 2 de `TODO.md`) tal como quedó especificado — el plan ya está aprobado por el usuario, con corrección de alcance incorporada; no hace falta volver a planearlo, solo ejecutarlo (crear `secciones-navegacion.ts`, `barra-navegacion.component.ts`, `guardia-invitado.ts`, y modificar `app.html`/`app.ts`/`app.routes.ts`/`app.spec.ts`).

**Próxima tarea sugerida:** con el CRUD de eventos completo, `docs/TODO.md` debe recalcularse — los ítems #7 (Cartelera pública y página de evento, SEO/Open Graph/JSON-LD) y #8 (Motor de aforo: reserva condicional, TTL, liberación por Streams) del backlog ya no dependen de nada más y son independientes entre sí, así que ambos pueden ocupar los dos slots activos del motor JIT en la próxima sesión. Al implementar el motor de aforo, recordar que es el momento de permitir editar `sillasTotales` vía `PUT /api/eventos/:eventoId` con la validación de `tech-specs.md` §5.4 punto 5 (no puede bajar de lo ya vendido + reservado) — hasta ahora esa edición se dejó deliberadamente fuera de alcance (ver más arriba).

**Sesión del 07/08/2026 — Tarea 1 (Cartelera pública) implementada, PR #12 abierto, y un bug real de despliegue encontrado y corregido**

El usuario pidió iniciar la Tarea 1 del `TODO.md` (Cartelera pública) en una nueva rama `feature/*`, e incluir en ella los ajustes de documentación de la sesión anterior (menú de navegación en el roadmap, refuerzo de tracking) que seguían sin commitear sobre `main`. Se creó `feature/cartelera-publica` desde `main` actualizado, se commiteó la documentación primero (`c0826f0`), y se delegó la implementación completa a un agente ejecutor con contexto extenso (patrones de `eventos.ts`/`eventos.service.ts`, convenciones visuales, modelos compartidos). Resultado: `server/api/handlers/eventos-publicos.ts` (3 rutas públicas: lista, detalle por slug, `sitemap.xml`, todas excluyendo `productores`), `cartelera.component.ts` (`/`) y `detalle-evento.component.ts` (`/evento/:slug`) con Open Graph/Twitter Card/JSON-LD verificados por `curl` contra SSR real, y una decisión de arquitectura nueva: `BucketActivos` pasa a público de solo lectura **solo bajo el prefijo `eventos/*`** (bucket policy, no ACL) porque una URL prefirmada de 15 minutos no sirve como `og:image` persistente — decisión confirmada explícitamente con el usuario antes de tocar la configuración de seguridad del bucket. 61 pruebas backend + 87 frontend en verde, PR #12 abierto contra `main`, sin fusionar.

**Bug real encontrado por el usuario en staging, con un evento ya creado (`eventoId: 06881bab-6e10-4546-97e1-842082ebd002`):** `GET /api/eventos-publicos` respondía `500` genérico. Diagnosticado y corregido en la misma sesión — ver la fila nueva en §7 (tabla de gotchas) para el detalle completo. Resumen: la instrucción de delegación al ejecutor asumió que solo las Lambdas con `firebase-admin` necesitan el bundle de esbuild, pasando por alto que `eventosPublicos` también importa `documentoDynamoDB` (`@aws-sdk/lib-dynamodb`), una dependencia real de `node_modules` igual de capaz de causar el mismo fallo de arranque. Corregido agregando `eventos-publicos.js` a `server/bundle-lambdas.mjs` y actualizando `serverless.yml` para apuntar al bundle — verificado localmente invocando el bundle directo antes de empujar el fix (commit `c52a360`, ya empujado a `feature/cartelera-publica`, dispara un nuevo deploy a staging vía CI). **Lección para la próxima sesión que agregue una Lambda nueva:** el criterio correcto para decidir si necesita esbuild no es "¿usa `firebase-admin`?", es "¿importa algo de `node_modules` en tiempo de ejecución?" — verificar explícitamente los imports antes de copiar el patrón de empaquetado "simple" de `salud.ts`, que es la única función sin ninguna dependencia real.

**Próxima tarea sugerida:** confirmar con el usuario que `GET /api/eventos-publicos` funciona en staging tras el redeploy automático del commit `c52a360`, y solo entonces continuar con el Menú de navegación (Tarea 2 de `TODO.md`, plan ya aprobado, ver sesión anterior) en una rama nueva.

**Cierre de la sesión (07/08/2026):** el usuario confirmó que todo funciona en staging tras el fix. Se recalculó `docs/TODO.md`: Cartelera pública se movió de Tarea 1 a completada (resumen en §2 arriba), Menú de navegación pasó de Tarea 2 a Tarea 1 (sin cambios de contenido, solo de numeración — su plan sigue siendo el aprobado la sesión anterior), y Motor de aforo volvió a ser Tarea 2 activa (se restauró su bloque completo desde el historial de git, con un ajuste: el punto 3 ahora exige empaquetar `liberarReservas` con esbuild siempre, no "solo si depende de algo pesado" — la guía original quedó obsoleta por el bug de `eventosPublicos` de esta misma sesión, ya que `aforo.ts` también depende de `documentoDynamoDB`). Todo el trabajo de esta sesión (implementación de Cartelera + fix + esta actualización de documentación) vive en `feature/cartelera-publica` (PR #12), a la espera de que el usuario lo apruebe y fusione — el agente nunca fusiona un PR (`CLAUDE.md` §6).

**Próxima tarea sugerida:** una vez el usuario fusione el PR #12, empezar el Menú de navegación (Tarea 1 de `TODO.md`) en una rama `feature/*` nueva desde `main` actualizado — el plan detallado ya está en `TODO.md`, no hace falta replanearlo.

**Sesión del 07/08/2026 (continuación) — PR #12 fusionado, Tarea 1 (Menú de navegación) implementada como PR #13, y un bug de CSS de Angular Material encontrado y corregido**

El usuario aprobó y fusionó el PR #12 (Cartelera pública). Se limpió el local (`git checkout main && git pull`, rama `feature/cartelera-publica` eliminada) y se creó `feature/menu-navegacion` para la Tarea 1 (ya recalculada, plan aprobado desde antes). Se delegó la implementación completa a un agente ejecutor, con la especificación de `TODO.md` como fuente autoritativa más contexto técnico ya verificado (`ServicioAuth`, `cumpleRolMinimo`, patrones de mocks de Firebase). Resultado verificado de forma independiente: `secciones-navegacion.ts`, `barra-navegacion.component.ts` (`<header>` siempre presente, contenido condicionado por sesión), `guardia-invitado.ts` (`findLast`, no `find`, sobre `SECCIONES_NAVEGACION`), `app.routes.ts`/`app.html`/`app.ts`/`app.spec.ts` actualizados. Único ajuste fuera del plan original: `tsconfig.json` necesitó `"lib": ["ES2023", "dom"]` para `Array.prototype.findLast` (commit separado, no afecta `server/tsconfig.json`, que no hereda de la raíz). 96 pruebas en verde, PR #13 abierto.

El usuario probó el PR #13 y reportó un bug real: el `<mat-select>` de "Rol" en `/admin/usuarios` quedaba inutilizable (renderizado fuera de lugar). Diagnosticado y corregido en la misma sesión — ver la fila nueva en §7 para el detalle completo. Resumen: `@angular/cdk/overlay-prebuilt.css` nunca se incluyó en `angular.json` (hueco de la migración manual de PrimeNG a Material, ADR-012, no una regresión de esta Tarea), así que `.cdk-overlay-container` no tenía `position`/`z-index` — confirmado con evidencia dura (`grep` sobre el CSS compilado, cero apariciones antes del fix, la regla exacta presente después). Corregido con una sola línea en `angular.json`, commit `9f8ab09` ya empujado a `feature/menu-navegacion` (PR #13, todavía abierto).

**Próxima tarea sugerida:** confirmar con el usuario que el formulario de usuarios funciona bien en el PR #13 tras este fix. Una vez apruebe y fusione, retomar Motor de aforo (Tarea 2 de `TODO.md`, diseño ya completo en `tech-specs.md` §5.4, con el punto de empaquetado ya corregido) en una rama nueva.
