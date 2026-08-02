# PRD — Ágora

Documento de requisitos de producto de **Ágora**, la aplicación de boletería del teatro de Le Tiende. Está escrito en lenguaje de negocio: describe **qué** hace el producto y **para quién**, no cómo se implementa. El detalle técnico vive en `tech-specs.md`.

**Estado del documento:** versión inicial (31/07/2026). Ninguna funcionalidad está implementada todavía; la columna de estado refleja esa realidad y debe actualizarse a medida que el roadmap avance.

---

## 1. Visión del producto

| Atributo | Valor |
|---|---|
| **Nombre** | Ágora |
| **Tipo** | Aplicación web de boletería para espectáculos en vivo |
| **Ecosistema** | Le Tiende (junto a Comandante y Babel) |
| **Público** | Asistentes a los espectáculos del teatro de Le Tiende (público general) y el equipo que los produce |
| **Idiomas** | Español (Colombia), idioma único |
| **URL de producción** | `https://agora.letiende.co` |
| **URL de pruebas** | Entorno de *staging* interno (ver `tech-specs.md` §7.2) |
| **Dispositivo principal** | Celular (*mobile-first*), adaptable a tableta y computador |

**Declaración de visión:** que comprar una boleta para un evento de Le Tiende tome menos de dos minutos desde el celular, que nadie del equipo tenga que revisar un comprobante a medianoche, y que la fila de entrada al teatro avance a la velocidad de un escaneo.

---

## 2. Contexto y problema que resuelve

Hoy, conseguir una boleta para un evento en el teatro de Le Tiende es una conversación. El interesado se entera del evento por redes sociales, escribe por WhatsApp al productor, pregunta el precio, hace la transferencia, envía la foto del comprobante, espera a que el productor lo revise y lo anote en una lista. El día del evento, alguien en la puerta busca su nombre en esa lista y lo deja pasar.

Funciona, pero se rompe en cuatro puntos:

1. **La información no está en ninguna parte.** No hay un lugar único donde ver qué eventos hay, cuándo son, cuánto cuestan y si todavía quedan sillas. Cada respuesta se escribe a mano, otra vez.
2. **La lista de vendidos vive en la cabeza del productor.** Está repartida entre chats, notas y hojas de cálculo. Nadie más puede consultarla con confianza, y reconstruir cuánto se vendió exige rearmarla a mano.
3. **La puerta es un cuello de botella.** Buscar nombres en una lista impresa mientras se forma una fila es lento y propenso a errores. No hay forma de saber, en el momento, cuánta gente entró y cuánta falta.
4. **El trabajo se acumula sobre las mismas personas.** El productor atiende consultas, valida pagos, arma listas y además produce el evento. Todo simultáneo, todo urgente, todo manual.

Ágora no cambia el modelo de negocio: cambia quién hace el trabajo repetitivo. El sistema atiende la consulta, cobra, valida, emite la boleta y controla la puerta. Las personas se quedan con las decisiones que sí requieren criterio: aprobar un comprobante dudoso, resolver un caso en la puerta, decidir el precio de una etapa.

**Qué NO resuelve Ágora (fuera de alcance):** no asigna sillas numeradas, no gestiona la programación artística ni los contratos con los artistas, no maneja la contabilidad de Le Tiende, no reemplaza la difusión en redes sociales, y no vende productos distintos de boletas.

---

## 3. Usuarios y audiencias

| Perfil | Quién es | Necesidades principales |
|---|---|---|
| **Cliente** | Cualquier persona que quiera asistir a un evento. No tiene cuenta ni la necesita. Llega desde un enlace, un código QR en un afiche o navegando la cartelera. | Entender rápido de qué se trata el evento y cuánto cuesta; comprar desde el celular sin registrarse; recibir su boleta en un canal que no se le pierda; tener certeza de que su compra quedó confirmada. |
| **Portero** | Persona que recibe al público en la puerta el día del evento. Trabaja de pie, con prisa y con una fila esperando. | Validar una boleta en segundos; saber con claridad si es válida, si ya se usó o si no corresponde a ese evento; poder vender una boleta en efectivo en el momento a quien llegue sin comprar. |
| **Productor** | Persona a cargo de un evento. Puede tener varios eventos activos a la vez y no siempre está frente a un computador. | Aprobar o rechazar comprobantes de pago sin fricción; ver en cualquier momento cuánto se ha vendido y cuánto queda; descargar la lista de asistentes para su propia gestión. |
| **Administrador** | Integrante del equipo de Le Tiende con control total. | Crear y editar eventos con todos sus parámetros comerciales; gestionar quién tiene acceso y con qué rol; tener visibilidad completa de toda la operación de boletería. |

**Jerarquía de permisos:** cada rol incluye todos los permisos del anterior. `portero` ⊂ `productor` ⊂ `administrador`.

| Capacidad | Portero | Productor | Administrador |
|---|:---:|:---:|:---:|
| Validar boletas en la puerta | ✅ | ✅ | ✅ |
| Vender boletas en efectivo | ✅ | ✅ | ✅ |
| Aprobar comprobantes de pago | — | ✅ | ✅ |
| Ver el panel de control y descargar reportes | — | ✅ | ✅ |
| Crear y editar eventos | — | — | ✅ |
| Gestionar usuarios y sus roles | — | — | ✅ |

Un `productor` ejerce sus permisos **solo sobre los eventos en los que está asignado como productor**. El `administrador` los ejerce sobre todos.

---

## 4. Objetivos

| Objetivo | Métrica de éxito | Estado |
|---|---|---|
| Eliminar la conversación manual de venta | ≥ 80% de las boletas de un evento se venden sin intervención humana previa a la validación del comprobante | ⬜ Pendiente |
| Acelerar la entrada al teatro | Validación de una boleta en ≤ 5 segundos desde que se abre la cámara | ⬜ Pendiente |
| Eliminar la sobreventa | 0 eventos con más boletas válidas emitidas que sillas disponibles | ⬜ Pendiente |
| Centralizar la información del evento | 1 sola fuente de verdad consultable por todo el equipo, sin hojas de cálculo paralelas | ⬜ Pendiente |
| Reducir la carga del productor | El productor solo interviene para aprobar comprobantes; el resto es automático | ⬜ Pendiente |
| Dar visibilidad en tiempo real | El productor puede ver, durante el evento, cuántos asistentes entraron y cuántos faltan | ⬜ Pendiente |
| Operar sin costo de infraestructura | Costo mensual de infraestructura tendiente a $0 dentro de la capa gratuita | ⬜ Pendiente |

---

## 5. Funcionalidades

Ninguna está implementada aún. La marca indica en qué versión entra: **v1** es el MVP definido en §6.

### 5.1 Cartelera pública (v1)

Una página abierta, sin necesidad de iniciar sesión, que lista los eventos disponibles con su imagen, nombre, fecha, hora y precio vigente. Cada evento tiene además su propia página con la descripción completa, la dirección del teatro, los enlaces a redes sociales y el botón de compra. Un evento sin sillas disponibles se muestra marcado como **AGOTADO** y no permite comprar.

### 5.2 Creación y edición de eventos (v1)

El administrador define, para cada evento:

- Nombre y descripción.
- Imagen gráfica del evento (opcional) y logotipo para incluir en la boleta (opcional).
- Fecha y hora.
- Cantidad de sillas disponibles.
- Etapas de boletería (por defecto una sola), cada una con su precio y su fecha de cierre. El precio puede ser $0 para eventos gratuitos.
- Máximo de boletas por compra.
- Medios de pago habilitados.
- Plazo máximo para enviar el comprobante después de iniciada la compra (por defecto, 10 minutos).
- Productor o productores a cargo (uno o varios; el administrador puede incluirse a sí mismo).
- Enlaces a redes sociales (opcional).

Al crear el evento, el sistema genera automáticamente un **código QR con el enlace del evento**, descargable en formato vectorial y de imagen, para imprimir en afiches y volantes.

El administrador puede editar cualquier dato del evento en cualquier momento.

### 5.3 Compra de boletas (v1)

```
El cliente entra a la página del evento
   │  (desde la cartelera o escaneando el QR del afiche)
   ▼
Elige cuántas boletas quiere (hasta el máximo permitido)
   │
   ▼
Ingresa su nombre, teléfono y correo
   │
   ▼
El sistema muestra el total, los medios de pago
y la advertencia del plazo para enviar el comprobante
   │
   ▼
El cliente acepta los términos, condiciones
y el tratamiento de sus datos personales
   │
   ├──────────────────────────────┐
   │                              │
   ▼                              ▼
¿EVENTO GRATUITO?            ¿EVENTO PAGO?
   │                              │
   │                     El sistema reserva las sillas
   │                     y le envía un enlace por correo
   │                     para cargar el comprobante
   │                              │
   │                              ▼
   │                     El cliente abre el enlace
   │                     y sube la foto del comprobante
   │                              │
   │                              ▼
   │                     El sistema avisa al productor
   │                     (o a todos, si son varios)
   │                              │
   │                              ▼
   │                     El productor revisa y aprueba
   │                     (el primero que aprueba cierra
   │                      el caso para los demás)
   │                              │
   └──────────────┬───────────────┘
                  ▼
   El sistema emite una boleta digital por
   cada boleta comprada y las envía al cliente
                  │
                  ▼
   Las sillas se descuentan del aforo.
   Si llega a cero, el evento queda AGOTADO
```

Si el cliente no carga el comprobante dentro del plazo, la reserva se cancela y las sillas vuelven a estar disponibles para otros compradores. El cliente puede volver a intentar la compra.

**Cada boleta digital incluye:** un código QR único e irrepetible, el nombre, descripción, fecha y hora del evento, la dirección de Le Tiende, la etapa de boletería (si el evento tiene varias), los datos del cliente, el logotipo de Le Tiende y el logotipo del evento si se cargó.

### 5.4 Venta en efectivo (v1)

Cualquier integrante del equipo (portero, productor o administrador) puede registrar una venta en efectivo desde la página del evento: entra a **VENTA EN EFECTIVO**, ingresa los datos del cliente y confirma. El sistema emite las boletas de inmediato, sin pasar por comprobante ni aprobación. Sirve tanto para la venta presencial anticipada en la sede como para quien llega a la puerta el día del evento sin haber comprado.

### 5.5 Validación en la puerta (v1)

```
El cliente llega con su boleta digital en el celular
   │
   ▼
El portero entra al evento y oprime INGRESO AL TEATRO
   │
   ▼
Se abre la cámara y escanea el código QR de la boleta
   │
   ▼
El sistema responde de inmediato con uno de estos veredictos:
   │
   ├── ✅ VÁLIDA      → la marca como usada y el portero deja pasar
   ├── ⚠️ YA USADA    → indica cuándo entró la primera vez
   ├── ❌ NO EXISTE   → boleta falsa o alterada
   └── ❌ OTRO EVENTO → boleta legítima, pero de otra función
```

Una boleta válida se marca como usada en el momento del escaneo y no puede volver a usarse. El contador de asistentes del panel de control se actualiza en el acto.

### 5.6 Panel de control del evento (v1 básico, v2 completo)

El productor y el administrador ven, para cada evento a su cargo:

- Boletas vendidas y valor recaudado, discriminados por etapa de boletería.
- Sillas disponibles y sillas vendidas.
- Datos de los clientes que compraron.
- Durante el evento: cuántos asistentes han ingresado y cuántos faltan.

Además pueden **descargar la lista completa de boletas** con: datos del cliente, fecha y hora de compra, medio de pago, valor unitario, etapa de boletería, fecha y hora de ingreso al evento, y valor total de la boletería.

### 5.7 Gestión de usuarios (v1)

El administrador crea, edita y elimina las personas con acceso al sistema, registrando nombre, correo de Gmail y rol. El acceso del equipo se hace con la cuenta de Google; el cliente nunca necesita cuenta.

### 5.8 Pago automático con Bold (v2)

Cuando el evento tenga habilitada la cuenta Bold de Le Tiende como medio de pago, el cliente paga en línea y el sistema recibe la confirmación directamente de la pasarela. En ese caso **no hay comprobante que cargar ni aprobación que esperar**: las boletas se emiten en el momento. Es el flujo que más trabajo le ahorra al productor.

### 5.9 Otros medios de pago (v2)

Además de Bold y del efectivo, el administrador puede habilitar transferencias a cuentas de otras entidades financieras mediante Bre-B, cargando el código QR correspondiente. Para el pago en efectivo, el administrador indica una referencia (por defecto, Le Tiende), una dirección física y unos horarios de atención (por defecto, los de Le Tiende).

### 5.10 Notificaciones por WhatsApp (v2)

Todo lo que en v1 llega por correo —enlace para cargar el comprobante, aviso de aprobación al productor, entrega de las boletas— llegará también por WhatsApp, que es el canal donde efectivamente ocurre hoy la conversación. Se difiere a v2 por una razón externa al equipo: enviar mensajes de WhatsApp de forma automática exige una cuenta de empresa aprobada por Meta y plantillas de mensaje revisadas una por una, un trámite cuya duración no controlamos. Ver §9.

### 5.11 Sincronización con Google Calendar (v2)

Al crear un evento, este aparece automáticamente en el calendario de `letiende.co@gmail.com`. Solo los cambios de nombre, descripción, fecha y hora, o productores asignados actualizan la entrada del calendario; los demás cambios (precios, aforo, medios de pago) no la afectan.

---

## 6. Roadmap

**No hay fecha límite fija.** El orden lo determinan las dependencias técnicas y el valor entregado, no un calendario. La decisión explícita del equipo es entregar primero un **ciclo completo mínimo**: un evento que se puede crear, vender, cobrar, emitir y validar de punta a punta. Un ciclo completo aunque austero es utilizable en un evento real; media docena de funcionalidades a medias no lo es.

### v1 — MVP: ciclo completo mínimo

| Funcionalidad | Prioridad |
|---|---|
| Bases del proyecto (repositorio, dependencias, despliegue a staging) | **Alta** |
| Ingreso del equipo con cuenta de Google y control de roles | **Alta** |
| Crear y editar eventos | **Alta** |
| Cartelera pública y página de evento | **Alta** |
| Compra con reserva temporal de sillas | **Alta** |
| Carga de comprobante por el cliente | **Alta** |
| Aprobación del comprobante por el productor | **Alta** |
| Emisión y envío de la boleta digital por correo | **Alta** |
| Validación de boletas en la puerta | **Alta** |
| Venta en efectivo | **Alta** |
| Código QR del evento para afiches | Media |
| Panel de control básico (vendidas, disponibles, ingresados) | Media |

### v2 — Automatización y alcance comercial

| Funcionalidad | Prioridad |
|---|---|
| Pago automático con Bold | **Alta** |
| Notificaciones por WhatsApp | **Alta** |
| Exportación de reportes en XLSX y PDF | Media |
| Etapas de boletería con cierre automático por fecha | Media |
| Sincronización con Google Calendar | Media |
| Otros medios de pago (Bre-B con QR, referencia de efectivo) | Media |

### v3 — Ideas no comprometidas

| Funcionalidad | Prioridad |
|---|---|
| Validación en puerta sin conexión a internet | Baja |
| Devoluciones y transferencia de boletas entre personas | Baja |
| Códigos de descuento y cortesías | Baja |
| Historial de compras del cliente por correo | Baja |
| Métricas transversales de todos los eventos (temporada) | Baja |

---

## 7. Casos de uso

| # | Actor | Acción | Resultado esperado |
|---|---|---|---|
| CU-01 | Administrador | Crea un evento con aforo, precio y productor asignado | El evento queda publicado en la cartelera y disponible para la venta |
| CU-02 | Administrador | Descarga el código QR del evento | Obtiene un archivo listo para imprimir en un afiche |
| CU-03 | Cliente | Escanea el QR de un afiche | Llega directamente a la página del evento |
| CU-04 | Cliente | Compra 2 boletas de un evento pago | Recibe por correo un enlace para cargar su comprobante, con el plazo indicado |
| CU-05 | Cliente | Carga el comprobante dentro del plazo | El productor recibe el aviso y el cliente ve su compra en revisión |
| CU-06 | Cliente | Deja vencer el plazo sin cargar el comprobante | La reserva se cancela, las sillas se liberan y se le informa que puede volver a intentar |
| CU-07 | Cliente | Compra una boleta de un evento gratuito | Recibe sus boletas de inmediato, sin pago ni aprobación |
| CU-08 | Productor | Aprueba un comprobante | El cliente recibe sus boletas y el aforo se descuenta en firme |
| CU-09 | Productor | Rechaza un comprobante | El cliente es notificado y las sillas se liberan |
| CU-10 | Productor (uno de varios) | Aprueba una compra que otro productor está revisando | El primero en aprobar resuelve el caso; a los demás se les informa quién lo hizo |
| CU-11 | Portero | Registra una venta en efectivo en la puerta | Se emiten las boletas de inmediato y se descuenta el aforo |
| CU-12 | Portero | Escanea una boleta válida | Se autoriza el ingreso y la boleta queda marcada como usada |
| CU-13 | Portero | Escanea una boleta ya usada | Se le informa que ya ingresó, con la hora del primer ingreso, y no se autoriza |
| CU-14 | Portero | Escanea una boleta de otro evento | Se le informa claramente que la boleta es de otra función |
| CU-15 | Productor | Consulta el panel durante el evento | Ve cuántos asistentes entraron y cuántos faltan, actualizado |
| CU-16 | Productor | Descarga la lista de boletas del evento | Obtiene un archivo con los datos de venta e ingreso de cada boleta |
| CU-17 | Cliente | Intenta comprar cuando quedan menos sillas que las que pide | Se le informa cuántas quedan disponibles, sin permitir la sobreventa |
| CU-18 | Administrador | Retira el acceso de un integrante del equipo | Esa persona deja de poder operar en Ágora |

---

## 8. Requisitos no funcionales

### Rendimiento
- La página de un evento debe ser utilizable en menos de 3 segundos sobre red móvil 4G en Bogotá.
- **La validación en puerta es el requisito de rendimiento más estricto del producto:** el veredicto debe aparecer en ≤ 5 segundos desde que se abre la cámara. Ocurre en ráfagas de decenas de escaneos en pocos minutos, tras horas de inactividad del sistema.
- El panel de control debe responder con eventos de hasta 500 boletas sin degradarse.

### Disponibilidad
- La ventana crítica es la hora previa al evento y los primeros minutos de la función. Una caída en ese momento deja gente en la calle; una caída a las 3 de la mañana no le importa a nadie.

### Seguridad
- Nadie puede entrar al teatro con una boleta que no compró, ni con una que ya usó otra persona.
- Los comprobantes de pago son documentos financieros de terceros y nunca son públicos.
- El detalle completo de reglas está en `CLAUDE.md` §5.

### Datos personales
- Ágora recoge nombre, teléfono y correo de personas que no son usuarias registradas. Aplica la Ley 1581 de 2012 (Habeas Data): autorización explícita en el momento de la compra, uso limitado al evento comprado, y acceso restringido a las exportaciones que contienen esos datos.

### Accesibilidad
- Contraste suficiente para leer la pantalla del celular **en la penumbra de la entrada de un teatro** y en la calle a plena luz.
- Objetivos táctiles amplios: el portero opera con una sola mano, de pie y con prisa.
- Navegación por teclado y etiquetas semánticas en los formularios administrativos.

### SEO
- Cada evento debe tener su propia página indexable, con metadatos y vista previa enriquecida al compartirse por WhatsApp o redes sociales. El enlace compartido **es** el canal de difusión principal: si la vista previa se ve mal, la difusión se ve mal.

### Costo
- La infraestructura debe tender a $0 mensuales dentro de la capa gratuita de AWS, igual que Babel.

---

## 9. Restricciones y decisiones de diseño

**El cliente no tiene cuenta y no la tendrá.** Obligar a registrarse para comprar una boleta agrega fricción justo en el punto donde más compras se pierden. La identidad del cliente es su boleta: un código único que solo él tiene. La contrapartida asumida es que un cliente no puede consultar su historial ni recuperar una boleta perdida por sí mismo — debe pedírsela al equipo. Se acepta a cambio de una compra sin registro.

**WhatsApp se difiere a v2, y el MVP funciona completo sin él.** Es el canal natural de Le Tiende y el planteamiento original lo pedía desde el inicio. Pero el envío automatizado depende de una aprobación de Meta cuya duración no controlamos: hacer que el MVP dependa de ella es entregar el control del cronograma a un tercero. El sistema de notificaciones se diseña desde el día uno con el canal como pieza intercambiable, de modo que activar WhatsApp más adelante no exija reescribir los flujos. Mientras tanto el correo es el canal de entrega.

**Bold se difiere a v2.** El flujo de comprobante manual es el que hoy ya existe y funciona; digitalizarlo es valioso por sí solo. Bold elimina el paso de aprobación, que es una mejora grande, pero exige integrar una pasarela real con dinero real y no es requisito para tener un ciclo completo. Se hace después, con el ciclo ya probado en un evento real.

**Las sillas se reservan temporalmente durante el plazo de pago.** Descontar el aforo solo al aprobar el comprobante permite que dos personas compren la última silla; descontarlo de una vez ensucia los reportes con ventas que nunca se concretaron. La reserva con vencimiento es más trabajo de implementar, pero es la única opción que evita la sobreventa sin mentir sobre las cifras de venta. La sobreventa no es un error corregible: es una persona con boleta pagada parada en la puerta de un teatro lleno.

**El aforo es un número, no un mapa de sillas.** No hay silla numerada ni selección de ubicación. El teatro de Le Tiende opera con entrada general, y modelar sillas individuales multiplicaría la complejidad sin resolver ningún problema real.

**Un evento se edita libremente, incluso ya publicado.** La operación real cambia de opinión: se corre una fecha, se ajusta un precio, se suma un productor. Bloquear la edición generaría trabajo por fuera del sistema, que es justamente lo que Ágora viene a eliminar. La contrapartida es que reducir el aforo por debajo de lo ya vendido debe impedirse explícitamente.

**Ágora hereda la identidad visual y las convenciones de Le Tiende.** Misma paleta y tipografía que Comandante y Babel, mismo idioma de código (español), misma cuenta de AWS, mismo proyecto de identidad de Google. Ágora agrega la suite de componentes Angular Material sobre esa base, para no construir a mano las tablas, calendarios y cargas de archivo del panel administrativo. Los roles de Ágora son independientes: tener acceso a Babel no da acceso a Ágora.

**Nada obliga a que la boleta sea digital para entrar.** El QR es el mecanismo, pero el portero siempre puede resolver un caso a mano (celular sin batería, cliente sin datos). La venta en efectivo en puerta existe precisamente para que el sistema nunca sea la razón por la que alguien no entra a un espectáculo.

---

## 10. Glosario de negocio

| Término | Significado en Ágora |
|---|---|
| **Evento** | Una función específica de un espectáculo, con su fecha, hora, aforo y precios propios. |
| **Aforo** | Cantidad total de sillas disponibles para un evento. Es un límite físico del teatro. |
| **Etapa de boletería** | Período de venta con un precio propio y una fecha de cierre (por ejemplo, "preventa" y "taquilla"). Un evento tiene al menos una. |
| **Boleta** | El derecho de una persona a entrar a un evento. Es la unidad que se emite y se valida: una compra de 3 boletas genera 3 boletas independientes, cada una con su código único. |
| **Compra** | La transacción por la cual un cliente adquiere una o varias boletas de un mismo evento. |
| **Reserva** | Bloqueo temporal de sillas mientras el cliente completa su pago. Vence si no se completa dentro del plazo y devuelve las sillas al aforo. |
| **Comprobante** | Imagen o archivo del soporte de pago que el cliente carga para que el productor lo valide. |
| **Aprobación** | Acto por el cual un productor confirma que un comprobante es válido, lo que dispara la emisión de las boletas. |
| **Agotado** | Estado de un evento sin sillas disponibles. No permite más ventas. |
| **Validación / Ingreso** | Acto de escanear el QR de una boleta en la puerta, que autoriza la entrada y consume la boleta. |
| **Boleta usada** | Boleta cuyo titular ya ingresó. No puede volver a usarse. |
| **Cliente** | Quien compra boletas. No tiene cuenta en el sistema. |
| **Portero / Productor / Administrador** | Los tres roles del equipo, en orden creciente de permisos (ver §3). |
| **Cartelera** | Página pública que lista los eventos disponibles. |
| **Panel de control** | Vista de seguimiento de un evento para su productor y para el administrador. |
| **Le Tiende** | El centro cultural en Bogotá al que pertenecen el teatro, la librería (Babel) y esta aplicación. |
