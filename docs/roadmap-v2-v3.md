# Roadmap de Ágora — Qué sigue después del lanzamiento

**Dirigido a:** los socios de Le Tiende.
**Última actualización:** 25 de agosto de 2026.

Este documento explica, en lenguaje sencillo, qué funcionalidades quedan pendientes en Ágora (la boletería del teatro) después del primer lanzamiento, por qué se dejaron para después, y **qué necesitamos de ustedes** para poder avanzar en cada una. No es un documento técnico — el detalle de arquitectura vive en `docs/tech-specs.md`, y el detalle completo de producto en `docs/PRD.md`.

---

## 1. Dónde estamos hoy

**Ágora ya está en producción**, disponible en [`agora.letiende.co`](https://agora.letiende.co). El ciclo completo de un evento funciona de punta a punta:

- El equipo crea y publica el evento (aforo, precios por etapa, medios de pago, productores y porteros asignados).
- El cliente compra sin necesidad de cuenta, paga por transferencia o efectivo, y sube su comprobante.
- El productor aprueba o rechaza el comprobante desde un enlace que le llega por correo.
- El cliente recibe su boleta digital con código QR por correo.
- El portero valida el ingreso en la puerta escaneando el QR, con aviso claro si la boleta ya se usó, no existe, o es de otro evento.
- El equipo tiene un panel de control por evento (vendidas, disponibles, ingresados) y puede exportar la lista completa de boletas en Excel.

Todo lo de arriba **ya funciona hoy, sin depender de nada más**. Lo que sigue en este documento es lo que decidimos dejar para después del primer lanzamiento — porque no era indispensable para tener un ciclo completo, porque depende de un trámite externo que no controlamos, o porque todavía no se ha decidido si vale la pena construirlo.

---

## 2. Versión 2 — Automatización y más medios de pago

La v2 se enfoca en quitarle trabajo manual al equipo (sobre todo a los productores, que hoy aprueban comprobantes uno por uno) y en llegar a los clientes por el canal donde realmente están: WhatsApp.

| Funcionalidad | Qué le resuelve a Le Tiende | Qué necesitamos de ustedes | Estado |
|---|---|---|---|
| **Boletería opcional (aforo sin cobro)** | Hoy todo evento necesita al menos un precio configurado, aunque sea $0. Con esto, un evento puede no tener ninguna etapa de boletería — sirve solo para controlar el aforo (por ejemplo, un conversatorio de entrada libre con cupo limitado), sin fingir un cobro que no existe. La adquisición queda disponible directamente en línea o en taquilla, sin pasar por comprobante ni aprobación. | Nada de su parte — es trabajo interno de desarrollo. | ✅ Ya construido y probado en el ambiente de pruebas — falta pasarlo a producción |
| **Eventos con boletería externa** | Hay eventos que se realizan en el teatro pero cuya boletería la vende un tercero. Con esto, ese evento igual se anuncia en la Cartelera de Ágora (con su imagen y su código QR para el afiche), pero en vez de un botón de compra muestra un enlace de WhatsApp, Instagram o una página web hacia donde el interesado debe ir a conseguir su boleta. | Nada de su parte — es trabajo interno de desarrollo. | ✅ Ya construido y probado en el ambiente de pruebas — falta pasarlo a producción |
| **Sincronización con Google Calendar** | Cada evento que se crea en Ágora aparece automáticamente en el calendario de `letiende.co@gmail.com`, sin tener que agregarlo a mano. | Nada de su parte — ya se confirmó el calendario y se dio el acceso necesario. | ✅ En producción, ya funcionando |
| **Pago automático con Bold** | El cliente paga en línea con tarjeta u otros medios de Bold, y el sistema confirma el pago solo — sin comprobante que cargar ni productor que apruebe. Es la mejora que más tiempo le ahorra al equipo. | Nada de su parte — ya nos dieron las llaves de acceso a la API de Bold; queda trabajo interno de desarrollo (el botón de pago que verá el cliente). | 🟡 En progreso — la parte técnica del servidor ya está lista y verificada; falta el botón de pago que verá el cliente |
| **Notificaciones por WhatsApp** | Todo lo que hoy llega por correo (enlace para cargar el comprobante, aviso de aprobación al productor, entrega de la boleta) llegaría también por WhatsApp — el canal donde hoy realmente ocurre la conversación con el cliente. | Ver la sección 4 abajo — es el requisito más largo de resolver de todo este documento. | 🟡 No iniciado, depende de un trámite de Meta |
| **Exportación de reportes en PDF** | Complementa la exportación en Excel (que ya funciona hoy) con un formato listo para imprimir o compartir sin abrir una hoja de cálculo. | Nada de su parte — es trabajo interno de desarrollo. | 🟡 No iniciado |

**Ya resuelto, sin necesidad de desarrollo adicional:** en el planteamiento original se había considerado un medio de pago aparte para transferencias por Bre-B, con un código QR propio. En la práctica, Bre-B es simplemente un tipo de transferencia bancaria común — el medio de pago **"Transferencia"**, que ya funciona desde el lanzamiento, ya lo cubre. No hace falta construir nada extra para esto.

**Adelantado antes de lo previsto** — estas dos funcionalidades estaban originalmente planeadas para la v2, pero se entregaron durante el lanzamiento de v1 porque el trabajo de endurecimiento previo a producción ya las necesitaba:

- ✅ Exportación de reportes en **Excel (XLSX)**.
- ✅ **Cierre automático de etapas de boletería** por fecha (por ejemplo, que "Preventa" deje de ofrecerse sola cuando llega la fecha de cierre, sin que alguien tenga que desactivarla a mano).

---

## 3. Versión 3 — Ideas todavía no comprometidas

Estas ideas surgieron en las conversaciones iniciales del proyecto, pero **todavía no están priorizadas ni tienen fecha**. Se evaluarán con calma según lo que muestre el uso real de la v1 y la v2 — es muy posible que algunas cambien de prioridad, o que aparezcan otras nuevas que hoy no imaginamos.

| Idea | Qué resolvería | Prioridad actual |
|---|---|---|
| Validación en puerta sin conexión a internet | El escaneo de boletas seguiría funcionando aunque el teatro se quede sin señal o wifi ese día. | Baja |
| Devoluciones y transferencia de boletas entre personas | Un cliente podría pedir su plata de vuelta, o pasarle su boleta a otra persona, sin tener que escribirle al equipo. | Baja |
| Códigos de descuento y cortesías | Boletas gratuitas o con descuento para casos puntuales (prensa, patrocinadores, sorteos), sin tener que gestionarlas por fuera del sistema. | Baja |
| Historial de compras del cliente por correo | El cliente podría recuperar sus boletas o ver sus compras anteriores sin pedírselas al equipo. Hoy no es posible porque el cliente no tiene cuenta — es una decisión de diseño intencional del v1 (menos fricción para comprar). | Baja |
| Métricas de todos los eventos juntos (por temporada) | Ver, por ejemplo, cuánto vendió el teatro en todo un mes o una temporada, no evento por evento. | Baja |

---

## 4. Qué necesitamos de Le Tiende para avanzar

Esta es la lista concreta de lo que nos falta de parte de ustedes — sin esto, no podemos empezar a construir la funcionalidad correspondiente, así el desarrollo esté listo para arrancar.

| Qué necesitamos | Para qué funcionalidad | Por qué conviene empezarlo ya |
|---|---|---|
| **Una línea telefónica nueva y dedicada a Ágora**, que **nunca haya estado activa en la app normal de WhatsApp** (es un requisito de Meta, no nuestro) | Notificaciones por WhatsApp | Es el paso que más se demora de todo este documento. El trámite de verificación de negocio ante Meta y la aprobación de las plantillas de mensaje puede tomar varias semanas y **no está bajo nuestro control** — mientras antes se consiga el número y se inicie el trámite, antes se puede activar WhatsApp. |
| **Retroalimentación real del uso de Ágora en los primeros eventos** | Definir qué se prioriza primero dentro de esta lista | Es lo único que estamos esperando ahora mismo para decidir la siguiente prioridad — preferimos ajustar el rumbo con la experiencia real del equipo y los clientes, no solo con lo que imaginamos desde el escritorio. |

**Ya resuelto, sin necesidad de más gestión de su parte:** la activación de la cuenta Bold de Le Tiende y sus llaves de acceso a la API (identidad y secreta, de pruebas y de producción) ya se obtuvieron y ya están configuradas — lo que falta de Pago automático con Bold es enteramente trabajo interno de desarrollo (el botón de pago), no algo pendiente de ustedes.

---

## 5. Cómo se decide el orden

Ágora no tiene una fecha límite fija para v2/v3 — el orden lo determinan tres cosas, en este orden de importancia: **qué necesita el equipo de Le Tiende con más urgencia**, **qué depende de un trámite externo que conviene arrancar cuanto antes** (como el número de WhatsApp), y **las dependencias técnicas entre funcionalidades**. Este documento se actualiza cada vez que cambia el estado de alguno de estos puntos — el estado más reciente de las tareas en desarrollo activo siempre vive en `docs/TODO.md`.
