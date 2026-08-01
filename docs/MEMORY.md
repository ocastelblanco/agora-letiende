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

Nada aprovisionado todavía. Esta tabla se completa a medida que se crean los recursos — es el lugar donde buscar un ARN, un ID o una URL sin tener que entrar a la consola.

| Recurso | Valor | Estado |
|---|---|---|
| Región AWS | `us-east-1` | ✅ Definida (misma que Babel) |
| Cuenta AWS | Compartida con Babel y Comandante | ✅ Existe |
| Nombre del servicio Serverless | `agora-letiende` | ⬜ Por crear |
| Tablas DynamoDB | `agora-{usuarios,eventos,compras,boletas,auditoria}-{stage}` | ⬜ Por crear |
| Bucket de comprobantes | `agora-comprobantes-{stage}` (privado, SSE-S3, Block Public Access) | ⬜ Por crear |
| Bucket de activos | `agora-activos-{stage}` (imágenes de evento, QR) | ⬜ Por crear |
| Endpoint de API Gateway (staging) | — | ⬜ Por crear |
| Dominio de producción | `agora.letiende.co` | ⬜ Por configurar (DNS + certificado ACM) |
| Proyecto Firebase | El compartido de Le Tiende | ✅ Existe — falta registrar la app web de Ágora |
| Cuenta de servicio Firebase de Ágora | `FIREBASE_SERVICE_ACCOUNT_AGORA` | ⬜ Por generar |
| Remitente SES | `taquilla@letiende.co` | ⬜ Por verificar |
| **Estado del sandbox de SES** | **Fuera del sandbox** | ✅ Confirmado 31/07/2026 — se puede enviar a cualquier destinatario |
| Repositorio GitHub | ⬜ Por confirmar | Cuenta `ocastelblanco` |
| Secretos de GitHub Actions | Ver `tech-specs.md` §9 | ⬜ Por configurar |
| Cuenta Bold de Le Tiende | Existe (uso manual actual) | ⬜ Sin integrar (v2) |
| WABA de WhatsApp | No existe | ⬜ Trámite no iniciado (v2) |

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
