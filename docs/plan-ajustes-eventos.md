# Plan de ajustes a eventos y pruebas E2E

**Fecha:** 30/09/2026 · **Estado:** aprobado por OCM · **Roadmap:** #26 a #30 (`docs/tech-specs.md` §11)

Cinco ajustes pedidos directamente por OCM, que el motor JIT de `docs/TODO.md` toma por delante de su orden normal (decisión explícita del usuario, no calculada). Todas las decisiones de diseño de este documento se resolvieron con OCM mediante `AskUserQuestion` en la sesión del 30/09/2026.

**Antecedente inmediato:** durante la planeación se encontró en producción que 11 eventos compartían 4 slugs (varias funciones del mismo espectáculo el mismo día). Se corrigió **antes** de este plan como hotfix, en el PR #77 (fusionado) y con una corrección de datos en producción. Ver `docs/MEMORY.md` §7 y ADR-014. La funcionalidad de duplicar (Tarea 3) parte de esa regla de slug único.

---

## Orden de entrega

Un PR por tarea, cada uno en su propia rama creada desde `main`.

| # | Tarea | Rama sugerida | Depende de |
|---|---|---|---|
| 0 | Este plan y la documentación de producto/arquitectura | `docs/plan-ajustes-eventos` | — |
| 1 | Duración de eventos (roadmap #26) | `feature/duracion-eventos` | — |
| 2 | Lista de eventos: estado, orden y filtros (roadmap #27) | `feature/lista-eventos-filtros` | — |
| 3 | Duplicar evento (roadmap #28) | `feature/duplicar-evento` | 1, 2 |
| 4 | Lista de paneles: orden y filtro por periodo (roadmap #29) | `feature/lista-paneles-filtros` | 2 |
| 5 | Pruebas Playwright del flujo de compra con Bold (roadmap #30) | `feature/pruebas-playwright-bold` | 1–4 (interfaz estable) |

Por qué este orden: la duración es un campo que el duplicado ya debe copiar (1 → 3). La columna de acciones con iconos donde vive el botón de duplicar nace en la Tarea 2 (2 → 3). Las utilidades de periodo y orden que crea la Tarea 2 se reutilizan en la lista de paneles (2 → 4). Las pruebas E2E van al final, sobre una interfaz que ya no va a cambiar.

---

## Tarea 1 — Duración de eventos

- **Modelo:** campo nuevo `duracionMinutos: number` en `agora-eventos`. Es un entero entre 15 y 1440 minutos, con 180 por defecto. Se valida en `crearEvento()` y `actualizarEvento()` (`server/api/handlers/eventos.ts`).
- **Quién lo edita:** solo el administrador. No se agrega a `CAMPOS_EDITABLES_PRODUCTOR`.
- **Formulario** (`editar-evento.component`): dos campos, horas (0–24) y minutos (con paso de 5), precargados con 3 h 00 min. Se envían como un único `duracionMinutos`. Sin texto de ayuda sobre Google Calendar: el campo podría usarse para otras cosas más adelante (decisión de OCM, 30/09/2026).
- **Google Calendar** (`server/api/services/google-calendar.ts`): la constante `DURACION_EVENTO_MS` desaparece. La hora de fin pasa a ser `fechaHora + duracionMinutos`, y `EventoParaCalendar` recibe `duracionMinutos`. Si se cambia la duración, Calendar se actualiza con el mismo `sincronizarConGoogleCalendar()` que ya corre tras cada `PUT`.
- **Eventos existentes:**
  - Un script de un solo uso (`server/scripts/rellenar-duracion.mjs`, en JavaScript plano para no depender de la compilación de las Lambdas) escanea la tabla y aplica `UpdateItem` con `ConditionExpression: attribute_not_exists(duracionMinutos)`, así que nunca sobrescribe un evento que ya tenga el campo.
  - Se ejecuta primero en staging. En producción solo con aprobación explícita de OCM.
  - Además, toda lectura usa 180 cuando el campo falta (defensa en profundidad).
  - Las entradas de Calendar existentes ya duran 3 h, así que no hay que resincronizar.
- **Fuera de alcance:** la finalización automática por vigencia (`vigencia-evento.ts`) sigue basada en `fechaHora` y las etapas, no en la hora de fin. Si se quiere cambiar, es un ajuste aparte.

## Tarea 2 — Lista de eventos (`/mis-eventos/eventos`)

- **Columnas:** salen "Sillas" y "Estado".
- **Indicador de estado:** a la izquierda del nombre, un ícono dentro de un chip circular, con `matTooltip` y `aria-label` para que el estado no dependa solo del color. Los tokens de color se documentan en `docs/DESIGN.md` §10.

  | Estado | Ícono (Material Icons) | Fondo |
  |---|---|---|
  | Borrador | `draft` | Gris |
  | Publicado | `check_circle` | Verde |
  | Agotado | `group_off` | Azul |
  | Finalizado | `history` | Amarillo |
  | Cancelado | `cancel` | Rojo |

- **Estado que ve la lista:** `listarEventos()` pasa a devolver el estado efectivo, con el mismo `estadoEfectivo()` que ya usa la cartelera. Hoy devuelve el estado persistido, así que un evento vencido que nadie visitó sigue apareciendo como "publicado".
- **Acciones:** solo botones de ícono (`mat-icon-button`, con `aria-label` y tooltip): `edit` (editar) y `delete` (borrar, solo administrador). El botón `content_copy` (duplicar) **no se agregó en esta tarea**, a propósito: un botón sin acción sería peor que no tenerlo. Llega con la Tarea 3.
- **Orden:** `MatSort` sobre nombre (comparación en español que ignora tildes) y fecha. Por defecto, fecha con la más reciente primero.
- **Filtros** (en el cliente, porque `GET /api/eventos` ya trae la lista completa):
  - Estado: chips de selección múltiple.
  - Periodo: selector "Todos / Mes / Semana" con flechas ‹ › para moverse entre periodos. Las semanas van de lunes a domingo, en hora de Bogotá.
  - Los filtros y el orden se guardan en los *query params* de la URL, para conservarlos al volver de editar un evento.
- **Piezas reutilizables** (para la Tarea 4):
  - `shared/utilidades/periodo-eventos.ts`: funciones puras para el rango de un periodo en Bogotá, filtrar y ordenar.
  - `shared/filtros/filtro-periodo.component.ts`: el control de periodo con flechas.
- **Íconos:** se verificó que la fuente Material Icons que ya cargaba `src/index.html` no incluye `draft`. Se cargan entonces como un subconjunto de Material Symbols Outlined (`icon_names`), y cada ícono nuevo se suma a esa lista (`docs/DESIGN.md` §10).

## Tarea 3 — Duplicar evento

- **Endpoint:** `POST /api/eventos/{eventoId}/duplicar`, exclusivo del administrador (`resolverPermisos`). La copia se arma **solo** a partir del ítem guardado; el endpoint no acepta payload (`CLAUDE.md` §5, A08).
- **Qué lleva la copia:**
  - Todos los datos del original, incluidos productores, porteros, duración, fecha y etapas.
  - El **mismo nombre**: es otra función del mismo espectáculo, no un evento distinto.
  - Estado `borrador`.
  - Aforo reiniciado: `sillasDisponibles = sillasTotales` y `sillasReservadas = 0`.
  - `etapaId` nuevos.
  - Sin `googleCalendarEventId` (Calendar la crea al guardar, como cualquier evento nuevo).
  - Rastro de auditoría: `duplicadoDe` (id del original) y `creadoPor` (correo del administrador).
- **Slug** (regla decidida con OCM, sin la palabra "copia"):
  - La copia parte del slug base del original, quitando un contador romano previo si lo tiene, y pasa por `resolverSlugDisponible()` (PR #77).
  - Como la copia nace con la misma fecha que el original, recibe el siguiente contador libre: `show-magico-2026-09-30-ii`, `-iii`…
  - Mientras el evento esté en `borrador`, el slug se puede editar. El formulario lo recalcula desde nombre y fecha cuando el administrador cambia la fecha, salvo que lo haya editado a mano.
  - Al guardar, el backend vuelve a resolver la unicidad excluyendo al propio evento. Si la nueva fecha cae en un día sin otras funciones, el contador desaparece.
  - `actualizarEvento()` solo acepta `slug` con `ConditionExpression: estado = :borrador`. Al publicar, el slug queda fijo, porque puede haber QR y enlaces circulando.
- **Imágenes:**
  - La portada y el logotipo se copian con `CopyObject` a `eventos/{nuevoId}/{tipo}-{uuid}.{ext}`. El `CacheControl` se conserva (`MetadataDirective: COPY`).
  - Si falla la escritura del evento, se borran las copias.
  - Permiso IAM nuevo, de mínimo privilegio: `s3:GetObject` sobre `eventos/*` del bucket de activos.
- **Frontend:**
  - Botón `content_copy` en la lista.
  - Una guarda síncrona al inicio del método (`if (this.duplicando()) return;`, `CLAUDE.md` §7) evita que un doble toque cree dos copias.
  - Al terminar, navega directo a `/mis-eventos/eventos/{nuevoId}` en modo edición.

## Tarea 4 — Lista de paneles (`/mis-eventos/panel`)

- Mismo control de periodo de la Tarea 2 (Todos / Mes / Semana con flechas ‹ ›) y ordenador por **fecha (por defecto)** o nombre, con sentido ascendente o descendente.
- La lista es de tarjetas, no una tabla, así que el orden usa un `mat-button-toggle-group` ("Fecha | Nombre") más un botón de sentido, en vez de encabezados `MatSort`.
- Reutiliza `periodo-eventos.ts` y `FiltroPeriodoComponent`, sin reimplementar la lógica.
- Filtros y orden en los *query params* de la URL, igual que la Tarea 2.
- Sin filtro por estado (no se pidió para esta vista).

## Tarea 5 — Pruebas Playwright del flujo de compra con Bold

Esquema **híbrido**, decidido con OCM (ADR-015):

- **Suite simulada** (`e2e/simulado/`):
  - Corre en CI en cada PR.
  - La API se simula con `page.route` y Bold con un `window.BoldCheckout` de prueba.
  - Cubre el recorrido completo: cantidad, datos del cliente y autorización de datos personales, "Pagar con Bold", pago aprobado, pago rechazado, cierre sin pagar (aparecen "Verificar estado" y "Reabrir"), la guarda contra doble toque y el aforo agotado.
  - Proyectos: Chromium de escritorio, Pixel (Chromium) e iPhone (WebKit), porque el flujo es *mobile-first*.
- **Suite real contra staging** (`e2e/staging/`):
  - Se lanza a mano (`workflow_dispatch`), nunca bloquea un PR.
  - `globalSetup` crea un evento temporal directo en DynamoDB de staging; `globalTeardown` borra el evento, sus compras y sus boletas.
  - Paga dentro del iframe real del checkout sandbox de Bold con tarjetas de prueba (aprobada y rechazada) y escribe en el propio checkout la URL del webhook de staging.
  - Verifica las boletas emitidas y el aforo.
  - El correo del cliente es `success@simulator.amazonses.com` (simulador de SES), para no escribirle nunca a una persona real.
- **Evidencia para el portafolio:** reporte HTML, trazas y video guardados como *artifacts* de GitHub Actions, más un badge y una sección en el README.
- **Comandos nuevos** (se agregan a `CLAUDE.md` §3 con esta tarea, no antes): `npm run e2e` y `npm run e2e:staging`.
- **Riesgo aceptado:** el HTML interno del iframe de Bold no está documentado, así que la suite real es frágil por naturaleza y por eso no bloquea PRs.
- **Pendientes que no son de código** (en `docs/tareas-a-realizar.md`):
  - Credenciales IAM propias para CI, limitadas a las tablas `agora-*-staging` (sin reutilizar las de despliegue).
  - Confirmar las tarjetas de prueba vigentes del sandbox de Bold.

---

## Documentación que se actualiza

| Documento | En este PR 0 | Al cerrar cada tarea |
|---|---|---|
| `docs/PRD.md` | §5.2 (duración, duplicar, slug único), §5.6 (lista de paneles), §6 (filas v2), §8 (calidad) | Estado de cada fila del roadmap |
| `docs/tech-specs.md` | §4.3 (modelo), §5.1 (endpoints), §10 (pruebas), §11 (#26 a #30) | Archivos reales si difieren de los previstos |
| `docs/DESIGN.md` | §10 (chips de estado y botones de ícono) | Hex definitivos, tras verificar contraste |
| `docs/TODO.md` | Tarea 1 y Tarea 2 del motor JIT, backlog | Recalcular el motor |
| `docs/MEMORY.md` | ADR-014, ADR-015, §9 sesión | §2, §7 y §9 de cada sesión |
| `CLAUDE.md` §3 | — | Comandos E2E (Tarea 5) |
| `docs/tareas-a-realizar.md` | — | Pendientes de la Tarea 5 (ese archivo no está versionado) |
| `docs/tracking.csv` | Filas de esta sesión | Una fila por tarea |
