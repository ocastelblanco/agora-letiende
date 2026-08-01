# MEMORY.md — Ágora

Memoria de trabajo del proyecto. Es el primer documento que debe leer un agente IA al iniciar sesión: dice **dónde está el proyecto hoy**, qué decisiones ya se tomaron y por qué, y qué trampas ya se conocen.

Se actualiza al cierre de cada sesión de trabajo relevante.

---

## 1. Estado actual

| Atributo | Valor |
|---|---|
| **Versión** | 0.0.0 — sin código |
| **Fase** | Definición de especificaciones (`Specs definition`) |
| **URL de producción** | `https://agora.letiende.co` — ⬜ no aprovisionada |
| **URL de staging** | ⬜ no aprovisionada (será el endpoint de API Gateway) |
| **Rama principal** | `main` |
| **Último commit** | `7560cc9 docs: documentación inicial` |
| **Repositorio remoto** | ⬜ por confirmar (GitHub, cuenta `ocastelblanco`) |
| **Cuenta AWS** | Compartida con Babel y Comandante, región `us-east-1` |
| **Proyecto Firebase** | Compartido con Comandante y Babel (identidad); autorización propia en `agora-usuarios` |
| **Última sesión** | 31/07/2026 — bootstrap completo de documentación (este documento incluido) |

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

### Pendiente (v1 — MVP)

- [ ] Andamiaje del proyecto Angular 22 + PrimeNG 22 + Tailwind 4
- [ ] `serverless.yml` y flujo de CI/CD a staging
- [ ] Tema visual Le Tiende (preset PrimeNG + tokens Tailwind)
- [ ] Autenticación con Google y resolución de roles
- [ ] Gestión de usuarios
- [ ] CRUD de eventos
- [ ] Cartelera pública y página de evento (con SEO/Open Graph)
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

**Fecha:** 31/07/2026 · **Estado:** Aceptada

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

## 4. Dependencias instaladas

Ninguna todavía — no existe `package.json`. Estas son las versiones **previstas**, heredadas de Babel donde aplica. Al crear el proyecto, reemplazar esta tabla por las versiones exactas resueltas en `package-lock.json`.

| Paquete | Versión prevista | Uso |
|---|---|---|
| `@angular/core`, `common`, `router`, `forms` | ^22.0.0 | Framework |
| `@angular/ssr` | ^22.0.7 | Renderizado en servidor |
| `@angular/platform-server` | ^22.0.0 | SSR |
| `primeng` | ^22.0.0 | Componentes UI |
| `@primeuix/themes` | latest | Preset de tema propio |
| `tailwindcss` | ^4.3.3 | Utilidades CSS |
| `tailwindcss-primeui` | latest | Puente PrimeNG–Tailwind |
| `express` | ^5.1.0 | Servidor SSR |
| `@codegenie/serverless-express` | ^5.0.0 | Adaptador Lambda |
| `@aws-sdk/client-dynamodb`, `lib-dynamodb` | ^3.x | Acceso a datos |
| `@aws-sdk/client-s3`, `s3-request-presigner` | ^3.x | Comprobantes y activos |
| `@aws-sdk/client-sesv2` | ^3.x | Correo transaccional |
| `firebase` | ^12.16.0 | SDK cliente de autenticación |
| `firebase-admin` | ^14.2.0 | `verifyIdToken` en Lambdas |
| `@zxing/browser` | ^0.2.1 | Escaneo de QR en puerta |
| `qrcode` | ^1.5.x | Generación de QR (SVG/PNG) |
| `xlsx` | ^0.18.5 | Exportación de reportes (v2) |
| `serverless` | 4.x | IaC |
| `typescript` | ~6.0.2 | Lenguaje |
| `vitest` | ^4.0.8 | Pruebas del backend |
| `prettier` | ^3.8.1 | Formato |

---

## 5. Configuraciones vigentes

Esta tabla se completa a medida que se crean los recursos — es el lugar donde buscar un ARN, un ID o una URL sin tener que entrar a la consola.

| Recurso | Valor | Estado |
|---|---|---|
| Región AWS | `us-east-1` | ✅ Definida (misma que Babel) |
| Cuenta AWS | Compartida con Babel y Comandante — `696912647258` | ✅ Existe |
| Usuario IAM de despliegue | Compartido, `@ocastelblanco` (grupo `Administrador`, `AdministratorAccess`) — mismo usuario que Babel y Comandante, **no dedicado a Ágora** (ADR-009) | ✅ Existe — perfil `default` en `~/.aws/credentials` |
| Access Key ID de despliegue | `AKIA2EQZ3CRNMVGRO5X4` (no sensible; el secreto sí lo es y no se documenta aquí) | ✅ Ya usada por Babel en sus GitHub Secrets desde el 17/07/2026 |
| Nombre del servicio Serverless | `agora-letiende` | ⬜ Por crear (Tarea 2 de `TODO.md`) |
| Tablas DynamoDB | `agora-{usuarios,eventos,compras,boletas,auditoria}-{stage}` | ⬜ Por crear (Tarea 2) |
| Bucket de comprobantes | `agora-comprobantes-{stage}` (privado, SSE-S3, Block Public Access) | ⬜ Por crear (Tarea 2) |
| Bucket de activos | `agora-activos-{stage}` (imágenes de evento, QR) | ⬜ Por crear (Tarea 2) |
| Endpoint de API Gateway (staging) | — | ⬜ Por crear (Tarea 2) |
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
| **Verificado:** las fotos de perfil de Google devuelven 429 | `referrerpolicy="no-referrer"` en todo `<img>` que cargue `lh3.googleusercontent.com` |
| Primer escaneo del día en la puerta es lento | Cold start de la Lambda tras horas de inactividad, justo cuando se forma la fila. Considerar calentamiento manual al abrir la pantalla de ingreso; `provisioned concurrency` rompe el objetivo de costo $0 |
| La cámara no abre en iOS Safari | `getUserMedia` exige HTTPS y un gesto explícito del usuario. Disparar siempre desde un manejador de click/tap, nunca al cargar la página |
| Las reservas vencidas siguen ocupando aforo | El TTL de DynamoDB borra "típicamente en 48 horas", no al segundo. La lógica de negocio debe tratar como expirada toda reserva con `expiraEn` pasado, exista o no el ítem |
| El aforo crece por encima de `sillasTotales` | DynamoDB Streams entrega *at-least-once*: un evento duplicado devolvió sillas dos veces. La devolución debe ser condicional sobre `sillasReservadas >= :n` |
| Las boletas llegan a la carpeta de spam | Una boleta en spam es un cliente sin poder entrar. Verificar SPF (`include:amazonses.com`), DKIM y DMARC en `letiende.co`, y probar contra Gmail y Outlook reales antes del primer evento |
| Un locale `es-CO` mal registrado rompe el build SSR | Usar `Intl.NumberFormat` directamente en un pipe propio, no `CurrencyPipe`/`DecimalPipe` |

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

**Nota operativa:** al ejecutar `git checkout main` tras abrir el PR de ADR-009/010 y antes de que el usuario lo fusionara, la rama de Tarea 1 (`feature/andamiaje-angular-primeng-tailwind`) se cortó de un `main` que todavía no tenía esos ADRs. El PR se fusionó mientras se trabajaba en esta interrupción; se detectó a tiempo (antes de commitear) y se resolvió con `git stash` + `rebase` sobre el `main` actualizado + `stash pop`, con un conflicto menor en `docs/TODO.md` (el paso 6 de Tarea 2) resuelto combinando ambas versiones. Lección para el futuro: verificar si hay un PR de documentación pendiente de fusionar antes de ramificar para una tarea de código nueva.

**Próxima tarea sugerida:** retomar la Tarea 1 (andamiaje de Angular) donde quedó — `npm install` ya corrido, falta configurar el tema PrimeNG/Tailwind, el pipe de precio, la página de inicio y verificar el build.
