# Especificaciones Técnicas (tech-specs.md) — Ágora

Documento de referencia de la arquitectura de **Ágora**. Su objetivo es que cualquier desarrollador o agente IA pueda retomar el proyecto sin contexto previo.

**Estado:** especificación inicial (31/07/2026). Nada está implementado todavía; este documento describe el diseño acordado, no código existente. Las secciones que dependen de recursos aún no creados (IDs, ARNs, URLs) quedan marcadas como pendientes y se completan en `MEMORY.md` §5 a medida que se aprovisionan.

**Relación con los demás documentos:** el "por qué" de negocio de cada decisión está en `PRD.md` (se referencia por número de sección). Las reglas de seguridad obligatorias están en `CLAUDE.md` §5. Las decisiones registradas (ADRs) están en `MEMORY.md` §3.

---

## 1. Visión general de la arquitectura

Ágora es una aplicación Angular 22 con renderizado en servidor (SSR), desplegada íntegramente sobre AWS serverless y gestionada con Serverless Framework 4. Es el mismo patrón que Babel ya tiene probado en producción, con dos diferencias propias: una **superficie pública sin autenticación** considerablemente mayor (cartelera, compra, carga de comprobante, aprobación por enlace) y un **modelo transaccional con concurrencia real** sobre el aforo.

```
                              ┌──────────────────────────┐
                              │  Cliente (celular/web)   │
                              │  sin cuenta, público     │
                              └────────────┬─────────────┘
                                           │ HTTPS
                              ┌────────────▼─────────────┐
                              │  Equipo Le Tiende        │
                              │  Google Sign-In          │
                              └────────────┬─────────────┘
                                           │
                                  agora.letiende.co
                                           │
                              ┌────────────▼─────────────┐
                              │   API Gateway (HTTP API) │
                              │   + límite de tasa       │
                              └───┬──────────────────┬───┘
                                  │                  │
                     ┌────────────▼──────┐   ┌───────▼─────────────────────┐
                     │  Lambda  ssr      │   │  Lambdas de API             │
                     │  Angular SSR      │   │  (una por dominio, con rol  │
                     │  @angular/ssr +   │   │   IAM de mínimo privilegio) │
                     │  serverless-      │   │                             │
                     │  express          │   │  · eventos    · compras     │
                     └───────────────────┘   │  · comprobantes             │
                                             │  · aprobaciones             │
                                             │  · boletas (validación)     │
                                             │  · usuarios   · reportes    │
                                             └───┬────────────┬────────┬───┘
                                                 │            │        │
                    ┌────────────────────────────▼──┐  ┌──────▼─────┐  │
                    │  DynamoDB (on-demand)         │  │  S3        │  │
                    │  · agora-eventos              │  │ compro-    │  │
                    │  · agora-compras   (TTL)      │  │ bantes     │  │
                    │  · agora-boletas              │  │ (privado)  │  │
                    │  · agora-usuarios             │  │ activos    │  │
                    │  · agora-auditoria            │  │ (público   │  │
                    └───────────┬───────────────────┘  │  vía CDN)  │  │
                                │ Streams (TTL delete) └────────────┘  │
                    ┌───────────▼───────────────────┐                  │
                    │  Lambda  liberarReservas      │                  │
                    │  devuelve aforo de reservas   │                  │
                    │  vencidas                     │                  │
                    └───────────────────────────────┘                  │
                                                                       │
                    ┌──────────────────────────────────────────────────▼──┐
                    │  Servicios externos                                 │
                    │  · Firebase Auth (proyecto compartido Le Tiende)    │
                    │  · AWS SES  →  taquilla@letiende.co                 │
                    │  · AWS End User Messaging Social (WhatsApp) — v2    │
                    │  · Bold (pasarela de pagos) — v2                    │
                    │  · Google Calendar API — v2                         │
                    └─────────────────────────────────────────────────────┘
```

### 1.1 Principios de arquitectura

1. **La autorización vive en el backend, siempre.** Los guardias de Angular son experiencia de usuario. Ver `CLAUDE.md` §5 (A01).
2. **El aforo se modifica solo con escritura condicional.** Nunca leer-y-luego-escribir. Ver §5.4 y `CLAUDE.md` §5 (A04).
3. **Una Lambda por dominio, con su propio rol IAM de mínimo privilegio y su propio paquete** (`package: individually`), igual que Babel. Reduce el arranque en frío y limita el radio de daño de una falla.
4. **Todo lo público es hostil.** Los endpoints sin autenticación se diseñan asumiendo abuso: límite de tasa, validación de tamaño, cálculo de precios exclusivamente en servidor.
5. **Costo objetivo < US$1/mes, verificado, no supuesto.** DynamoDB `PAY_PER_REQUEST` sin excepción, sin NAT Gateway, sin `provisioned concurrency` salvo justificación explícita, `logRetentionInDays` siempre definido. Ver `CLAUDE.md` (sección "Costos de infraestructura") y `docs/advertencia-urgente-costos-aws.md` — incidente real de Babel, misma cuenta AWS: US$90,34 en un mes por DynamoDB `PROVISIONED` mal configurado.

---

## 2. Stack tecnológico completo

| Componente | Tecnología | Versión | Propósito | Documentación |
|---|---|---|---|---|
| Framework frontend | Angular | 22.x | SPA con SSR, standalone components, Signals | https://angular.dev |
| SSR | `@angular/ssr` | 22.x | Renderizado en servidor sobre Express 5 | https://angular.dev/guide/ssr |
| Suite UI | Angular Material | 22.x | Componentes complejos: tabla, calendario, file upload; tema Material 3 propio. MIT, sin condiciones — ver ADR-012 (reemplaza a PrimeNG, que pasó a licencia comercial) | https://material.angular.dev |
| CSS utility | Tailwind CSS | 4.x | Layout y utilidades; misma base que Babel/Comandante | https://tailwindcss.com |
| Runtime | Node.js | 24.x | Runtime de todas las Lambdas | https://nodejs.org |
| Lenguaje | TypeScript | ~6.0 | Estricto; `any` prohibido | https://typescriptlang.org |
| IaC / despliegue | Serverless Framework | 4.x | Definición y despliegue de toda la infraestructura | https://serverless.com/framework/docs |
| Adaptador Lambda | `@codegenie/serverless-express` | 5.x | Traduce eventos de API Gateway a Express (SSR) | https://github.com/CodeGenieApp/serverless-express |
| Base de datos | AWS DynamoDB | — | Almacenamiento principal, on-demand | https://docs.aws.amazon.com/dynamodb |
| SDK de datos | `@aws-sdk/lib-dynamodb` | 3.x | `DocumentClient`, expresiones parametrizadas | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3 |
| Archivos | AWS S3 | — | Comprobantes (privado) y activos de evento (vía CDN) | https://docs.aws.amazon.com/s3 |
| Autenticación | Firebase Authentication | SDK v12+ | Google Sign-In del equipo | https://firebase.google.com/docs/auth |
| Verificación de token | `firebase-admin` | 14.x | `verifyIdToken` en las Lambdas | https://firebase.google.com/docs/admin/setup |
| Correo | AWS SES | — | Envío desde `taquilla@letiende.co` | https://docs.aws.amazon.com/ses |
| Escaneo de QR | `@zxing/browser` | 0.2.x | Lectura de QR con la cámara en la puerta | https://github.com/zxing-js/browser |
| Generación de QR | `qrcode` (servidor) | latest | QR de boleta y de evento, en SVG y PNG | https://github.com/soldair/node-qrcode |
| Reportes XLSX | `xlsx` | 0.18.x | Exportación del panel; mismo paquete que Babel | https://sheetjs.com |
| Pruebas frontend | Angular test runner | 22.x | Pruebas unitarias de componentes y servicios | https://angular.dev/guide/testing |
| Pruebas backend | Vitest | 4.x | Pruebas unitarias de handlers y servicios | https://vitest.dev |
| Formato de código | Prettier | 3.x | Formato consistente | https://prettier.io |
| CI/CD | GitHub Actions | — | Build, test, deploy a staging y producción | https://docs.github.com/actions |
| Pasarela de pagos (v2) | Bold | — | Botón de pagos / API link de pagos | https://developers.bold.co |
| WhatsApp (v2) | AWS End User Messaging Social | — | Mensajería por WhatsApp Business | https://docs.aws.amazon.com/social-messaging |
| Calendario (v2) | Google Calendar API | v3 | Sincronización de eventos | https://developers.google.com/calendar |

---

## 3. Estructura del repositorio

```
agora/
├── CLAUDE.md                    # Directrices permanentes (stack, convenciones, OWASP, git flow)
├── README.md
├── angular.json
├── serverless.yml               # Definición de toda la infraestructura AWS
├── package.json
├── tsconfig.json                # Config base
├── tsconfig.app.json            # Frontend Angular
├── vitest.config.ts             # Pruebas del backend
├── .github/
│   └── workflows/
│       └── deploy.yml           # Build + test (PR) → staging (PR) → producción (push a main)
├── docs/
│   ├── PRD.md                   # Requisitos de producto
│   ├── tech-specs.md            # Este documento
│   ├── MEMORY.md                # Estado, ADRs, configuraciones vigentes, gotchas
│   ├── TODO.md                  # Motor JIT: exactamente 2 tareas atómicas
│   ├── DESIGN.md                # Sistema de diseño (se crea al implementar la UI)
│   ├── planteamiento-inicial.md # Documento fuente original del proyecto
│   ├── instrucciones-tracking.md# Reglas del registro de tiempos
│   └── tracking.csv             # Registro de tiempos de todas las tareas
├── public/                      # Activos estáticos (logotipos, favicon)
├── server/                      # Backend — código de las Lambdas de API
│   ├── tsconfig.json
│   └── api/
│       ├── handlers/            # Un archivo por endpoint/dominio
│       │   ├── salud.ts
│       │   ├── usuarios-me.ts
│       │   ├── eventos.ts
│       │   ├── eventos-publicos.ts
│       │   ├── compras.ts
│       │   ├── comprobantes.ts
│       │   ├── aprobaciones.ts
│       │   ├── boletas.ts
│       │   ├── reportes.ts
│       │   └── liberar-reservas.ts     # Consumidor de DynamoDB Streams
│       ├── lib/                 # Utilidades transversales
│       │   ├── verificar-token.ts      # verifyIdToken + resolución de rol
│       │   ├── resolver-permisos.ts    # Jerarquía de roles (fuente única)
│       │   ├── enlaces-magicos.ts      # Generación, hash y consumo de tokens
│       │   ├── firma-boletas.ts        # HMAC del código de boleta
│       │   ├── respuestas.ts           # Respuestas HTTP y errores sin fugas
│       │   └── validaciones.ts         # Validación de entrada (nombre, correo, archivo)
│       ├── services/            # Acceso a datos y servicios externos
│       │   ├── dynamodb.ts
│       │   ├── s3.ts
│       │   ├── aforo.ts                # Escrituras condicionales de sillas
│       │   ├── notificaciones.ts       # Interfaz de canal (correo hoy, WhatsApp v2)
│       │   ├── correo-ses.ts
│       │   ├── boleteria.ts            # Emisión de boletas y su QR
│       │   └── auditoria.ts            # Rastro append-only
│       └── modelos/             # Interfaces compartidas con el frontend
│           ├── evento.ts
│           ├── compra.ts
│           ├── boleta.ts
│           └── usuario.ts
└── src/                         # Frontend Angular
    ├── main.ts
    ├── main.server.ts
    ├── server.ts                # Entrada del SSR
    ├── styles.css               # Bloque @theme de Tailwind
    ├── material-theme.scss      # Tema Material 3 propio (mat.theme + overrides de marca)
    ├── environments/
    │   ├── environment.ts
    │   └── environment.production.ts
    └── app/
        ├── app.config.ts
        ├── app.routes.ts
        ├── core/                # Servicios singleton, guardias, interceptores
        │   ├── auth/
        │   ├── guardias/
        │   └── interceptores/
        ├── shared/              # Componentes, pipes y utilidades reutilizables
        │   ├── componentes/
        │   └── pipes/
        │       └── precio.pipe.ts
        └── features/            # Una carpeta por área funcional
            ├── cartelera/       # Público: lista de eventos
            ├── evento/          # Público: detalle, compra, comprobante
            ├── boleta/          # Público: vista de boleta digital
            ├── login/
            ├── admin/           # Eventos y usuarios (solo administrador)
            ├── aprobaciones/    # Revisión de comprobantes (productor)
            ├── puerta/          # Escaneo y validación (portero)
            └── panel/           # Panel de control del evento (productor)
```

**Path aliases** (`tsconfig.json`): `@modelos/*` → `server/api/modelos/*` (compartidos entre frontend y backend), `@core/*` → `src/app/core/*`, `@shared/*` → `src/app/shared/*`, `@features/*` → `src/app/features/*`.

---

## 4. Frontend / Cliente

### 4.1 Patrones

- **Componentes standalone** obligatorios; sin `NgModule`.
- **Signals** para todo el estado reactivo. `BehaviorSubject` solo si una API de terceros lo obliga.
- **Formularios reactivos** (`ReactiveFormsModule`) en todos los formularios; nada de `ngModel`.
- **`inject()`** en lugar de inyección por constructor.
- **Detección de cambios `OnPush`** por defecto en todos los componentes.
- **Carga diferida por ruta** (`loadComponent`): la cartelera pública no debe cargar el código del panel administrativo. Importa especialmente porque el cliente entra desde datos móviles.

### 4.2 Rutas

| Ruta | Componente | Acceso | Guardia |
|---|---|---|---|
| `/` | `CarteleraComponent` | Público | — |
| `/evento/:slug` | `DetalleEventoComponent` | Público | — |
| `/evento/:slug/comprar` | `ComprarComponent` | Público | — |
| `/compra/:token/comprobante` | `CargarComprobanteComponent` | Público con enlace mágico | Token válido y vigente |
| `/compra/:compraId/estado` | `EstadoCompraComponent` | Público | — |
| `/boleta/:codigo` | `BoletaDigitalComponent` | Público con código | Firma HMAC válida |
| `/aprobar/:token` | `AprobarCompraComponent` | Enlace mágico | Token válido, vigente y sin usar |
| `/login` | `LoginComponent` | Público | — |
| `/evento/:slug/puerta` | `PuertaComponent` | Equipo | `GuardiaAuth` + rol ≥ portero |
| `/evento/:slug/efectivo` | `VentaEfectivoComponent` | Equipo | `GuardiaAuth` + rol ≥ portero |
| `/evento/:slug/panel` | `PanelEventoComponent` | Equipo | `GuardiaAuth` + rol ≥ productor + asignado al evento |
| `/aprobaciones` | `ListaAprobacionesComponent` | Equipo | `GuardiaAuth` + rol ≥ productor |
| `/admin` | `AdminInicioComponent` | Equipo | `GuardiaAuth` + rol = administrador |
| `/mis-eventos/eventos` | `GestionEventosComponent` | Equipo | `GuardiaAuth` + rol = administrador |
| `/mis-eventos/eventos/:id` | `EditarEventoComponent` | Equipo | `GuardiaAuth` + rol = administrador |
| `/usuarios` | `GestionUsuariosComponent` | Equipo | `GuardiaAuth` + rol = administrador |

> Las guardias son **solo experiencia de usuario**. Cada endpoint reverifica el rol en el backend. Ver `CLAUDE.md` §5 (A01).

### 4.3 Modelos de datos (compartidos frontend/backend)

```ts
export type Rol = 'administrador' | 'productor' | 'portero';

export interface Usuario {
  email: string;              // Clave primaria
  nombre: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;           // ISO 8601 UTC
}

export type EstadoEvento = 'borrador' | 'publicado' | 'agotado' | 'finalizado' | 'cancelado';

export interface EtapaBoleteria {
  etapaId: string;
  nombre: string;             // "Preventa", "Taquilla"
  precio: number;             // COP entero; 0 = gratuito
  cierraEn: string;           // ISO 8601 UTC
  orden: number;
}

export type MedioPago = 'bold' | 'efectivo' | 'transferencia';

// v2 (roadmap #25) — vínculo hacia el canal real de venta de un evento con
// boletería externa. `valor` guarda solo la parte variable (sin el prefijo
// fijo de cada tipo); la URL completa se construye anteponiendo el prefijo.
export type TipoVinculo = 'whatsapp' | 'instagram' | 'web';

export interface VinculoExterno {
  tipo: TipoVinculo;
  valor: string;
}

export interface Evento {
  eventoId: string;           // Clave primaria (UUID)
  slug: string;               // Índice secundario global — URL pública
  nombre: string;
  descripcion: string;
  imagenKey?: string;         // Clave en S3 de activos
  logotipoKey?: string;       // Sin uso si `administradoPorLeTiende` es `false` — no hay boleta que lo lleve
  fechaHora: string;          // ISO 8601 UTC — se muestra en America/Bogota
  // v2 (roadmap #25) — `true` por defecto (retrocompatible con todo evento
  // existente). En `false`, Ágora no vende ni controla el aforo del evento:
  // los campos de boletería de abajo dejan de exigirse/mostrarse y en su
  // lugar aplica `vinculoExterno`.
  administradoPorLeTiende: boolean;
  vinculoExterno?: VinculoExterno;   // Solo si administradoPorLeTiende === false
  sillasTotales: number;
  sillasDisponibles: number;  // Solo se modifica con escritura condicional
  sillasReservadas: number;
  // v2 (roadmap #24) — puede ser `[]`: un evento sin etapas no cobra nada,
  // solo controla aforo. El cobro se activa al agregar la primera etapa.
  etapas: EtapaBoleteria[];
  maxBoletasPorCompra: number;
  mediosPago: MedioPago[];    // Sin etapas, solo admite 'efectivo'/'transferencia' — nunca 'bold'
  plazoComprobanteMinutos: number;   // Por defecto 10
  productores: string[];      // Correos; deben existir en agora-usuarios
  porteros: string[];         // Análogo a productores, opcional
  estado: EstadoEvento;
  googleCalendarEventId?: string;    // v2
  creadoEn: string;
  actualizadoEn: string;
}

export type EstadoCompra =
  | 'iniciada'              // Sillas reservadas, esperando acción del cliente
  | 'esperando_comprobante'
  | 'en_revision'           // Comprobante cargado, pendiente de aprobación
  | 'aprobada'              // Boletas emitidas
  | 'rechazada'
  | 'expirada';             // Venció el plazo; aforo devuelto

export interface Compra {
  compraId: string;           // Clave primaria (UUID)
  eventoId: string;           // Índice secundario global
  cliente: { nombre: string; telefono: string; email: string };
  cantidad: number;
  etapaId?: string;           // v2 (roadmap #24) — ausente si el evento no tiene etapas
  valorUnitario: number;      // Calculado en el backend, nunca recibido del cliente
  valorTotal: number;
  medioPago: MedioPago;
  estado: EstadoCompra;
  comprobanteKey?: string;    // Clave en S3 (bucket privado)
  tokenComprobanteHash?: string;
  tokenAprobacionHash?: string;
  expiraEn?: number;          // Epoch en segundos — atributo TTL de DynamoDB
  aprobadaPor?: string;       // Correo del productor que resolvió
  resueltaEn?: string;
  autorizacionDatos: { aceptadaEn: string; versionTexto: string };
  creadaEn: string;
}

export type EstadoBoleta = 'valida' | 'usada' | 'anulada';

export interface Boleta {
  boletaId: string;           // Clave primaria (UUID v4) — el código del QR
  eventoId: string;           // Índice secundario global
  compraId: string;
  numeroEnCompra: number;     // 1..n dentro de la compra
  etapaId?: string;           // v2 (roadmap #24) — ausente si el evento no tiene etapas
  valorUnitario: number;
  estado: EstadoBoleta;
  ingresoEn?: string;
  ingresoPor?: string;        // Correo del portero
  emitidaEn: string;
}
```

### 4.4 Estilos: Angular Material + Tailwind con tokens Le Tiende

Ágora combina Angular Material (componentes complejos: tabla, calendario, file upload) con Tailwind 4 (layout y utilidades). La identidad visual es la de Le Tiende, no la de Material — nunca se usa un tema prebuilt (Azure/Blue, Rose/Red, etc.) sin adaptar.

**Fuente de verdad de los tokens:** dos archivos paralelos, cada uno alimentando un sistema distinto:
- `src/styles.css` — bloque `@theme` de Tailwind (`--color-primary`, etc.), igual que en Babel. Alimenta las clases utilitarias (`bg-primary`, `text-neutral`, …).
- `src/material-theme.scss` — tema Material 3 (`@include mat.theme(...)`), que alimenta los componentes de Angular Material vía variables CSS `--mat-sys-*`.

| Token | Valor | Uso |
|---|---|---|
| `primary` | `#230C00` | Texto principal, fondo de botones primarios, bordes sutiles |
| `secondary` | `#E8630A` | Acentos, precios, enlaces |
| `tertiary` | `#00B7A3` | Mensajes de éxito, veredicto de boleta válida |
| `neutral` | `#FFE7B3` | Texto sobre fondo `primary` |
| `surface` | `#FFF8F1` | Fondo de página |
| `danger` | `#C0392B` | Errores, boleta inválida, acciones destructivas |

- **Tipografía:** Poppins para toda la interfaz (incluido `typography: Poppins` en `mat.theme()`). Angellya está reservada al logotipo SVG de marca y **no existe como archivo de fuente cargable** en ningún repo de Le Tiende — nunca se integra en desarrollo.
- **Angular Material** se configura con un **tema Material 3 propio**: la paleta tonal completa (`primary`, `secondary`, `tertiary`, `neutral`, `error`) se genera con el algoritmo oficial de Google (`@material/material-color-utilities`, el mismo que usa la Theme Builder de Angular) a partir de los hex de marca — no se escribe a mano. **El sistema M3 por defecto no usa el hex exacto de marca como `primary`:** en esquema claro mapea `primary` al tono 40 de la rampa generada (un tono medio, para contraste sobre fondo claro), no al hex más oscuro que Le Tiende usa como fondo de botón. Por eso, después de `mat.theme()`, se sobrescriben explícitamente `--mat-sys-primary`, `--mat-sys-on-primary`, `--mat-sys-secondary`, `--mat-sys-tertiary`/`--mat-sys-on-tertiary`, `--mat-sys-error`/`--mat-sys-on-error` y `--mat-sys-surface`/`--mat-sys-on-surface` a los hex exactos de la tabla de arriba. El resto de la rampa (hover, focus, disabled, elevación) sigue derivándose algorítmicamente, lo que da variación visual coherente sin tener que definir cada estado a mano.
- **Precios:** pipe `precio` con `Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })` → `$45.000`. No usar `CurrencyPipe`/`DecimalPipe` de Angular: obligan a registrar el locale `es-CO`, lo que complica el bundle SSR (hallazgo de Babel).
- **Patrones heredados de Babel** (ya probados en producción, ver su `docs/DESIGN.md`), para el HTML propio fuera de los componentes de Material: tarjetas `rounded-2xl bg-white shadow-[0_4px_16px_rgba(35,12,0,0.08)]`; botón primario `h-12 rounded-2xl bg-primary px-4 text-sm font-semibold tracking-wider text-neutral uppercase`; inputs `rounded-xl border border-primary/20 px-3 py-2 text-sm text-primary`; contenedor de página `min-h-screen bg-surface px-4 py-8` con `max-w-*` interno.
- **Pantalla de puerta:** es la única que se aparta del patrón general. Alto contraste, veredicto a pantalla completa con color de fondo inequívoco (`tertiary` = pasa, `danger` = no pasa), tipografía grande, un solo objetivo táctil. Debe ser legible en penumbra y a un brazo de distancia (`PRD.md` §8).

### 4.5 SEO y SSR

- Cada evento tiene su página indexable en `/evento/:slug`, renderizada en servidor con `title`, `description`, Open Graph y Twitter Card completos.
- **La vista previa de Open Graph es el canal de difusión.** El enlace se comparte por WhatsApp e Instagram; la imagen del evento debe verse correctamente en la tarjeta de vista previa. Es un requisito de producto, no un detalle técnico (`PRD.md` §8).
- Datos estructurados `schema.org/Event` en JSON-LD en cada página de evento.
- `sitemap.xml` generado dinámicamente con los eventos publicados; `robots.txt` que bloquea `/admin`, `/panel`, `/aprobar`, `/compra` y `/boleta`.
- Las rutas administrativas y las que usan enlaces mágicos **no se prerenderizan ni se indexan**.

---

## 5. Backend / APIs

### 5.1 Endpoints

Prefijo común `/api`. La columna "Quién llama" indica el nivel de autorización exigido **en el backend**.

| Método | Ruta | Quién llama | Descripción | Payload |
|---|---|---|---|---|
| GET | `/api/salud` | Público | Verificación de despliegue | — |
| GET | `/api/usuarios/me` | Autenticado | Verifica el ID Token y devuelve nombre y rol | — |
| GET | `/api/eventos-publicos` | Público | Cartelera: eventos publicados | — |
| GET | `/api/eventos-publicos/:slug` | Público | Detalle público del evento (sin datos de clientes) | — |
| POST | `/api/compras` | Público (con límite de tasa) | Inicia compra, **reserva sillas** y genera enlace de comprobante | `{ slug, cantidad, cliente, autorizacionDatos }` |
| GET | `/api/compras/:compraId/estado` | Público | Estado de la compra (sin datos sensibles) | — |
| POST | `/api/comprobantes/:token/url-carga` | Enlace mágico | Devuelve URL prefirmada de S3 para subir el comprobante | `{ tipoMime, tamano }` |
| POST | `/api/comprobantes/:token/confirmar` | Enlace mágico | Confirma la carga y pasa la compra a `en_revision` | — |
| GET | `/api/aprobaciones` | Productor | Compras pendientes de los eventos a su cargo | — |
| GET | `/api/aprobaciones/:token` | Enlace mágico | Datos de la compra + URL prefirmada del comprobante | — |
| POST | `/api/aprobaciones/:token/aprobar` | Enlace mágico | Aprueba (condicional), confirma aforo y **emite boletas** | — |
| POST | `/api/aprobaciones/:token/rechazar` | Enlace mágico | Rechaza, libera aforo y notifica al cliente | `{ motivo? }` |
| POST | `/api/ventas-efectivo` | Portero+ | Venta presencial: reserva, confirma y emite en una operación | `{ slug, cantidad, cliente, autorizacionDatos }` |
| GET | `/api/boletas/:codigo` | Público con firma | Datos de la boleta digital para mostrarla | — |
| POST | `/api/boletas/:codigo/validar` | Portero+ | **Valida en puerta** (transición condicional a `usada`) | `{ eventoId }` |
| GET | `/api/eventos` | Administrador | Lista completa de eventos | — |
| POST | `/api/eventos` | Administrador | Crea evento y genera su QR | `Evento` sin `eventoId` |
| PUT | `/api/eventos/:eventoId` | Administrador | Edita evento | `Evento` parcial |
| POST | `/api/eventos/:eventoId/activos/url-carga` | Administrador | URL prefirmada para imagen/logotipo | `{ tipo, tipoMime, tamano }` |
| GET | `/api/eventos/:eventoId/panel` | Productor del evento | Métricas del panel de control | — |
| GET | `/api/eventos/:eventoId/reportes` | Productor del evento | URL prefirmada del `.xlsx` (una fila por boleta, `PRD.md` §5.6, roadmap #21). `?formato=pdf` responde `501` explícito — sin librería ni diseño de PDF decidido, no implementado | `?formato=xlsx\|pdf` |
| GET | `/api/usuarios` | Administrador | Lista de usuarios | — |
| POST | `/api/usuarios` | Administrador | Crea usuario | `{ email, nombre, rol }` |
| PUT | `/api/usuarios/:email` | Administrador | Edita usuario | `{ nombre?, rol?, activo? }` |
| DELETE | `/api/usuarios/:email` | Administrador | Elimina usuario | — |
| POST | `/api/pagos/bold/webhook` | Bold (v2) | Notificación de pago, **con firma verificada y reconciliada** | Payload de Bold |

### 5.2 Tablas de DynamoDB

Nombradas `agora-{recurso}-{stage}`, siguiendo la convención de Babel. **Todas `BillingMode: PAY_PER_REQUEST`, sin excepción, sin `ProvisionedThroughput` en ninguna tabla ni GSI** — regla de mayor prioridad de `CLAUDE.md` (sección "Costos de infraestructura"), derivada de un incidente real de Babel (`docs/advertencia-urgente-costos-aws.md`): US$90,34 en un mes por capacidad `PROVISIONED` olvidada, con las tablas de producción vacías.

```yaml
AgoraUsuarios:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: agora-usuarios-${sls:stage}
    BillingMode: PAY_PER_REQUEST     # única línea de capacidad — nunca ProvisionedThroughput
    AttributeDefinitions: [...]
    KeySchema: [...]
```

| Tabla | Clave primaria | Índices secundarios | Notas |
|---|---|---|---|
| `agora-usuarios` | `email` (PK) | — | Fuente de verdad del rol en Ágora |
| `agora-eventos` | `eventoId` (PK) | GSI `slug-index` (PK `slug`); GSI `estado-fechaHora-index` | El contador de aforo vive aquí |
| `agora-compras` | `compraId` (PK) | GSI `eventoId-creadaEn-index`; GSI `tokenAprobacionHash-index` | **TTL en `expiraEn`**, con Streams activados |
| `agora-boletas` | `boletaId` (PK) | GSI `eventoId-estado-index`; GSI `compraId-index` | `boletaId` es el contenido del QR |
| `agora-auditoria` | `entidadId` (PK), `ocurridoEn` (SK) | — | Append-only. Nunca se actualiza ni se borra |

### 5.3 Funciones Lambda

Cada una con su propio rol IAM de mínimo privilegio y su propio paquete (`package: individually`), como en Babel.

| Función | Disparador | Tablas / recursos a los que accede |
|---|---|---|
| `ssr` | HTTP API (todo lo que no sea `/api/*`) | Ninguno directamente |
| `salud` | `GET /api/salud` | Ninguno |
| `usuariosMe` | `GET /api/usuarios/me` | `usuarios` (lectura) |
| `eventosPublicos` | Rutas públicas de evento | `eventos` (lectura) |
| `eventos` | CRUD administrativo | `eventos` (lectura/escritura), `usuarios` (lectura), S3 activos |
| `compras` | `POST /api/compras`, venta en efectivo | `compras`, `eventos` (condicional), `boletas`, `auditoria`, SES |
| `comprobantes` | Endpoints de comprobante | `compras`, S3 comprobantes (escritura) |
| `aprobaciones` | Endpoints de aprobación | `compras`, `eventos`, `boletas`, `auditoria`, S3 comprobantes (lectura), SES |
| `boletas` | Consulta y validación en puerta | `boletas` (condicional), `eventos` (lectura), `auditoria`, `usuarios` |
| `reportes` | Panel y exportación | `compras`, `boletas`, `eventos` (lectura), S3 activos |
| `liberarReservas` | **DynamoDB Streams** de `compras` (evento de borrado por TTL) | `eventos` (condicional), `compras`, `auditoria` |
| `boldWebhook` (v2) | `POST /api/pagos/bold/webhook` | `compras`, `eventos`, `boletas`, `auditoria` |

### 5.4 El ciclo de vida del aforo

Es el núcleo transaccional de Ágora y la fuente del 80% de los defectos posibles. Se documenta aquí de forma explícita para que ninguna implementación lo improvise.

```
sillasTotales = sillasDisponibles + sillasReservadas + sillasVendidas
```

**1 — Reservar (al iniciar la compra).** Una única `UpdateItem` sobre el ítem del evento:

```
UpdateExpression: SET sillasDisponibles = sillasDisponibles - :n,
                      sillasReservadas   = sillasReservadas   + :n
ConditionExpression: sillasDisponibles >= :n AND estado = 'publicado'
```

Si la condición falla → HTTP 409 con la cantidad realmente disponible. **Nunca** leer primero y decidir después.

**2 — Confirmar (al aprobar el comprobante o al vender en efectivo).** Las sillas pasan de reservadas a vendidas:

```
UpdateExpression: SET sillasReservadas = sillasReservadas - :n
ConditionExpression: sillasReservadas >= :n
```

La transición de estado de la compra usa `ConditionExpression: estado = 'en_revision'`, lo que además implementa el bloqueo entre varios productores (`PRD.md` CU-10). Si el aforo queda en cero, el evento pasa a `agotado`.

**3 — Liberar (al rechazar o al vencer el plazo).** Devuelve el aforo:

```
UpdateExpression: SET sillasDisponibles = sillasDisponibles + :n,
                      sillasReservadas   = sillasReservadas   - :n
ConditionExpression: sillasReservadas >= :n
```

La condición sobre `sillasReservadas` es lo que hace la operación segura ante un evento de Stream entregado dos veces: DynamoDB Streams garantiza entrega *at-least-once*, no *exactly-once*. Sin ella, un reintento infla el aforo por encima del real.

**4 — El TTL no es el reloj de negocio.** DynamoDB elimina los ítems vencidos "típicamente en 48 horas", no al segundo. Por lo tanto **toda lectura de una compra debe tratar como expirada aquella cuyo `expiraEn` ya pasó**, exista o no todavía el ítem. El TTL, con su consumidor de Streams, es solo el mecanismo de limpieza y devolución de aforo.

**5 — Reducción de aforo por edición.** Al editar un evento, `sillasTotales` no puede quedar por debajo de las sillas ya vendidas más las reservadas (`PRD.md` §9). Se valida con `ConditionExpression` (`sillasDisponibles + :delta >= 0` sobre el valor real al momento de escribir, más una guarda optimista sobre `sillasTotales` para no aplicar un delta calculado sobre una lectura obsoleta), nunca en el cliente. El nuevo `sillasTotales` se escribe como valor absoluto; `sillasDisponibles` se ajusta con aritmética relativa (`= sillasDisponibles + :delta`) para no perder una reserva/venta concurrente entre la lectura y la escritura.

**6 — Un evento vencido se trata como `finalizado`, aunque el campo `estado` no lo refleje todavía.** Igual que el TTL (punto 4), no hay ningún job programado que garantice el cambio de estado al segundo — hotfixes pre-producción, decisión explícita de no agregar infraestructura nueva (sin Lambda con cron/EventBridge). Un evento está vencido cuando **tanto** su `fechaHora` **como** el cierre de su última etapa (por `cierraEn`, no por `orden`) ya pasaron; sigue vigente mientras cualquiera de los dos no haya pasado (`lib/vigencia-evento.ts`, `estadoEfectivo()`/`haFinalizadoPorVigencia()`). Cada lectura pública (`eventos-publicos.ts`) y cada intento de venta (`compras.ts`, `ventas-efectivo.ts`) calculan la vigencia en tiempo real y tratan el evento como `finalizado` para efectos de visibilidad/venta sin esperar a que la base de datos lo confirme; esas mismas lecturas actualizan `estado` en DynamoDB como efecto secundario best-effort (`finalizarSiVencido()`, `ConditionExpression` sobre el estado leído, error de condición silenciado), sin bloquear la respuesta si la escritura falla. Un evento `cancelado` sigue siendo visible en la cartelera pública (con el banner correspondiente) mientras esté vigente bajo el mismo criterio — nunca habilita una venta, que sigue exigiendo `estado = 'publicado'` exacto.

### 5.5 Emisión y validación de boletas

**Emisión.** Al confirmarse una compra de `n` boletas se crean `n` ítems en `agora-boletas`, cada uno con su propio `boletaId` (UUID v4). El QR codifica la URL `https://agora.letiende.co/boleta/{boletaId}.{firma}`, donde `firma` es un HMAC-SHA256 truncado del `boletaId` con `SECRETO_FIRMA_BOLETAS`. Esto permite rechazar una boleta inventada sin consultar la base de datos y, sobre todo, hace que el código no sea adivinable (`CLAUDE.md` §5, A02).

**Validación en puerta.** Una sola operación condicional:

```
UpdateExpression: SET estado = 'usada', ingresoEn = :ahora, ingresoPor = :correo
ConditionExpression: estado = 'valida' AND eventoId = :eventoId
```

La respuesta al portero debe distinguir cuatro veredictos, nunca un error genérico (`PRD.md` §5.5): `VALIDA`, `YA_USADA` (con `ingresoEn`), `NO_EXISTE` y `OTRO_EVENTO`. La distinción no es cosmética: es lo que le permite al portero decidir de pie, con una fila esperando.

### 5.6 Notificaciones

`services/notificaciones.ts` expone una interfaz de canal y el resto del código **nunca llama a SES directamente**:

```ts
export interface CanalNotificacion {
  enviar(destino: Destinatario, plantilla: Plantilla, datos: unknown): Promise<void>;
}
```

En v1 hay una sola implementación (`CanalCorreoSes`). En v2 se agrega `CanalWhatsApp` y se despachan ambos en paralelo, **sin tocar los flujos de compra ni de aprobación**. Esta indirección es la razón por la que diferir WhatsApp no genera deuda técnica (`PRD.md` §9).

Plantillas de v1: enlace para cargar comprobante (cliente), aviso de comprobante por revisar (productor), boletas emitidas (cliente), compra rechazada (cliente), reserva expirada (cliente).

---

## 6. Servicios externos

| Servicio | Estado | Uso actual (v1) | Uso futuro |
|---|---|---|---|
| Firebase Authentication | ⬜ Por configurar | Google Sign-In del equipo. **Proyecto compartido con Comandante y Babel** | — |
| AWS SES | ⬜ Por verificar remitente | Todos los correos, desde `taquilla@letiende.co` | — |
| AWS S3 | ⬜ Por crear | Comprobantes (privado) y activos de evento | — |
| Bold | 🟡 Backend integrado, verificado en staging (PR #50, sin fusionar) | — | v2: pago automático, webhook firmado y reconciliado — falta el botón (frontend) |
| AWS End User Messaging Social | ⬜ No integrado | — | v2: WhatsApp. Requiere WABA aprobada por Meta |
| Google Calendar API | ⬜ No integrado | — | v2: sincronización con `letiende.co@gmail.com` |
| `api.letiende.co` | ⬜ Sin uso previsto | — | API compartida del ecosistema; Ágora no la consume hoy |

**Nota sobre SES:** la cuenta AWS de Le Tiende **está fuera del sandbox** (confirmado el 31/07/2026), así que se puede enviar a cualquier destinatario sin verificarlo previamente. Lo que sí queda pendiente es verificar la identidad del remitente y asegurar la entregabilidad: sin SPF (`include:amazonses.com`), DKIM y DMARC correctamente configurados en `letiende.co`, las boletas tienen alta probabilidad de caer en spam — y una boleta en spam es un cliente que no puede entrar al teatro. Ver `docs/tareas-a-realizar.md` §5.

---

## 7. Infraestructura

### 7.1 Diagrama de despliegue

```
                Internet
                    │
         agora.letiende.co (DNS)
                    │
        ┌───────────▼────────────┐
        │  CloudFront (opcional  │   Sirve activos estáticos de S3 y
        │  en v1, requerido para │   cachea el SSR. Requerido para el
        │  dominio propio)       │   dominio personalizado con TLS.
        └───────────┬────────────┘
                    │
        ┌───────────▼────────────┐
        │  API Gateway HTTP API  │
        │  · CORS por origen     │
        │  · límite de tasa      │
        └───┬────────────────┬───┘
            │                │
    ┌───────▼──────┐  ┌──────▼───────────────────┐
    │ Lambda  ssr  │  │ Lambdas de API (11)      │
    └──────────────┘  └──┬────────────┬──────┬───┘
                         │            │      │
                 ┌───────▼───┐  ┌─────▼──┐ ┌─▼──────┐
                 │ DynamoDB  │  │  S3    │ │  SES   │
                 │ 5 tablas  │  │2 bucket│ │        │
                 └─────┬─────┘  └────────┘ └────────┘
                       │ Streams
                 ┌─────▼──────────────┐
                 │ Lambda             │
                 │ liberarReservas    │
                 └────────────────────┘
```

**Región:** `us-east-1` (misma que Babel).
**Sin VPC:** ninguna Lambda necesita red privada. Evita el costo del NAT Gateway y los arranques en frío de ENI.

### 7.2 Entornos

Dos entornos, ambos sobre la misma cuenta AWS, separados por el sufijo de *stage* en todos los recursos. **No hay una rama por entorno:** el entorno lo determina el evento de CI, igual que en Babel.

| Stage | URL | Se despliega desde | Variables | Comando |
|---|---|---|---|---|
| `staging` | Endpoint de API Gateway (sin dominio propio) | Cada Pull Request hacia `main` | Secretos de staging en GitHub Environments | `npx serverless deploy --stage staging` |
| `production` | `https://agora.letiende.co` | Cada push a `main` (merge de PR) | Secretos de producción | `npx serverless deploy --stage production` |

**Reglas de concurrencia en GitHub Actions** (gotcha ya sufrido en Babel, `CLAUDE.md` §7):
- Grupo `desplegar-staging` con `cancel-in-progress: true` — solo el push más reciente del PR queda desplegado.
- Grupo `desplegar-produccion` con `cancel-in-progress: false` — el deploy en curso termina y el siguiente espera turno, para no chocar contra un stack de CloudFormation en `UPDATE_IN_PROGRESS`.

**Flujo de CI/CD** (`.github/workflows/deploy.yml`):

```
Pull Request → main
   ├── npm ci
   ├── build de producción (Angular SSR)
   ├── build de TypeScript de las Lambdas
   ├── pruebas frontend + pruebas backend
   ├── serverless package --stage staging   (verifica sintaxis de infra)
   ├── serverless deploy --stage staging
   ├── smoke test: GET /api/salud → 200
   └── comenta la URL de staging en el PR

Push a main (merge del PR)
   ├── npm ci
   ├── build de producción + build de Lambdas
   └── serverless deploy --stage production
```

### 7.3 Costos y presupuestos

**Objetivo: < US$1/mes.** Regla obligatoria en `CLAUDE.md` (sección "Costos de infraestructura"), motivada por un incidente real de Babel (`docs/advertencia-urgente-costos-aws.md`): US$90,34 en un mes por DynamoDB `PROVISIONED` mal configurado, sobre un objetivo de costo $0.

**Etiquetado obligatorio.** La cuenta AWS es compartida con Babel y Comandante; sin etiquetas, Cost Explorer no puede separar el gasto de cada app. Todo `serverless.yml` de Ágora declara:

```yaml
provider:
  stackTags:
    Proyecto: agora
    Stage: ${sls:stage}
  tags:
    Proyecto: agora
    Stage: ${sls:stage}
```

**Presupuestos.** Ya existen dos alarmas a nivel de cuenta (verificadas el 01/08/2026, ver `docs/MEMORY.md` §5): `Costo diario` (US$4, umbrales 80%/100%) y `Costos promedio` (US$10/mes, umbrales 85%/100%/FORECASTED), ambas con notificación por email confirmada. Cubren el ecosistema completo, no solo Ágora — un desvío pequeño de Ágora podría no cruzar esos umbrales. Antes de que Ágora tenga tráfico real, crear un presupuesto adicional filtrado por la etiqueta `Proyecto: agora` (`aws budgets create-budget` con `CostFilters: {TagKeyValue: ["user:Proyecto$agora"]}`), con umbral ~US$1.

**Verificación post-despliegue obligatoria** (no confiar en que el IaC hizo lo que dice):

```bash
# Cada tabla debe decir PAY_PER_REQUEST
aws dynamodb list-tables --region us-east-1 --query 'TableNames[?starts_with(@,`agora-`)]' --output text | tr '\t' '\n' | \
while read t; do
  aws dynamodb describe-table --table-name "$t" --region us-east-1 \
    --query "Table.[TableName,BillingModeSummary.BillingMode]" --output text
done
```

Repetir esta verificación **48 horas** después del primer despliegue, revisando el costo diario real por servicio (`aws ce get-cost-and-usage`). Un costo plano e idéntico día tras día es la firma de capacidad aprovisionada olvidada.

---

## 8. Autenticación y seguridad

### 8.1 Autenticación del equipo

Firebase Authentication con Google Sign-In, sobre el **proyecto Firebase compartido de Le Tiende** (el mismo de Comandante y Babel). El equipo usa una sola identidad de Google para las tres aplicaciones.

**La identidad es compartida; la autorización no.** El flujo completo:

1. El usuario inicia sesión con Google en el cliente; Firebase devuelve un ID Token.
2. El cliente envía ese token en `Authorization: Bearer <token>` en cada llamada a `/api/*`.
3. La Lambda lo verifica con `firebase-admin` (`verifyIdToken`, que valida firma, expiración y revocación).
4. La Lambda consulta `agora-usuarios` **por el correo del token** para resolver el rol.
5. Si el correo no existe en `agora-usuarios` o `activo = false`, la respuesta es 403 — sin importar que ese usuario sea administrador en Babel o en Comandante.

Ágora usa su **propia cuenta de servicio de Firebase** (`FIREBASE_SERVICE_ACCOUNT_AGORA`), nunca la de Babel ni la de Comandante, para poder rotar o revocar credenciales de una app sin afectar a las otras (`CLAUDE.md` §5).

### 8.2 Acceso sin sesión: enlaces mágicos

Ágora otorga capacidades reales a personas sin sesión: cargar un comprobante (cliente) y aprobar una compra (productor, desde su correo). El mecanismo es un token con cuatro propiedades no negociables:

1. **Entropía ≥ 128 bits** (`crypto.randomUUID()` o `randomBytes(32)`).
2. **Almacenado hasheado** (SHA-256) en DynamoDB, nunca en claro.
3. **Expiración explícita**: el de comprobante vence con el plazo del evento; el de aprobación, a las 24 horas.
4. **Un solo uso**, consumido con escritura condicional.

Un token de aprobación otorga la capacidad de aprobar **esa compra específica** y nada más. No es una sesión ni sustituye al inicio de sesión: la interfaz completa de aprobaciones (`/aprobaciones`) sí exige autenticación.

### 8.3 Superficie pública

| Endpoint | Protección |
|---|---|
| `GET /api/eventos-publicos*` | Solo lectura, sin datos personales. CORS abierto |
| `POST /api/compras` | Límite de tasa por IP, validación de tamaño, precio calculado en servidor, CORS restringido al origen de la app |
| `GET /api/boletas/:codigo` | Firma HMAC obligatoria; devuelve solo lo necesario para mostrar la boleta |
| `POST /api/comprobantes/*` | Token de un solo uso; URL prefirmada de S3 con tipo MIME y tamaño acotados |

### 8.4 Reglas de seguridad obligatorias

El catálogo completo —A01, A02, A03, A04, A05, A07, A08, A09, A10, Habeas Data y la tabla de prohibiciones absolutas— está en **`CLAUDE.md` §5**. Es la fuente de verdad y de lectura obligatoria antes de escribir código de backend.

---

## 9. Gestión de secretos

Ningún secreto vive en el repositorio. Todos se inyectan como variables de entorno desde GitHub Actions Secrets, con valor por defecto `''` en `serverless.yml` para que su ausencia no rompa el despliegue (patrón de Babel).

| Variable | Propósito | Contexto |
|---|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciales de despliegue — usuario AWS **compartido** con Babel y Comandante, no dedicado a Ágora (ADR-009 en `MEMORY.md`) | GitHub Actions |
| `SERVERLESS_LICENSE_KEY` | Licencia de Serverless Framework 4 en CI sin login interactivo | GitHub Actions |
| `FIREBASE_SERVICE_ACCOUNT_AGORA` | Cuenta de servicio para `verifyIdToken` en las Lambdas | Lambdas |
| `SECRETO_FIRMA_BOLETAS` | Llave HMAC del código de boleta | Lambdas |
| `SECRETO_ENLACES_MAGICOS` | Llave de derivación/hash de tokens de enlace | Lambdas |
| `SES_REMITENTE` | `taquilla@letiende.co` | Lambdas |
| `URL_BASE_APP` | URL pública del stage, para construir enlaces en los correos | Lambdas |
| `BOLD_LLAVE_IDENTIDAD` (v2) | Llave de identidad de Bold | Lambdas |
| `BOLD_LLAVE_SECRETA` (v2) | Verificación de firma del webhook de Bold | Lambdas |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` (v2) | Sincronización con el calendario de Le Tiende | Lambdas |
| `WHATSAPP_PHONE_NUMBER_ID` (v2) | Identificador del número de WhatsApp Business | Lambdas |

La configuración pública del SDK cliente de Firebase (`src/environments/`) **no es sensible** y puede vivir en el repositorio.

---

## 10. Convenciones de código y git flow

Definidas en **`CLAUDE.md` §4** (idioma del código en español, Signals, standalone, TypeScript estricto, formato de precios, identidad visual) y **`CLAUDE.md` §6** (mapa de ramas, protocolo obligatorio de PR, prohibiciones absolutas de Git).

Resumen operativo: se trabaja siempre en una rama `feature/*`, `fix/*`, `docs/*`, `hotfix/*` o `refactor/*` creada desde `main`; el agente IA **nunca** hace commit ni push a `main` ni fusiona un PR.

**Registro de tiempos:** toda tarea —de planeación o de ejecución, de humano o de IA— se registra como una fila en `docs/tracking.csv`, según `docs/instrucciones-tracking.md`. Es obligatorio y no opcional.

---

## 11. Roadmap técnico

Orden de implementación derivado de `PRD.md` §6, con las dependencias técnicas explícitas.

**Ajustes pre-producción (12/08/2026, previo a UAT):** ronda de endurecimiento sobre el v1 ya construido, fuera de la numeración de este roadmap (no son funcionalidades nuevas, son correcciones de alcance y presentación sobre piezas ya numeradas abajo — principalmente #6 CRUD de eventos, #9 Compra y reserva, #14 Venta en efectivo, #13 Validación en puerta y #18 Menú de navegación). Desglose técnico completo, con archivos reales y decisiones de diseño, en `docs/plan-pre-produccion.md`. Cambios de arquitectura relevantes que introduce: campo `porteros: string[]` nuevo en `agora-eventos` (análogo a `productores`), generalización de `tieneAccesoAlEvento()` (`server/api/lib/autorizacion.ts`) para resolver pertenencia también por rol `portero`, y reestructuración de `SECCIONES_NAVEGACION`/`app.routes.ts` a un modelo de navegación de dos niveles con rutas anidadas reales.

| # | Pieza | Archivos principales a crear | Depende de |
|---|---|---|---|
| 1 | Andamiaje del proyecto | `package.json`, `angular.json`, `tsconfig*.json`, `src/`, `.gitignore` | — |
| 2 | Infraestructura base y CI | `serverless.yml`, `.github/workflows/deploy.yml`, `server/api/handlers/salud.ts` | 1 |
| 3 | Tema visual Le Tiende | `src/styles.css`, `src/material-theme.scss`, `shared/pipes/precio.pipe.ts` | 1 |
| 4 | Autenticación y roles | `core/auth/`, `core/guardias/`, `server/api/lib/verificar-token.ts`, `resolver-permisos.ts`, tabla `agora-usuarios` | 2 |
| 5 | Gestión de usuarios | `features/admin/gestion-usuarios/`, `server/api/handlers/usuarios.ts` | 4 |
| 6 | CRUD de eventos | `features/admin/gestion-eventos/`, `server/api/handlers/eventos.ts`, tabla `agora-eventos`, S3 activos | 4 |
| 7 | Cartelera y página de evento | `features/cartelera/`, `features/evento/`, `handlers/eventos-publicos.ts`, SEO/JSON-LD | 6 |
| 8 | Motor de aforo | `server/api/services/aforo.ts`, tabla `agora-compras` con TTL y Streams, `handlers/liberar-reservas.ts` | 6 |
| 9 | Compra y reserva | `features/evento/comprar/`, `handlers/compras.ts`, `services/notificaciones.ts`, `correo-ses.ts` | 8 |
| 10 | Carga de comprobante | `features/evento/comprobante/`, `handlers/comprobantes.ts`, `lib/enlaces-magicos.ts`, S3 comprobantes | 9 |
| 11 | Aprobación del productor | `features/aprobaciones/`, `handlers/aprobaciones.ts` | 10 |
| 12 | Emisión de boletas | `services/boleteria.ts`, `lib/firma-boletas.ts`, tabla `agora-boletas`, `features/boleta/` | 11 |
| 13 | Validación en puerta | `features/puerta/`, `handlers/boletas.ts` (`@zxing/browser`) | 12 |
| 14 | Venta en efectivo | `features/evento/venta-efectivo/` | 12 |
| 15 | QR del evento para afiches | Generación SVG/PNG en `handlers/eventos.ts` | 6 |
| 16 | Panel de control básico | `features/panel/`, `handlers/reportes.ts` | 13 |
| 17 | Dominio personalizado | CloudFront + certificado ACM en `serverless.yml`, `NG_ALLOWED_HOSTS` | 2 |
| 18 | Menú de navegación para usuarios autenticados | `shared/navegacion/secciones-navegacion.ts`, `shared/navegacion/barra-navegacion.component.ts`, `core/guardias/guardia-invitado.ts` | 4 |
| 19 | **v2** — Bold | `handlers/bold-webhook.ts`, `services/bold.ts` | 12 |
| 20 | **v2** — WhatsApp | `services/canal-whatsapp.ts` | 9 |
| 21 | **v2** — Exportación XLSX/PDF | Ampliación de `handlers/reportes.ts` | 16 |
| 22 | **v2** — Google Calendar | `services/google-calendar.ts` | 6 |
| 23 | **v2** — Etapas de boletería con cierre automático por fecha (interfaz pública) | `shared/utilidades/etapa-vigente.ts` (nuevo, `etapaVigenteParaMostrar` centralizada), ampliación de `features/evento/detalle-evento.component.ts`/`.html`; `features/evento/comprar/comprar.component.ts` y `features/evento/venta-efectivo/venta-efectivo.component.ts` migrados a consumirla | 9, 14 |
| 24 | **v2** — Boletería opcional (aforo sin cobro) | `server/api/handlers/eventos.ts` (`normalizarEtapas`/`normalizarMediosPago` sin mínimo de etapas, rechazo de `bold` sin etapas), `server/api/handlers/compras.ts` (generaliza el camino hoy rechazado en líneas 192-197 para compras sin comprobante ni aprobación), `server/api/lib/vigencia-evento.ts` (finalización solo por `fechaHora` sin etapas), `features/evento/detalle-evento.component.ts`/`.html` (texto "Adquirir boletas"), `features/admin/gestion-eventos/editar-evento.component.ts`/`.html` (`FormArray` de etapas inicia vacío, checkbox `bold` deshabilitado sin etapas) | 9, 14, 23 |
| 25 | **v2** — Eventos con boletería externa | `core/models/evento.model.ts` (`administradoPorLeTiende`, `TipoVinculo`, `VinculoExterno`), `server/api/handlers/eventos.ts` (`normalizarVinculoExterno`), `server/api/handlers/eventos-publicos.ts` (`aVistaPublica` expone `administradoPorLeTiende`/`vinculoExterno`), `features/admin/gestion-eventos/editar-evento.component.ts`/`.html` (`mat-slide-toggle`, sección "Más información"), `features/evento/detalle-evento.component.ts`/`.html` (bloque "MÁS INFORMACIÓN:" con ícono + enlace) | 6, 7 |
