---
type: Note
_width: wide
---
# Planteamiento inicial - Ágora

## Alcance

Este documento busca sentar las bases para la creación de las especificaciones iniciales de un proyecto (PRD, Tech Specs) y la puesta en funcionamiento del **Motor JIT**, definidos en la skill project-docs-bootstrap.

## Objetivo de la aplicación

**Ágora** es una aplicación web que hará parte del ecosistema de aplicaciónes de **Le Tiende**, junto a **Comandante** y **Babel*. Esta aplicación busca simplificar, automátizar y mejorar el proceso de oferta, compra y validación de boletería para espectáculos que se presentan en el teatro de **Le Tiende**.

**Ágora** será *mobile-first*, pero adaptable a tabletas y *desktop*. Funcionará desde la URL `https://agora.letiende.co`.

## Contexto actual

Actualmente, la adquisición de boletas para eventos en Le Tiende se hace de manera manual: el `cliente`, luego de enterarse del evento, envía un mensaje al `productor` solicitando información; el `cliente` realiza la transferencia o pago y le envía al `productor` el comprobante. Luego de que el `productor` valida el comprobante, añade al `cliente` a una lista. Finalmente, el día del evento, el `portero` valida el nombre de los `clientes` en la lista y les permite el acceso al evento en el teatro.

El sistema actual tiene varios problemas: no centraliza la información sobre eventos, no unifica la lista de boletas vendidas, no facilita la validación de las entradas en la puerta del teatro; en general, genera una sobrecarga de trabajo a los administradores de Le Tiende que tienen que responder con muchas tareas simultáneas.

## Roles

### Portero

#### Descripción

Persona o personas encargadas de recibir a los `clientes` en la puerta del teatro y permitir su acceso.

#### Permisos

- Validar las boletas para permitir el ingreso al teatro.
- Realizar la venta de boletas en efectivo.

### Productor

#### Descripción

Persona o personas a cargo del evento.

#### Permisos

- Validar compra de boletas a partir de comprobantes de pago.
- Ver el **Panel de control** y descargar listados o reportes.
- Todos los demás permisos anteriores.

### Administrador

#### Descripción

Integrante de **Le Tiende**, con acceso total a la aplicación.

#### Permisos

- Puede crear y editar eventos.
- Puede gestionar usuarios (crear, eliminar, editar) con los siguientes datos:
   - Nombre
   - Dirección de Gmail
   - Rol
- Todos los demás permisos anteriores.

## Flujos de uso propuestos

### Creación de evento

1. El `administrador` crea un evento, indicando:

    - Nombre del evento.
    - Descripción del evento.
    - Imagen gráfica del evento (opcional).
    - Logotipo del evento, para incluir en la boleta digital (opcional).
    - Fecha y hora del evento.
    - Etapas de la boletería, por defecto 1.
    - Valor de la boleta por etapa. El valor puede ser $0, para eventos gratuitos.
    - Máximo número de boletas por compra / usuario.
    - Fechas de cierre de cada etapa.
    - Medios de pago habilitados para el evento (si no es gratuito):
      - Cuenta Bold de **Le Tiende**, por defecto. Ver [Integración con Bold](#integracion-con-bold).
      - Cuentas de otras entidades financieras, por Bre-B; en este caso, el `administrador` podrá cargar el QR correspondiente.
      - Pago en efectivo. En este caso, el `administrador` debe indicar una referencia. (por defecto, **Le Tiende**; puede ser el nombre de una persona), la dirección física (por defecto, la de **Le Tiende**) y los horarios de atención (por defecto, los de **Le Tiende**).
    - Plazo máximo para enviar comprobante de compra luego de iniciado el proceso (si el evento no es gratuito). Por defecto, 10 minutos.
    - Cantidad de sillas disponibles.
    - `productor` a cargo (pueden ser uno o más, incluyéndose al mismo `administrador`).
    - Enlaces a redes sociales (opcional).

3. El `sistema` crea un código QR con la URL del evento en formatos SVG y PNG, para que el `administrador` o el `productor` lo descargue y pueda ser incorporado en afiches y volantes.
4. El `sistema` incluye el evento dentro del Google Calendar de `letiende.co@gmail.com`.

**NOTA IMPORTANTE:** el `administrador` podrá editar los datos del evento en cualquier momento; solo los cambios de nombre, descripción, fecha y hora, y productor o productores, generarán una actualización del evento en Google Calendar.

### Compra de boletas

1. El `cliente` ingresa a la aplicación y navega por los diferentes eventos disponibles, seleccionando uno. También puede ingresar directamente desde el QR del evento.
2. El `cliente` ingresa el número de boletas que quiere (hasta el límite permitido), su nombre, teléfono e email.
3. El `sistema` indica el precio total, los medios de pago y la advertencia de que el proceso debe completarse en el plazo máximo determinado.
4. El `cliente` acepta los términos y condiciones.
5. Si el evento cuenta con la cuenta Bold de **Le Tiende** como medio de pago disponible y el cliente paga por ese medio, la pasarela de pago informa al `sistema` que la compra es válida; en este caso se salta al paso 10.
6. El `sistema` envía un vínculo al WhatsApp y al email del cliente, para cargar el comprobante de pago.
7. El `cliente` abre el vínculo y carga el comprobante de pago.
8. El `sistema` envía un mensaje por WhatsApp al `productor` con el comprobante de pago y un vínculo de aprobación.
9. El `productor` valida el comprobante, abre el vínculo de aprobación y aprueba la compra.
10. El `sistema` envía cada boleta comprada, en formato digital, al WhatsApp y al email del `cliente`; cada boleta incluye:

    - Un código QR con un identificador único por boleta.
    - Nombre, descripción, fecha y hora del evento.
    - Dirección de **Le Tiende**.
    - Si exite, etapa de la boleta.
    - Datos del `cliente`.
    - Logotipo de **Le Tiende**
    - Logotipo del evento (si se incluyó).

11. El `sistema` descuenta, de las sillas disponibles, las boletas vendidas.
12. Si las sillas disponibles llegan a 0, el `sistema` marca el evento como **AGOTADO** y no permite más ventas.

**NOTAS IMPORTANTES:**
- Los emails del `sistema` deben salir de `taquilla@letiende.co`. 
- Si el evento es gratuito, no se realiza ningúna transacción de pago; del paso 2 se salta al 4 y de ahí al 10.
- Si el evento tiene varios `productores`, el paso 8 le envía mensajes a todos. Y en el paso 9, el primer `productor` que apruebe la compra bloquea los flujos de aprobación de los demás `productores`.
- Si el `cliente` va a pagar en efectivo, los pasos iniciales son:
    1. El `cliente` va a la dirección física en los horarios de atención.
    2. El `productor`, el `portero` o el `administrador` abre el vínculo del evento y oprime el botón **VENTA EN EFECTIVO**.
    3. El `productor`, el `portero` o el `administrador` ingresa los datos del cliente y acepta la compra.
    4. El `sistema` continúa desde el paso 10 del flujo.

### Día del evento

1. El `cliente` se acerca a la puerta del teatro de **Le Tiende**, con su boleta digital.
2. El `portero` abre el vínculo del evento y oprime el botón **INGRESO AL TEATRO**.
3. El `sistema` abre la cámara y el `portero` escanea el código QR de la boleta
4. El `sistema` comprueba que la boleta es válida y la elimina de la lista de boletas habilitadas.
5. El `portero` permite el acceso al `cliente`.

### Panel de control

- El `productor` podrá ingresar al *dashboard* del evento, con información de valor y cantidad de boletas vendidas por etapa, sillas disponibles, datos de los `clientes`, y sillas ocupadas y disponibles durante el evento (`clientes` que han ingresado o faltan por ingresar).
- El `productor` podrá descargar en formato XLSX o PDF la lista de boletas, que incluye datos de `cliente`, fecha y hora de compra, medio de pago, valor unitario, etapa de boletería, fecha y hora de ingreso al evento, y valor total de la boletería.

## Stack tecnologico inicial

| Componente | Tecnología | Descripción |
| --- | --- | --- |
| Frontend | Angular 22 SSR | Framework de desarrollo frontend |
| UI framework | PrimeNG 22 | Suite de componentes UI |
| Autenticación | Firebase Auth | Sistema de autenticación básico, para los usuarios `administrador`, `productor` y `portero`. |
| Backend | AWS Lambda y AWS DynamoDB | Registro de las transacciones de todos los flujos de la aplicación. |
| Mensajería | AWS SES y AWS End User Messaging Social | AWS SES para enviar notificaciones y confirmaciones a emails, usando la infraestructura ya creada en AWS. Explorar la opción de enviar mensajes a WhatsApp a través de AWS End User Messaging Social. |

## Fuentes de información

### Integración con Bold

- [Llaves de integración](https://developers.bold.co/pagos-en-linea/llaves-de-integracion)
- [Botón de pagos - Integración manual](https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual)
- [API link de pagos](https://developers.bold.co/pagos-en-linea/api-link-de-pagos)
