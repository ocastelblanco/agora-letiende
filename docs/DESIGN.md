# DESIGN.md — Sistema de diseño de Ágora

Este documento es la fuente de verdad visual de Ágora: colores, tipografía, componentes y patrones de página. A diferencia del `DESIGN.md` de Babel (que documenta retrospectivamente componentes ya construidos), **el de Ágora es prescriptivo por ahora**: todavía no existen páginas de feature más allá de la de verificación del andamiaje (Tarea 1 original de `TODO.md`). Este documento establece las clases exactas que las páginas futuras deben usar, copiadas/adaptadas de los patrones ya probados en producción de Babel.

**Cuando se construyan páginas reales** (backlog #2 en adelante de `TODO.md`), este documento se actualiza para reflejar desvíos reales frente a lo aquí prescrito — igual que ya hace el de Babel.

Fuente de los valores: `CLAUDE.md` §4, `docs/tech-specs.md` §4.4, ADR-012 en `docs/MEMORY.md`.

---

## 1. Colores

Paleta de marca Le Tiende, heredada de Comandante y Babel. Estos hex son la fuente de verdad; no se inventan variantes.

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#230C00` | Texto principal, fondo de botones primarios, bordes sutiles |
| `secondary` | `#E8630A` | Acentos, precios, enlaces |
| `tertiary` | `#00B7A3` | Mensajes de éxito, veredicto de boleta válida |
| `neutral` | `#FFE7B3` | Texto sobre fondo `primary` |
| `surface` | `#FFF8F1` | Fondo de página |
| `danger` | `#C0392B` | Errores, boleta inválida, acciones destructivas |

**Dos sistemas paralelos, un solo origen de valores:**

- `src/styles.css` — bloque `@theme` de Tailwind (`--color-primary`, etc.), alimenta las clases utilitarias (`bg-primary`, `text-neutral`, …) para el HTML propio.
- `src/material-theme.scss` — tema Material 3 (`@include mat.theme(...)`) que alimenta los componentes de Angular Material vía variables CSS `--mat-sys-*`. **Ya implementado** (ADR-012): paleta tonal completa generada con `@material/material-color-utilities` a partir de `#230C00` (primary) y `#00B7A3` (tertiary), con overrides explícitos de `--mat-sys-primary`, `--mat-sys-on-primary`, `--mat-sys-secondary`, `--mat-sys-tertiary`/`--mat-sys-on-tertiary`, `--mat-sys-error`/`--mat-sys-on-error` y `--mat-sys-surface`/`--mat-sys-on-surface` a los hex exactos de la tabla de arriba — necesarios porque el esquema claro de M3 mapea `primary` al tono 40 de la rampa generada (un tono medio), no al hex más oscuro de marca.

No se usa nunca un tema prebuilt de Angular Material (Azure/Blue, Rose/Red, etc.) sin adaptar.

---

## 2. Tipografía

**Poppins** para toda la interfaz, cargada desde Google Fonts en `src/index.html` e incluida como `typography: Poppins` en `mat.theme()`.

Angellya está reservada al logotipo SVG de marca (`public/logo_negro_sin_fondo.svg`, `public/logo_blanco_sin_fondo.svg`) y **no existe como archivo de fuente cargable** en ningún repo de Le Tiende — nunca se integra en desarrollo.

---

## 3. Contenedor de página

Patrón heredado de Babel, ya probado en producción:

```html
<div class="min-h-screen bg-surface px-4 py-8">
  <div class="mx-auto max-w-md">
    <!-- contenido -->
  </div>
</div>
```

`max-w-*` interno según el tipo de pantalla:

| Tipo de pantalla | Clase | Ejemplos |
|---|---|---|
| Flujo del cliente (celular) | `max-w-md` | Cartelera, detalle de evento, compra, comprobante, boleta |
| Formularios de equipo (celular/tableta) | `max-w-lg` | Login, carga de comprobante, aprobación |
| Paneles de administración (escritorio) | `max-w-4xl` a `max-w-6xl` | CRUD de eventos, gestión de usuarios, panel de control |
| Pantalla de puerta | Sin `max-w-*` — ocupa el ancho completo | Validación de QR |

---

## 4. Tarjetas

```html
<div class="rounded-2xl bg-white shadow-[0_4px_16px_rgba(35,12,0,0.08)] p-4">
  <!-- contenido -->
</div>
```

Mismo valor exacto que Babel: sombra sutil con el `primary` de marca como base del color de sombra (`rgba(35,12,0,0.08)` = `#230C00` al 8% de opacidad), no un gris genérico.

---

## 5. Botones

Botón primario (HTML propio, fuera de Angular Material):

```html
<button class="h-12 rounded-2xl bg-primary px-4 text-sm font-semibold tracking-wider text-neutral uppercase">
  Comprar boletas
</button>
```

Variantes:

| Variante | Clases | Uso |
|---|---|---|
| Primario | `h-12 rounded-2xl bg-primary px-4 text-sm font-semibold tracking-wider text-neutral uppercase` | Acción principal de la pantalla (comprar, aprobar, guardar) |
| Secundario / outline | `h-12 rounded-2xl border border-primary/20 px-4 text-sm font-semibold tracking-wider text-primary uppercase` | Acción alternativa (cancelar, volver, "ver más") |
| Peligro | `h-12 rounded-2xl bg-danger px-4 text-sm font-semibold tracking-wider text-white uppercase` | Rechazar comprobante, eliminar evento/usuario |
| Grande (pantalla de puerta) | `h-16 rounded-2xl px-6 text-lg font-bold tracking-wider uppercase` combinado con la variante de color que aplique | Único botón táctil de `PuertaComponent` |
| Pequeño (dentro de tabla/lista) | `h-9 rounded-xl px-3 text-xs font-semibold tracking-wider uppercase` combinado con la variante de color que aplique | Acciones inline en tablas de Angular Material (editar, reenviar boleta) |

Cuando el botón vive dentro de un componente de Angular Material (p. ej. una fila de `mat-table`), se usa `matButton` con los tokens de marca ya mapeados (`--mat-sys-primary`, etc.) en vez de reconstruir las clases de Tailwind a mano — evita que un botón de Material y uno de HTML propio se vean inconsistentes en el mismo panel.

---

## 6. Inputs

```html
<input class="rounded-xl border border-primary/20 px-3 py-2 text-sm text-primary" />
```

Mismo valor exacto que Babel. Los formularios reactivos (`ReactiveFormsModule`, `CLAUDE.md` §4) envuelven el input con un mensaje de error debajo, en `text-danger text-xs` cuando el control es inválido y ha sido tocado.

---

## 7. Angular Material vs. HTML propio

Regla general: **Angular Material para componentes complejos con estado/interacción no trivial; HTML propio + Tailwind para todo lo demás** (la mayoría de la interfaz).

| Se resuelve con Angular Material | Se resuelve con HTML propio + Tailwind |
|---|---|
| Tabla del panel de control (`mat-table` con sorting/paginación) | Tarjetas de evento en la cartelera |
| Selector de fecha/hora al crear o editar un evento (`mat-datepicker`) | Formulario de compra (nombre, teléfono, correo, cantidad) |
| Carga de archivo del comprobante (`mat-form-field` + input de archivo, o un componente de upload con progreso) | Vista de boleta digital con QR |
| Menús desplegables de rol/estado (`mat-select`) | Pantalla de puerta (veredicto a pantalla completa) |
| Notificaciones tipo toast de acciones administrativas (`MatSnackBar`) | Botones, tarjetas, inputs listados arriba |
| Diálogos de confirmación destructiva (`MatDialog`: "¿Eliminar este evento?") | Layout de página, navegación, encabezados |

Todo componente de Angular Material usado se apoya en los tokens `--mat-sys-*` ya definidos en `src/material-theme.scss` — nunca se le pasa un color hardcodeado por fuera del tema.

---

## 8. Patrón especial: pantalla de puerta

`PuertaComponent` (`tech-specs.md` §4.2, §4.4) es la única pantalla que se aparta deliberadamente del patrón general de arriba. La justificación de producto: la usa el portero de pie, con una fila de gente esperando, muchas veces en penumbra y a un brazo de distancia de la pantalla (`PRD.md` §8) — no hay margen para ambigüedad visual.

Reglas de esta pantalla, y solo de esta pantalla:

- **Alto contraste.** Nada de tonos intermedios ni transparencias sutiles.
- **Veredicto a pantalla completa.** Al escanear un QR, el fondo entero de la pantalla cambia de color según el resultado — no un mensaje pequeño ni un ícono aislado:
  - `bg-tertiary` (`#00B7A3`) = boleta válida, pasa.
  - `bg-danger` (`#C0392B`) = boleta inválida, no pasa — cubre los tres casos de `tech-specs.md` §5.5 (`YA_USADA`, `NO_EXISTE`, `OTRO_EVENTO`), cada uno con su propio texto explicativo pero el mismo color de alarma.
- **Tipografía grande.** El veredicto (`VÁLIDA` / `NO VÁLIDA`) se renderiza en un tamaño de encabezado grande (`text-5xl` o mayor), legible de un vistazo sin acercarse.
- **Un solo objetivo táctil.** La pantalla no compite por atención con navegación, menús ni botones secundarios mientras se muestra un veredicto — un único botón grande ("Siguiente" o "Escanear otra") para continuar.
- **Nunca reutiliza el contenedor de página estándar** (`min-h-screen bg-surface px-4 py-8`) — el fondo de color *es* el contenido, no vive dentro de una tarjeta.

Ejemplo de estructura (veredicto positivo):

```html
<div class="flex min-h-screen flex-col items-center justify-center gap-6 bg-tertiary p-6 text-center text-white">
  <span class="text-6xl font-bold uppercase tracking-wider">Válida</span>
  <p class="text-lg">Boleta #1234 — Preventa</p>
  <button class="h-16 rounded-2xl border border-white/40 px-6 text-lg font-bold tracking-wider uppercase">
    Escanear otra
  </button>
</div>
```

---

## 9. Íconos y activos de marca

Disponibles en `public/` (copiados desde `~/Documents/LeTiende/letiende.co/babel/public`, mismo activo de marca en todo el ecosistema Le Tiende):

| Archivo | Uso |
|---|---|
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | Ícono de pestaña del navegador |
| `apple-touch-icon.png` | Ícono al agregar Ágora a la pantalla de inicio en iOS |
| `icon-192.png`, `icon-512.png` | Íconos de PWA, referenciados desde `manifest.webmanifest` |
| `logo_negro_sin_fondo.svg` | Logotipo Le Tiende para fondos claros (`surface`, blanco) |
| `logo_blanco_sin_fondo.svg` | Logotipo Le Tiende para fondos oscuros (`primary`) |

`src/index.html` referencia el favicon, el apple-touch-icon y `manifest.webmanifest`; `meta[name=theme-color]` está fijado a `#230C00` (`primary`).
