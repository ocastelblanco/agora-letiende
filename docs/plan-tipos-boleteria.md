# Plan de Tipos de boletería

**Fecha:** 29/10/2026 · **Estado:** implementado (29/10/2026) · **Roadmap:** #33 (`docs/tech-specs.md` §11) · **Decisión:** ADR-020 (`docs/MEMORY.md` §3)

Un evento puede vender más de un tipo de boleta al mismo tiempo (por ejemplo «Individual» y «Pareja»), combinados con las etapas de boletería: 2 tipos × 2 etapas = 4 precios. A futuro el mismo mecanismo sirve para ubicación o para paquetes (libro + entrada y entrada sola). Todas las decisiones de este documento se resolvieron con OCM en la sesión del 29/10/2026.

---

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Aforo y QR de un tipo multi-persona | La boleta «Pareja» consume 2 sillas y emite **1 solo QR**. Entran las dos personas o ninguna: una sola transición `valida → usada`, **sin ingresos parciales**. La puerta no cambia. |
| Campo «Personas» | Cada tipo tiene `personas` (entero 1–10, por defecto 1) = sillas que consume cada boleta de ese tipo. Va junto al nombre en el panel «Tipos de boletería». |
| Compra | Un solo tipo por compra. El cliente envía solo `tipoId`; el precio sale siempre del backend. |
| `maxBoletasPorCompra` | Cuenta **boletas**, no personas (3 parejas = 3 boletas = 6 sillas). |
| Datos existentes | **Normalización al leer, sin migración.** Un evento sin `tiposBoleta` se lee como un único tipo `defecto` («Por defecto», 1 persona) con el precio actual de cada etapa. Compras y boletas sin `tipoId` son `defecto`. No se reescribe nada en producción. |
| Renombrar un tipo con ventas | Permitido. Compras y boletas guardan el nombre original como instantánea; el panel agrupa por `tipoId`. |
| Taquilla | La venta en efectivo también ofrece el selector de tipo. |
| Infraestructura | Sin tablas, GSIs ni recursos nuevos. Costo adicional US$0; `PAY_PER_REQUEST` no cambia. |

---

## Modelo de datos

```ts
interface TipoBoleteria {
  tipoId: string;       // UUID; el tipo implícito de datos legados es el literal 'defecto'
  nombre: string;       // "Individual", "Pareja", "Por defecto"
  personas: number;     // 1..10 — sillas que consume cada boleta de este tipo
  orden: number;
}
interface PrecioEtapa { tipoId: string; precio: number }   // COP entero; 0 = gratuito

// Evento: nuevo `tiposBoleta: TipoBoleteria[]`
// EtapaBoleteria: nuevo `precios: PrecioEtapa[]` (el `precio` plano legado se conserva como lectura)
// Compra:  nuevos `tipoId`, `tipoNombre`, `personas`, `sillas` (= cantidad × personas)
// Boleta:  nuevos `tipoId`, `tipoNombre`, `personas`
```

**Normalización al leer (una sola función compartida por todos los handlers):** si `evento.tiposBoleta` falta o está vacío → `[{ tipoId: 'defecto', nombre: 'Por defecto', personas: 1, orden: 0 }]`; si una etapa no tiene `precios` → `[{ tipoId: 'defecto', precio: etapa.precio }]`. Al guardar un evento, el formulario siempre escribe el formato nuevo.

---

## Orden de entrega

Un PR por tarea, cada uno en su propia rama creada desde `main`.

| # | Tarea | Rama | Depende de |
|---|---|---|---|
| 0 | Este plan y la documentación (JIT, memoria, PRD, tech-specs) | `docs/plan-tipos-boleteria` | — |
| 1 | Backend: modelo, validación, compra, aforo, boletas, reportes | `feature/tipos-boleteria-backend` | 0 |
| 2 | Frontend de administración: panel «Tipos de boletería» y etapas | `feature/tipos-boleteria-admin` | 1 |
| 3 | Frontend público y operativo: evento, compra, taquilla, puerta, boleta, panel, reportes | `feature/tipos-boleteria-publico` | 1, 2 |

El PR de backend se puede desplegar solo: con la normalización al leer, nada cambia hasta que se edite un evento.

---

## Tarea 1 — Backend (roadmap #33, parte 1)

- **Normalización:** función única `normalizarTipos(evento)` (nuevo módulo en `server/api/lib/`), usada por todos los handlers. Ningún handler lee `etapa.precio` directamente.
- **`eventos.ts`:**
  - Valida `tiposBoleta`: al menos uno, nombres únicos (sin distinguir mayúsculas), longitud acotada, sin caracteres de control, `personas` entero 1–10.
  - Valida `precios` por etapa: al menos uno, sin `tipoId` repetido, todo `tipoId` debe existir en el evento, precio entero ≥ 0.
  - Rechaza (400/409) borrar de `tiposBoleta` un tipo que alguna etapa aún use (el botón deshabilitado del formulario es solo UX).
  - `normalizarEtapas` sigue preservando los `etapaId`. Un `tipoId` nuevo lo genera el servidor.
  - Un evento con `administradoPorLeTiende: false` o sin etapas normaliza `tiposBoleta` al valor neutro.
  - `duplicarEvento` copia tipos y precios.
- **`eventos-publicos.ts`:** expone `tiposBoleta` y `precios` por etapa (también para eventos legados, ya normalizados).
- **`compras.ts` y `ventas-efectivo.ts`:**
  - El payload acepta `tipoId` (opcional; ausente = `defecto` solo si el evento tiene un único tipo; con varios tipos y sin `tipoId` → 400).
  - Un `tipoId` que no existe en el evento → 400. Un tipo sin precio en la etapa vigente → 409 con mensaje claro.
  - `montoTotal = precio_del_tipo × cantidad`; `sillas = cantidad × personas`. Cualquier precio, total o `personas` del cliente se descarta.
  - Las reglas actuales de precio 0 (501 en efectivo, Bold, adquisición gratuita) se aplican **por tipo**, no por etapa.
  - `maxBoletasPorCompra` se compara contra `cantidad` (boletas).
  - La compra guarda `tipoId`, `tipoNombre`, `personas`, `sillas`.
- **`aforo.ts` y `liberar-reservas.ts`:** reservar, confirmar y devolver trabajan con `compra.sillas` (respaldo: `cantidad` si falta, para compras legadas). La guarda de devolución sigue calculándose en JS (`sillasDisponibles + sillas <= sillasTotales`), nunca con aritmética en `ConditionExpression`.
- **`bold-webhook.ts` y `aprobaciones.ts`:** pasan `tipoId`/`tipoNombre`/`personas` a `emitirBoletas` y reconcilian contra el `montoTotal` ya guardado (sin cambios de lógica).
- **`services/boleteria.ts`:** `emitirBoletas` escribe `tipoId`, `tipoNombre`, `personas` en cada boleta; una boleta por unidad de `cantidad` (no por persona).
- **`boletas.ts`:** la validación en puerta y la vista de boleta devuelven `tipoNombre` y `personas`. El veredicto «VÁLIDA» incluye cuántas personas admite.
- **`reportes.ts` y `reporte-pdf.ts`:** `porEtapa` pasa a agrupar por etapa **y** tipo; la lista de compras y de boletas (JSON, XLSX, PDF) agrega la columna «Tipo de boleta». El contador de asistentes del panel suma `personas` de las boletas usadas (no el número de boletas). Datos legados: «Por defecto».
- **`google-calendar.ts`:** revisar si lee el precio de la etapa; si lo usa, mostrar el rango.
- **Pruebas:** unitarias por cada punto anterior, incluida la compra legada sin `tipoId`, la devolución idempotente con `personas = 2` y un `tipoId` hostil. **Verificación en staging contra DynamoDB real** (el mock no valida la gramática de `ConditionExpression`, `CLAUDE.md` §7).

## Tarea 2 — Frontend de administración (roadmap #33, parte 2)

Ruta `/mis-eventos/eventos/:id` (`editar-evento.component`), colapsible «Etapas de boletería»:

- **Panel «Tipos de boletería»**, antes de los paneles de etapa: una fila por tipo con el campo de texto «Tipo de boletería» (prellenado «Por defecto»), el campo numérico «Personas» (por defecto 1) y un botón de ícono para eliminar. Un botón de ícono añade un tipo.
- **Eliminar tipo:** habilitado solo si ningún `precios` de ninguna etapa usa ese tipo. La primera fila no se elimina: el botón restablece su contenido a «Por defecto».
- **Panel de cada etapa:** «Nombre de la etapa» (con label) y fecha de cierre, uno debajo del otro; debajo, una línea por tipo de la etapa con desplegable de tipos, campo «Precio» (con label) y botón de ícono para eliminar la línea, más un botón de ícono para añadir otra línea. La primera línea no se elimina: el botón vuelve el desplegable a «Por defecto».
- Un tipo no puede repetirse en una misma etapa (las opciones ya elegidas se deshabilitan en los demás desplegables).
- Al renombrar un tipo, las líneas de las etapas siguen apuntando al mismo `tipoId`.
- Etiquetas accesibles (`aria-label`) en todos los botones de ícono; diseño móvil primero.
- **Guarda síncrona** `if (this.guardando()) return;` ya existente se conserva.
- Pruebas del componente: alta/baja de tipos, regla de borrado, regla de la primera línea, estado de los botones.

## Tarea 3 — Frontend público y operativo (roadmap #33, parte 3)

- **`/evento/:slug`:** «Etapas de boletería» como tabla — primera columna con `flex: 1 1 auto` (nombre y «Cierra: …»), una columna por tipo, sin líneas divisorias verticales, solo separación por margen. Celda sin precio para ese tipo: «—». Etapas cerradas, atenuadas y con precio tachado (como hoy).
  - **Debajo de la tabla:** un botón «Comprar {tipo} {precio}» por cada tipo con precio en la etapa vigente.
  - **Regla de la nota:** si todas las etapas solo tienen el tipo «Por defecto», no se muestra el encabezado de columna con el tipo; la vista queda como hoy y el botón sigue siendo «Comprar boletas» / «Adquirir boletas gratuitas».
- **`/evento/:slug/comprar`:** recibe `?tipo=<tipoId>`; el resumen muestra tipo, cantidad y total. El precio mostrado es solo informativo; el total real lo devuelve el servidor.
- **Venta en efectivo (`/evento/:slug/efectivo` y `/taquilla/efectivo`):** selector de tipo; las guardas contra doble toque se conservan.
- **Puerta:** el veredicto válido muestra el tipo y «Admite N personas».
- **Boleta digital (`/boleta/:codigo`):** muestra el tipo y, si admite más de una persona, «Válida para N personas».
- **Panel del evento y reportes:** «Ventas por etapa» pasa a «por etapa y tipo» con la columna «Tipo de boleta»; la lista de compras y de boletas también.
- **E2E (Playwright):** actualizar la suite simulada y agregar el caso de compra de pareja (2 sillas, 1 boleta, aforo correcto). Si la suite real contra Bold sigue sembrando un evento sin tipos, debe seguir pasando sin cambios (prueba de retrocompatibilidad).
- **Verificación OWASP** (skill `owasp-security-verification`): `tipoId` hostil, precio manipulado, XSS en el nombre del tipo (interpolación estándar de Angular y escape en el HTML de los correos).

---

## Definición de terminado

1. Build, pruebas del frontend y pruebas del backend en verde; `npm ci --dry-run` sin cambios en el lock.
2. Un evento legado (sin tipos) se ve, se compra y se reporta exactamente igual que hoy.
3. Un evento con Individual + Pareja y dos etapas: la tabla muestra 4 precios, el botón de pareja descuenta 2 sillas y emite 1 QR, y el aforo vuelve a su valor original si la reserva expira (probado en staging real).
4. Fila en `docs/tracking.csv` por cada bloque de trabajo.
5. Resumen movido a `MEMORY.md` §2 y siguiente tarea calculada para `TODO.md`.
