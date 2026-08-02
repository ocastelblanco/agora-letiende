# CLAUDE.md — Instrucciones del Proyecto Ágora

Este archivo contiene las directrices permanentes de arquitectura, código, seguridad y flujo de desarrollo para agentes IA y desarrolladores en el proyecto **Ágora**.

---

## 1. Descripción del Proyecto

**Ágora** es la aplicación de boletería del teatro del centro cultural **Le Tiende** (Bogotá, Colombia). Forma parte del ecosistema de aplicaciones de Le Tiende junto a **Comandante** (gestión general) y **Babel** (catalogación e inventario de la librería).

Ágora cubre el ciclo completo de la boletería de un espectáculo: el `administrador` crea el evento y define etapas, precios, aforo y medios de pago; el `cliente` navega los eventos públicos y compra sus boletas sin necesidad de crear cuenta; el `productor` valida los comprobantes de pago cuando la transacción no es automática; el `sistema` emite cada boleta digital con un código QR único y la entrega por correo; y el día del evento el `portero` escanea ese QR en la puerta para autorizar el ingreso.

El problema fundacional que resuelve es la operación manual actual —conversaciones sueltas de WhatsApp, comprobantes revisados a mano, listas de asistentes dispersas y validación de entrada leyendo nombres en papel—, que no centraliza información, no evita la sobreventa y satura de trabajo simultáneo a los administradores.

**Ágora es *mobile-first*** y adaptable a tableta y escritorio. Los dos flujos de ruta crítica son la **compra desde el celular del cliente** y la **validación en puerta desde el celular del portero**, ambos en condiciones de conectividad imperfecta y con prisa.

- **URL de producción:** `https://agora.letiende.co`
- **Documentos de referencia:** `docs/PRD.md` (producto), `docs/tech-specs.md` (arquitectura), `docs/MEMORY.md` (estado y decisiones), `docs/TODO.md` (tareas activas).

---

## 2. Stack Tecnológico y Versiones

- **Frontend Framework:** Angular 22.x (Standalone components, Signals, Router, SSR con `@angular/ssr`)
- **Suite de componentes UI:** Angular Material 22.x (tema Material 3 propio mapeado a la paleta Le Tiende) — **no PrimeNG**: PrimeNG 22 dejó de ser MIT (verificado contra el `LICENSE.md` real del paquete y el historial de npm), pasó a una licencia comercial "PrimeUI" que exige registro, llave y renovación anual incluso para el nivel gratuito. Angular Material es MIT sin condiciones y mantenido por el equipo de Angular. Ver ADR-012 en `docs/MEMORY.md`.
- **CSS Utility:** Tailwind CSS 4.x (mismo enfoque de layout que Babel y Comandante)
- **Tipo de aplicación:** aplicación web responsive (Mobile-First para compra y validación en puerta; escritorio para administración y panel de control) — sin empaquetado nativo (Capacitor/Cordova) en el alcance actual
- **Runtime backend:** Node.js 24.x
- **Despliegue/Infraestructura:** AWS Lambda + API Gateway (HTTP API), gestionados con **Serverless Framework 4** (IaC) — mismo patrón que Babel
- **Base de datos:** AWS DynamoDB, **`BillingMode: PAY_PER_REQUEST` siempre, en todas las tablas y todos los stages — nunca `PROVISIONED`.** No es una preferencia de estilo: es la regla de mayor prioridad de este documento. Ver §5-bis (Costos de infraestructura) y `docs/advertencia-urgente-costos-aws.md` (incidente real de Babel: US$90,34 en un mes por 18 unidades de capacidad `PROVISIONED 25/25` olvidadas, sobre un objetivo de costo $0)
- **Almacenamiento de archivos:** AWS S3 (comprobantes de pago privados, imágenes de evento y QR generados)
- **Autenticación:** Google Firebase Authentication (Google Sign-In) — **proyecto Firebase compartido con Comandante y Babel** (misma identidad de Google para las tres apps). Los roles de Ágora (`administrador`/`productor`/`portero`) son independientes por app y viven en `agora-usuarios` (DynamoDB) — ver `docs/tech-specs.md` §8.1
- **Correo transaccional:** AWS SES, remitente `taquilla@letiende.co` sobre el dominio `letiende.co` ya verificado en la cuenta AWS de Le Tiende
- **WhatsApp:** AWS End User Messaging Social — **fase 2**, no bloquea el MVP (ver ADR-003 en `docs/MEMORY.md`)
- **Pasarela de pagos:** Bold (Botón de pagos / API link de pagos) — **fase 2**
- **Generación de QR:** librería web del lado servidor para emisión (SVG + PNG) y `@zxing/browser` para el escaneo en puerta
- **Generación de reportes:** `xlsx` (mismo paquete que Babel y Comandante) para XLSX; PDF por definir
- **Objetivo de costo de infraestructura:** **< US$1/mes**, objetivo explícito y medido — no una aspiración vaga de "$0". No incluye el piso fijo compartido de la cuenta (Route 53, ~US$3,58/mes entre ~7 zonas para todo el ecosistema Le Tiende), que no es atribuible a Ágora. Ver §5-bis (Costos de infraestructura, disciplina de verificación de precios) y `docs/advertencia-urgente-costos-aws.md`.

---

## 3. Comandos de Uso Común

> Se completarán/ajustarán una vez exista `package.json` (Tarea 1 de `docs/TODO.md`). Referencia esperada, análoga a Babel:

- **Iniciar servidor de desarrollo local:** `npm run start` (o `ng serve`)
- **Ejecutar pruebas unitarias (frontend):** `npm run test`
- **Ejecutar pruebas unitarias (backend):** `npm run test:api`
- **Compilar producción (Build SSR):** `npm run build -- --configuration=production`
- **Compilar TypeScript de las Lambdas:** `npm run build:api`
- **Ejecutar en modo servidor local (SSR):** `npm run serve:ssr`
- **Desplegar en Staging:** `npx serverless deploy --stage staging`
- **Desplegar en Producción:** `npx serverless deploy --stage production`

---

## 4. Convenciones de Código e Idioma

- **Idioma del código:** Variables, funciones, clases, tablas de base de datos, commits y comentarios **en español** (ej. `evento`, `ServicioBoleteria`, `obtenerSillasDisponibles`). Misma regla que Babel.
- **Idioma de interfaz:** Español (Colombia) en toda la interfaz, documentación y comunicación con el usuario final.
- **Patrones reactivos:** Uso preferencial de **Angular Signals** para el manejo de estado en lugar de `BehaviorSubject`.
- **Estructura de componentes:** Componentes Standalone obligatorios. Estilos y plantillas en línea para componentes muy pequeños (< 100 líneas); archivos separados (`.html`, `.css`) para componentes grandes.
- **Tipado:** TypeScript estricto. Prohibido el uso de `any`.
- **Precios:** formato colombiano `$45.000` (punto como separador de miles, sin decimales para COP). Reutilizar el enfoque del pipe `pvp` de Babel (`Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })`, sin depender de registrar el locale `es-CO`, que complica el bundle SSR).
- **Dinero en la base de datos:** siempre en **pesos colombianos enteros** (`number`), nunca en decimales ni en strings. Nunca usar coma flotante para acumular totales de venta.
- **Fechas y horas:** almacenar siempre en **UTC ISO 8601**; convertir a `America/Bogota` solo en la capa de presentación. Un evento mal convertido es una puerta cerrada en la cara de un cliente.
- **Identidad visual:** hereda la paleta y filosofía de marca de Le Tiende (`primary #230C00`, `secondary #E8630A`, `tertiary #00B7A3`, `neutral #FFE7B3`, `surface #FFF8F1`, `danger #C0392B`), tipografía de interfaz **Poppins**, y Angellya reservada al logotipo SVG de marca. Los componentes de Angular Material se estilizan con un **tema Material 3 propio** que sobrescribe los tokens `--mat-sys-*` a estos hex exactos; nunca se usa el tema por defecto de Material (Azure/Blue u otro prebuilt) sin adaptar. Ver `docs/tech-specs.md` §4.4 y el `docs/DESIGN.md` de Babel como referencia de patrones ya probados (tarjetas `rounded-2xl bg-white shadow-[0_4px_16px_rgba(35,12,0,0.08)]`, botones primarios `h-12 rounded-2xl bg-primary text-neutral uppercase`, inputs `rounded-xl border border-primary/20`).

---

## 5. Seguridad (OWASP)

Esta sección define las reglas de seguridad obligatorias basadas en los riesgos específicos de la arquitectura de Ágora (Angular SSR + Lambda + DynamoDB + S3 + Firebase Authentication + enlaces mágicos sin sesión + dinero real). Ver `docs/tech-specs.md` para el detalle completo de la arquitectura.

**Lo que hace a Ágora distinta de Babel en materia de seguridad:** buena parte de su superficie es **pública y sin autenticación** (navegación de eventos, compra, carga de comprobante, aprobación por enlace) y **maneja dinero y datos personales de terceros**. Una falla aquí no produce un dato de inventario incorrecto: produce una entrada falsificada, una sobreventa del aforo o una fuga de datos personales de clientes.

### Riesgos identificados y reglas de código

#### A01:2021 — Control de acceso roto

*   **Riesgo:** un `portero` podría llamar directamente a un endpoint de administración (`/api/eventos` en POST/PUT, `/api/usuarios`, `/api/reportes/exportar`) o manipular su rol enviándolo desde el cliente. Riesgo adicional propio de Ágora: al compartir el proyecto Firebase con Comandante y Babel, alguien podría asumir (incorrectamente) que tener cuenta o rol en otra app otorga algún acceso en Ágora.
*   **Regla:** los guardias de Angular (`GuardiaAuth`, `GuardiaRol`) son solo experiencia de usuario. La autorización real ocurre SIEMPRE en la Lambda: cada endpoint protegido verifica el Firebase ID Token con `verifyIdToken` y resuelve el rol consultando `agora-usuarios` por el email del token — nunca confiar en un rol enviado en el payload, y nunca asumir o heredar el rol/acceso que ese usuario tenga en Comandante o Babel. Estar autenticado en el proyecto Firebase compartido NO implica ninguna autorización en Ágora; el correo debe existir explícitamente en `agora-usuarios`.
*   **Regla adicional (jerarquía de roles):** la jerarquía `administrador > productor > portero` se resuelve en una única función del backend (`resolverPermisos`), nunca replicando comparaciones de rol ad hoc en cada handler. Un `productor` solo puede aprobar compras y ver el panel **de los eventos donde está asignado como productor** — la pertenencia se verifica contra el campo `productores` del evento, no contra el rol a secas.

#### A02:2021 — Fallas criptográficas (fuga de secretos y datos personales)

*   **Riesgo:** exponer la cuenta de servicio de Firebase (`firebase-admin`), las credenciales de AWS o las llaves de Bold en el repositorio. Riesgo propio de Ágora: los **comprobantes de pago** son documentos financieros de terceros y la tabla de compras contiene **datos personales de clientes** (nombre, teléfono, correo) protegidos por la Ley 1581 de 2012 (Habeas Data, Colombia).
*   **Regla:** ninguna credencial privada (`*.json` de cuenta de servicio, `.env`) se commitea. Todos los secretos de `docs/tech-specs.md` §9 se inyectan como variables de entorno vía GitHub Actions Secrets. La configuración pública del SDK cliente de Firebase (`environments/`) no es sensible y puede vivir en el repo.
*   **Regla (S3):** el bucket `agora-comprobantes-*` tiene **Block Public Access activado sin excepción** y cifrado en reposo (SSE-S3). Los comprobantes NUNCA se sirven por URL pública: solo por **URL prefirmada de vida corta** (≤ 15 minutos) generada por la Lambda tras verificar el rol del solicitante. Un comprobante nunca se sirve a través de CloudFront.
*   **Regla (identificadores de boleta):** el código de la boleta es un **UUID v4** (o equivalente de ≥ 122 bits de entropía), nunca un consecutivo ni un hash de datos del cliente. Adicionalmente se firma con HMAC-SHA256 usando `SECRETO_FIRMA_BOLETAS`, de modo que el QR contenga `{boletaId}.{firma}` y una boleta inventada sea rechazable sin siquiera consultar la base de datos.

#### A03:2021 — Inyección (XSS)

*   **Riesgo:** renderizar directamente la descripción del evento (texto libre escrito por el `administrador`), el nombre del cliente (texto libre escrito por un desconocido en un formulario público) o la referencia de un pago en el panel de control y en la boleta digital.
*   **Regla:** usar siempre interpolación estándar de Angular (`{{ valor }}`). Prohibido `innerHTML` o `bypassSecurityTrustHtml` sin sanitización explícita con `DomSanitizer`. **El nombre del cliente es entrada hostil por definición** — se valida en el backend (longitud máxima, sin caracteres de control) antes de persistirlo, y se escapa al componer el HTML de los correos de SES (que no pasan por el sanitizador de Angular).
*   **Regla (DynamoDB):** todo acceso a datos se hace con `@aws-sdk/lib-dynamodb` (`DocumentClient`) y expresiones parametrizadas (`ExpressionAttributeValues`). Prohibido construir `FilterExpression` o `KeyConditionExpression` concatenando entrada del usuario, y prohibido PartiQL con interpolación de strings.

#### A04:2021 — Diseño inseguro (sobreventa y reutilización de boletas)

Esta categoría no aparece en la mayoría de proyectos, pero es **el riesgo central de Ágora**: no se mitiga con una librería, se mitiga con el diseño de la transacción.

*   **Riesgo 1 — Sobreventa:** dos clientes compran las últimas sillas simultáneamente y ambos reciben boleta. El día del evento hay más boletas válidas que sillas físicas.
*   **Riesgo 2 — Reutilización de boleta:** el mismo QR se presenta dos veces en la puerta (capturas de pantalla reenviadas por WhatsApp) y ambos entran.
*   **Regla 1:** el descuento de aforo se hace SIEMPRE con **escritura condicional** de DynamoDB (`ConditionExpression: sillasDisponibles >= :cantidad`) sobre el ítem del evento, en la misma operación que lo decrementa. Nunca leer-y-luego-escribir. Si la condición falla, la compra se rechaza con un mensaje claro, no se reintenta a ciegas.
*   **Regla 2:** la reserva temporal de sillas durante el plazo de comprobante tiene **TTL de DynamoDB** y su expiración libera el aforo por medio de un consumidor de DynamoDB Streams. El aforo liberado se devuelve también con escritura condicional (`sillasDisponibles + :cantidad <= sillasTotales`), para que un evento de stream duplicado —los streams garantizan *at-least-once*, no *exactly-once*— no infle el aforo.
*   **Regla 3:** la validación en puerta es una **transición de estado condicional**, no una lectura seguida de un borrado: `UpdateItem` con `ConditionExpression: estado = 'valida'` que la pasa a `usada` y sella `ingresoEn`/`ingresoPor`. Si la condición falla, la respuesta al portero debe distinguir explícitamente **"boleta ya usada"** (con fecha y hora del primer ingreso) de **"boleta inexistente"** y de **"boleta de otro evento"** — un mensaje genérico deja al portero sin criterio para decidir en la puerta.
*   **Regla 4:** toda operación de aforo y de validación se registra en un rastro de auditoría inmutable (append-only). Ver A09.

#### A05:2021 — Configuración de seguridad incorrecta

*   **Riesgo:** endpoints de administración expuestos sin protección por un error de ruteo, mensajes de error con stack traces en producción, permisos IAM más amplios de lo necesario, o CORS abierto en endpoints que mutan estado.
*   **Regla:** el rol IAM de ejecución de cada Lambda sigue el principio de mínimo privilegio (solo las tablas DynamoDB y los prefijos de S3 que esa función usa). Las respuestas de error en producción nunca incluyen stack traces ni detalles internos — solo un mensaje genérico y un código HTTP apropiado.
*   **Regla (CORS):** los endpoints públicos de lectura (catálogo de eventos) pueden tener CORS abierto; los endpoints que mutan estado o exponen datos personales se restringen al origen de la aplicación (`https://agora.letiende.co` y el dominio de staging). Nunca `Access-Control-Allow-Origin: *` combinado con credenciales.

#### A07:2021 — Fallas de identificación y autenticación (enlaces mágicos)

*   **Riesgo:** Ágora emite **enlaces sin sesión** que otorgan capacidades reales: el enlace de carga de comprobante que se envía al cliente y el enlace de aprobación que se envía al productor. Un enlace adivinable, eterno o reutilizable es una puerta trasera. Riesgo adicional: al ser proyecto Firebase compartido, revocar el rol de un usuario en `agora-usuarios` NO revoca su cuenta de Google ni su acceso a Babel o Comandante.
*   **Regla (enlaces mágicos):** todo token de enlace mágico (1) tiene ≥ 128 bits de entropía criptográfica (`crypto.randomUUID()` o `randomBytes`), (2) se almacena **hasheado** en DynamoDB, no en claro, (3) tiene expiración explícita coherente con su propósito (el de comprobante expira con el plazo del evento, el de aprobación a las 24 h), y (4) es **de un solo uso**: se consume con escritura condicional. Un token de aprobación nunca se envía por un canal que lo exponga en logs de terceros ni se incluye en el `Referer` de una navegación posterior.
*   **Regla (aprobación con varios productores):** cuando un evento tiene varios productores, el primero que aprueba **bloquea a los demás** mediante `ConditionExpression: estado = 'en_revision'`. Los demás reciben "esta compra ya fue resuelta por {nombre}", no un error genérico.
*   **Regla (sesión de personal):** cada solicitud protegida a `/api/*` verifica el ID Token de Firebase con `verifyIdToken` (que valida expiración y revocación). Al cerrar sesión se invoca `signOut(auth)` y se limpia todo el estado reactivo (Signals) del cliente antes de redirigir a `/login`. Si un usuario debe perder acceso a Le Tiende por completo (no solo a Ágora), el administrador debe deshabilitar su cuenta en la consola de Firebase, no solo eliminar su fila en `agora-usuarios`.
*   **Regla (endpoints públicos):** los endpoints públicos de compra tienen **límite de tasa por IP** en API Gateway y validación de tamaño de payload. La creación de compras es la superficie más barata de abusar de toda la aplicación: sin límite, un script agota el aforo de un evento en segundos con reservas que nunca se pagan.

#### A08:2021 — Fallas de integridad de software y datos

*   **Riesgo:** confiar en datos que el cliente controla y que tienen consecuencia económica: el archivo del comprobante (podría ser un ejecutable, un PDF de 200 MB o un SVG con script), el monto o el precio enviados desde el navegador, o —en fase 2— una notificación de Bold falsificada.
*   **Regla (precios):** el precio de la boleta, la etapa vigente y el total a pagar se calculan **siempre en el backend** a partir del evento almacenado. Cualquier precio o total que llegue en el payload del cliente se descarta sin excepción; no se compara, no se valida: se ignora.
*   **Regla (comprobantes):** la carga se hace con URL prefirmada de S3 con `Content-Length` acotado (máximo 10 MB) y tipo MIME restringido a `image/jpeg`, `image/png`, `image/webp` y `application/pdf`. El tipo se **verifica en el backend por los magic bytes del archivo**, no por la extensión ni por el `Content-Type` declarado. Los SVG están prohibidos como comprobante (vector de XSS). Un comprobante nunca se ejecuta, se transforma ni se abre con una librería que interprete su contenido: solo se almacena y se muestra.
*   **Regla (Bold, fase 2):** toda notificación entrante de Bold se valida verificando su **firma** con la llave secreta antes de tocar cualquier dato, y el resultado se **reconcilia contra la API de Bold** consultando la transacción por su identificador. Nunca marcar una compra como pagada por el solo hecho de haber recibido una petición en el endpoint de webhook. El manejo es **idempotente**: recibir dos veces la misma notificación no emite dos juegos de boletas.
*   **Regla (dependencias):** las dependencias de npm se instalan siempre con `package-lock.json` (`npm ci` en CI), nunca con rangos de versión sin bloquear en producción.

#### A09:2021 — Fallas de registro y monitoreo

*   **Riesgo:** una disputa real ("yo sí pagué", "esa boleta no la había usado nadie", "el aforo no cuadra") sin evidencia para resolverla. En un sistema que maneja dinero, la ausencia de rastro es un defecto funcional, no solo operativo.
*   **Regla:** cada transición de estado con consecuencia económica —creación de compra, aprobación o rechazo (con el `email` de quien la resolvió), emisión de boleta, ingreso en puerta, venta en efectivo, liberación de reserva expirada— se registra con marca de tiempo UTC y actor responsable. Estos campos son **append-only**: nunca se sobrescriben ni se borran, ni siquiera al corregir un error (se registra una compensación, no una edición).
*   **Regla:** los logs de aplicación **nunca** incluyen datos personales completos del cliente ni el contenido del comprobante. Se registra el identificador de la compra, no el teléfono ni el correo.

#### A10:2021 — Server-Side Request Forgery (SSRF)

*   **Riesgo:** en el MVP la superficie es pequeña, pero existe: la imagen y el logotipo del evento podrían cargarse por URL, y en fase 2 la integración con Bold y con Google Calendar hace peticiones salientes desde la Lambda.
*   **Regla:** las imágenes de evento se suben como archivo a S3 mediante URL prefirmada; **prohibido aceptar una URL arbitraria y que el servidor la descargue**. Las únicas peticiones salientes permitidas desde las Lambdas son hacia hosts de una lista blanca fija en código (`*.bold.co`, `*.googleapis.com`, `*.amazonaws.com`), sobre HTTPS. Si alguna vez se requiere descargar una URL provista por un usuario, debe pasar antes por una guardia SSRF equivalente a la de Babel (`validarHostSeguro`: HTTPS + resolución a IP pública, rechazando rangos privados/loopback/link-local y `169.254.169.254`), revalidando cada redirección.

### Datos personales (Ley 1581 de 2012 — Habeas Data)

Ágora recoge nombre, teléfono y correo de personas que no son usuarios registrados. Esto tiene obligaciones legales en Colombia, no solo buenas prácticas:

*   La aceptación de términos y condiciones en el flujo de compra debe incluir **autorización explícita de tratamiento de datos personales**, y el hecho de haberla aceptado se persiste con marca de tiempo y versión del texto aceptado.
*   Los datos del cliente se usan **solo** para emitir y validar su boleta y para comunicarle asuntos de ese evento. No se reutilizan para mercadeo de otros eventos sin autorización separada.
*   Las exportaciones del panel de control (XLSX/PDF) contienen datos personales: solo las descarga un `productor` del evento o el `administrador`, y el enlace de descarga es prefirmado y de vida corta.

### Prohibiciones absolutas en el código

| Acción prohibida | Por qué |
|---|---|
| Confiar en un campo `rol` enviado desde el cliente | Permite escalar privilegios a administrador |
| Asumir/heredar el rol o acceso que un usuario tenga en Comandante o Babel | El proyecto Firebase es compartido, pero la autorización de cada app es independiente |
| Reutilizar la cuenta de servicio de Firebase de otra app de Le Tiende en el backend de Ágora | Impide rotar/revocar credenciales de una app sin afectar a las otras |
| Calcular o aceptar el precio/total de una compra desde el cliente | Permite comprar boletas por $0 |
| Descontar aforo con lectura previa en vez de `ConditionExpression` | Produce sobreventa bajo concurrencia — el aforo del teatro es físico |
| Validar una boleta con lectura + borrado en dos operaciones | Permite que el mismo QR entre dos veces |
| Emitir códigos de boleta consecutivos, predecibles o derivados de datos del cliente | Permite falsificar entradas sin acceso al sistema |
| Guardar tokens de enlaces mágicos en claro en la base de datos | Una fuga de la tabla se convierte en aprobación de compras ajenas |
| Servir comprobantes de pago por URL pública o por CloudFront | Expone documentos financieros de terceros |
| Aceptar SVG como comprobante de pago, o confiar en el `Content-Type` declarado | Vector de XSS y de carga de contenido ejecutable |
| Marcar una compra como pagada por recibir un webhook sin verificar firma y reconciliar | Permite emitir boletas gratis falsificando una notificación |
| Renderizar HTML crudo provisto por un usuario (`innerHTML`, `bypassSecurityTrustHtml` sin sanitizar) | Vector de XSS |
| Escribir datos personales del cliente o el contenido del comprobante en logs | Incumple la Ley 1581 y filtra datos por CloudWatch |
| Commitear `firebase-service-account*.json`, `.env`, llaves de Bold, credenciales de AWS | Exposición de secretos |
| Guardar el rol del usuario en `localStorage` para validar permisos | Los datos del cliente son manipulables con herramientas de desarrollador |
| Usar `eval()` o `new Function()` | Vector de ejecución de código arbitrario |
| `npm install` sin `package-lock.json` en CI/CD | Rompe la integridad reproducible del build |
| Declarar una tabla DynamoDB con `BillingMode: PROVISIONED` o cualquier bloque `ProvisionedThroughput` (tabla o GSI), en cualquier stage | Se cobra 24/7 por hora exista o no tráfico — el incidente de Babel costó US$90,34 en un mes por esto. Ver sección de Costos abajo |
| Afirmar en código o documentación que algo "es gratis", "está en la capa gratuita" o "nunca se borra" sin haberlo verificado ese mismo día | El conocimiento de un modelo de IA sobre precios de AWS está desactualizado por construcción; una suposición escrita como hecho es indistinguible de un hecho verificado hasta que llega la factura |

---

## 5-bis. Costos de infraestructura (obligatorio)

**Lee `docs/advertencia-urgente-costos-aws.md` completo antes de escribir la primera línea de `serverless.yml` o de ejecutar el primer `deploy`.** No es teoría: documenta un incidente real de Babel (proyecto hermano, misma cuenta AWS) que facturó **US$94,44 en julio de 2026 con un objetivo de costo $0** — el 96% (US$90,34) fue DynamoDB `PROVISIONED` mal configurado, cobrando 24/7 por capacidad que nunca se usó, mientras las tablas de producción estaban vacías.

**El objetivo de costo de Ágora es < US$1/mes.** Es un número concreto y verificable, no una aspiración.

### Reglas obligatorias

1. **DynamoDB siempre `BillingMode: PAY_PER_REQUEST`, en toda tabla y todo stage, sin excepción.** Nunca `PROVISIONED`, ni "temporalmente", ni "solo para pruebas". Con `PAY_PER_REQUEST` no puede existir ningún bloque `ProvisionedThroughput` — ni en la tabla ni en sus GSIs; CloudFormation falla el despliegue si aparece uno. Los GSIs heredan el modo de la tabla automáticamente.
2. **Ningún NAT Gateway; ninguna Lambda dentro de una VPC sin justificación escrita explícita.** DynamoDB, S3 y las APIs de AWS no requieren VPC. Un NAT Gateway cuesta ~US$32/mes **exista o no tráfico** — es, con diferencia, el mayor destructor de presupuestos serverless.
3. **`Lambda Provisioned Concurrency` prohibido salvo justificación explícita y verificada el mismo día.** Cuesta ~US$10-15/mes por unidad, 24/7. Ver el gotcha de cold starts en §7 — se acepta la latencia en frío por defecto.
4. **`logRetentionInDays` explícito en toda función Lambda — nunca el default infinito.** Los grupos de log de CloudWatch se guardan para siempre si no se configura, y la ingesta cuesta ~US$0,50/GB.
5. **Cada función empaqueta solo lo que usa (`package.patterns`), no `node_modules` completo por defecto.** No es principalmente un tema de costo (S3 fue el 0,5% de la factura de Babel) sino de cold start: un paquete de 30 MB tarda notoriamente más en arrancar en frío que uno de 2 MB.
6. **Etiqueta todos los recursos de Ágora** (`stackTags`/`tags` en `serverless.yml`, p. ej. `Proyecto: agora`) para poder atribuir costo por proyecto en una cuenta AWS compartida con Babel y Comandante — sin esto, Cost Explorer no puede separar el gasto de Ágora del de las otras dos apps.
7. **Antes de eliminar cualquier stack de CloudFormation "sin uso": verifica qué apunta hacia él desde AFUERA** (dominios personalizados de API Gateway, registros DNS externos, `Fn::ImportValue` de otro stack) — `list-stack-resources` solo muestra lo que vive *dentro* del stack. Un stack de Babel con un dominio personalizado externo causó una caída real de 15 minutos al eliminarse sin esta verificación.

### Disciplina de verificación de precios

**Nunca escribas una cifra de precio, un "esto es gratis" o un "esto nunca se borra" que no hayas verificado ese día.** El modelo de capa gratuita de AWS cambió en 2025; el conocimiento de un LLM sobre precios está desactualizado por definición. Verifica en <https://calculator.aws/>, <https://aws.amazon.com/free/>, o la página de precios del servicio específico. Si no lo verificaste, escríbelo así: `<!-- SIN VERIFICAR: confirmar en calculator.aws antes de desplegar -->`.

### Antes del primer `deploy` de infraestructura

1. Confirma que existe una alarma de presupuesto que cubra a Ágora — **ya existe una a nivel de cuenta** (`Costo diario` US$4/día, `Costos promedio` US$10/mes, ambas con notificación por email verificada, ver `docs/MEMORY.md` §5), pero cubre las tres apps del ecosistema combinadas, no solo Ágora. Antes de que Ágora tenga tráfico real, crear un presupuesto adicional filtrado por la etiqueta `Proyecto: agora` con umbral ~US$1, para que un error de Ágora no se diluya en el presupuesto compartido.
2. Audita el `serverless.yml` antes de desplegar: `grep -nE "PROVISIONED|ProvisionedThroughput|CapacityUnits|ProvisionedConcurrency|NatGateway|AWS::RDS|AWS::ElastiCache|AWS::OpenSearch" serverless.yml` — cualquier coincidencia debe justificarse explícitamente o eliminarse.
3. Después del primer despliegue, **verifica la cuenta real, no el IaC**: confirma por CLI que cada tabla quedó en `PAY_PER_REQUEST` (`aws dynamodb describe-table ... --query "Table.BillingModeSummary.BillingMode"`), que no hay NAT Gateways vivos, que no hay IPs elásticas sin asociar.
4. **Agenda una revisión de costo a las 48 horas.** Un costo diario plano e idéntico día tras día es la firma de capacidad aprovisionada olvidada — investigar de inmediato. Un costo que sube y baja con el uso es correcto.

---

## 6. Git Flow para Agentes IA

Las siguientes reglas son **absolutamente obligatorias y no tienen excepción**, incluso si el usuario lo solicita explícitamente. Mismo esquema que usan Comandante y Babel.

> **⛔ PROHIBICIÓN CRÍTICA: Un agente IA NUNCA puede hacer commits ni push directamente a `main`. Toda modificación de código debe llegar únicamente a través de un Pull Request revisado y aprobado por un humano.**

### Mapa de ramas

| Rama | Propósito | Protegida |
|---|---|---|
| `main` | Código en producción (`agora.letiende.co`). Solo recibe merges aprobados vía PR. | ✅ Sí |
| `feature/*` | Nuevas funcionalidades. Se crea siempre desde `main`. | No |
| `fix/*` | Correcciones de bugs. Se crea desde `main`. | No |
| `docs/*` | Solo documentación. Se crea desde `main`. | No |
| `hotfix/*` | Correcciones urgentes en producción. Se crea desde `main`. | No |
| `refactor/*` | Refactorizaciones sin cambio funcional. Se crea desde `main`. | No |

Los **entornos** son dos y no corresponden a ramas distintas: cada Pull Request despliega a `staging` y cada push a `main` (es decir, cada merge de PR) despliega a `production`. Ver `docs/tech-specs.md` §7.2.

### Protocolo obligatorio antes de cualquier cambio de código

**Paso 1 — Verificar en qué rama estoy:**
```bash
git branch --show-current
```
Si el resultado es `main`: **detener todo y ejecutar el Paso 2**.
Si ya hay una feature branch activa: continuar desde el Paso 3.

**Paso 2 — Crear feature branch (SIEMPRE desde `main`):**
```bash
git checkout main
git pull origin main
git checkout -b feature/descripcion-corta-en-kebab-case
```

**Paso 3 — Hacer los cambios y commitear:**
```bash
# Solo después de que el build pase sin errores
npm run build

# Agregar archivos específicos — NUNCA git add . o git add -A
git add src/app/features/eventos/detalle-evento.component.ts

# Commit con formato semántico (español colombiano)
git commit -m "feat(eventos): agrega selección de cantidad de boletas"
```

**Paso 4 — Crear el Pull Request al finalizar:**
```bash
git push -u origin HEAD
gh pr create \
  --base main \
  --title "feat(eventos): agrega selección de cantidad de boletas" \
  --body "## Cambios realizados
- [bullet con cada cambio]

## Cómo probar
- [pasos verificables]

## Checklist
- [ ] Build pasa sin errores
- [ ] No hay secretos hardcodeados
- [ ] Seguí las convenciones de código del proyecto

🤖 Generado con Claude Code"
```

### Prohibiciones absolutas de Git

| Acción prohibida | Por qué |
|---|---|
| `git push origin main` | Commit directo a producción — **terminantemente prohibido** |
| `git commit` estando en `main` | Genera historial sucio en la rama protegida |
| `git push --force` en cualquier rama | Destruye el historial del repositorio |
| `git merge` de cualquier PR | Solo humanos pueden aprobar y fusionar PRs |
| `gh pr merge` | Solo humanos pueden fusionar PRs |
| `git add .` o `git add -A` | Puede incluir secretos, `.env` o archivos temporales |
| `--no-verify` en commits o pushes | Omite hooks de seguridad configurados |

### El agente NUNCA debe
- Fusionar un PR (ni con `gh pr merge`, ni con `git merge`).
- Aprobar su propio PR.
- Hacer push a `main` bajo ninguna circunstancia, incluso si el usuario lo pide.
- Usar `--force`, `--no-verify`, ni `--no-gpg-sign`.
- Cerrar un PR sin fusionar cuando el trabajo está completo — dejarlo abierto para revisión humana.

---

## 7. Hallazgos Técnicos del Stack (Gotchas)

Esta sección documenta comportamientos no obvios descubiertos durante el desarrollo. Leer antes de tocar la configuración del build o del despliegue. Al arrancar el proyecto se listan los riesgos ya conocidos **por herencia de Babel** (mismo stack, misma cuenta AWS, mismo Serverless Framework); se irá completando con los hallazgos propios de Ágora.

### Heredados de Babel (verificados en producción, no son teoría)

**Descripción de función Lambda con límite de 256 caracteres.** CloudFormation rechaza el despliegue si el campo `description` de cualquier función en `serverless.yml` supera 256 caracteres. En Babel esto rompió el deploy dos veces. Mantener las descripciones cortas y referenciar la documentación en vez de explicar dentro del YAML.

**Colisión de despliegues concurrentes a producción.** Si varios PRs se fusionan a `main` en sucesión rápida, cada merge dispara su propio deploy y dos runs pueden intentar actualizar el mismo stack de CloudFormation a la vez, fallando con `Stack ... is in UPDATE_IN_PROGRESS state and can not be updated`. Usar `concurrency` en GitHub Actions: grupo `desplegar-produccion` con `cancel-in-progress: false` (que el run en curso termine) y grupo `desplegar-staging` con `cancel-in-progress: true` (que solo el más reciente quede desplegado).

**Cold starts de Lambda en SSR.** El primer request tras inactividad a una Lambda que sirve SSR de Angular tarda significativamente más (bootstrap de Node + Angular). Evaluar `provisioned concurrency` solo si el costo lo justifica (rompe el objetivo de $0); por defecto, aceptar la latencia en frío y optimizar el bundle del servidor. **Relevante para Ágora:** el escaneo en puerta ocurre en ráfagas de decenas de validaciones en pocos minutos, después de horas de inactividad — el primer portero de la fila paga el cold start. Considerar un "calentamiento" manual desde la propia interfaz al abrir la pantalla de ingreso.

**Avatar de Google (`lh3.googleusercontent.com`) — 429 Too Many Requests.** Añadir siempre `referrerpolicy="no-referrer"` en cualquier `<img>` que cargue una foto de perfil de Google.

**`NG_ALLOWED_HOSTS` con dominio personalizado.** Al montar el dominio propio (`agora.letiende.co`) sobre CloudFront/API Gateway, el servidor SSR de Angular rechaza el `Host` si no está autorizado. Configurarlo junto con el dominio, no después de que producción falle.

### Propios de Ágora (a verificar durante la implementación)

**Acceso a cámara para escanear el QR requiere HTTPS y gesto del usuario.** `getUserMedia` solo funciona en contextos seguros (HTTPS o `localhost`) y requiere permiso explícito concedido tras una interacción directa (tap en "Escanear"). En iOS Safari, el primer acceso a cámara puede fallar silenciosamente si se invoca automáticamente al cargar la página — disparar siempre la solicitud desde un manejador de click/tap. Es exactamente el mismo hallazgo que Babel documentó para el escaneo de ISBN.

**TTL de DynamoDB no es puntual.** La eliminación por TTL ocurre "típicamente en 48 horas" según el contrato de AWS, no al segundo. Por lo tanto, **el TTL no puede ser el mecanismo que hace cumplir la expiración de una reserva de cara al cliente**: la lógica de negocio debe tratar como expirada toda reserva cuyo `expiraEn` ya pasó, aunque el ítem siga existiendo. El TTL (más su consumidor de Streams) es solo el mecanismo de limpieza y devolución de aforo.

