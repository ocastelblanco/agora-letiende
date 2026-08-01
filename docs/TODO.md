# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (31/07/2026):** el proyecto no tiene código. No hay gaps de seguridad activos en producción (no hay producción), así que la prioridad 1 del motor JIT no aplica todavía. Se toman los dos primeros ítems de **Alta** prioridad del roadmap v1 (`PRD.md` §6), que además son los dos primeros del roadmap técnico (`tech-specs.md` §11). Son independientes entre sí —una toca el frontend, la otra la infraestructura— y por eso pueden ir en paralelo sin bloquearse.

---

## Tarea 1 — [FEATURE]: Andamiaje del proyecto Angular 22 + PrimeNG 22 + Tailwind 4

**Origen:** `PRD.md` §6 (v1, "Bases del proyecto") · `tech-specs.md` §11 ítem 1 · ADR-006

**Archivos a crear:**
- `package.json`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`
- `src/` completo con `main.ts`, `main.server.ts`, `server.ts`, `styles.css`, `app/app.config.ts`, `app/app.routes.ts`
- `.gitignore` (ampliar el existente con `node_modules/`, `dist/`, `dist-server/`, `.angular/`, `.env`)

**Qué hacer:**

1. Crear el proyecto con la CLI de Angular 22, con SSR habilitado y sin *zone.js* si la versión lo permite:
   ```bash
   npx @angular/cli@22 new agora-letiende --directory . --ssr --style=css --routing --skip-git
   ```
   El directorio ya tiene contenido (`docs/`, `LICENSE`, `README.md`, `CLAUDE.md`): verificar que la CLI no los sobreescriba y **no perder `CLAUDE.md` ni `docs/`**.
2. Instalar PrimeNG 22, `@primeuix/themes`, Tailwind 4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss`) y `tailwindcss-primeui`.
3. Configurar `src/styles.css` con el bloque `@theme` de Tailwind y los tokens de Le Tiende exactos de `CLAUDE.md` §4: `primary #230C00`, `secondary #E8630A`, `tertiary #00B7A3`, `neutral #FFE7B3`, `surface #FFF8F1`, `danger #C0392B`. Fuente de interfaz Poppins.
4. Configurar el preset de tema de PrimeNG en `app.config.ts` mapeando sus tokens semánticos a esa paleta (ADR-006). **No usar un tema por defecto de PrimeNG sin adaptar.**
5. Crear `src/app/shared/pipes/precio.pipe.ts` con `Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })` — sin `CurrencyPipe`/`DecimalPipe` (gotcha de `MEMORY.md` §7).
6. Crear una página de inicio mínima que renderice el nombre del proyecto, un botón primario de PrimeNG con el tema aplicado y un precio de ejemplo con el pipe, para verificar visualmente que el tema funciona.
7. Ajustar los scripts de `package.json` a los nombres que documenta `CLAUDE.md` §3.

**Definition of done:**
- [ ] `npm run build -- --configuration=production` termina sin errores
- [ ] `npm run serve:ssr` sirve la página y el HTML llega renderizado desde el servidor (verificable con `curl` buscando el texto en la respuesta, no solo en el navegador)
- [ ] El botón de PrimeNG se ve con `bg-primary #230C00` y texto `neutral #FFE7B3` — no con el tema por defecto de PrimeNG
- [ ] El pipe `precio` renderiza `45000` como `$45.000`
- [ ] `npm run test` pasa
- [ ] `CLAUDE.md` y `docs/` siguen intactos tras correr la CLI
- [ ] `.gitignore` cubre `node_modules/`, `dist/`, `dist-server/`, `.angular/` y `.env`
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (`CLAUDE.md` §6)

---

## Tarea 2 — [FEATURE]: Infraestructura base y CI/CD hacia staging

**Origen:** `PRD.md` §6 (v1, "Bases del proyecto") · `tech-specs.md` §7 y §11 ítem 2 · ADR-001

**Archivos a crear:**
- `serverless.yml`
- `.github/workflows/deploy.yml`
- `server/api/handlers/salud.ts` + `server/tsconfig.json`

**Qué hacer:**

1. Tomar como plantilla el `serverless.yml` de Babel (`~/Documents/LeTiende/letiende.co/babel/serverless.yml`) y adaptarlo:
   - `service: agora-letiende`, `frameworkVersion: '4'`, `runtime: nodejs24.x`, `region: us-east-1`
   - `package: individually`
   - Bloque `custom.nombresTablas` con las 5 tablas de `tech-specs.md` §5.2, sufijadas con `${sls:stage}`
   - Función `salud` (`GET /api/salud`) y función `ssr` (proxy de todo lo demás) con `@codegenie/serverless-express`
   - Un rol IAM por función, de mínimo privilegio (`CLAUDE.md` §5, A05)
   - **Descripciones de función por debajo de 256 caracteres** — gotcha verificado en producción (`MEMORY.md` §7)
2. Declarar en `resources` las 5 tablas DynamoDB on-demand, con TTL en `expiraEn` y Streams activados en `agora-compras` (`tech-specs.md` §5.2).
3. Declarar los dos buckets S3: `agora-comprobantes-{stage}` con **Block Public Access y cifrado SSE-S3**, y `agora-activos-{stage}`.
4. Implementar `server/api/handlers/salud.ts` devolviendo `{ estado: 'ok', stage, version }`.
5. Crear `.github/workflows/deploy.yml` a partir del de Babel, con el flujo de `tech-specs.md` §7.2: build + test en PR, deploy a staging desde PR con smoke test contra `/api/salud`, deploy a producción desde push a `main`. **Incluir los grupos de `concurrency`** (`desplegar-staging` con `cancel-in-progress: true`, `desplegar-produccion` con `false`) — gotcha verificado en producción.
6. Configurar en GitHub los secretos mínimos para desplegar: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SERVERLESS_LICENSE_KEY` (`tech-specs.md` §9). Los secretos de negocio (Firebase, HMAC, SES) se agregan en su propia tarea; `serverless.yml` debe tolerar su ausencia con valor por defecto `''`.

**Definition of done:**
- [ ] `npx serverless package --stage staging` termina sin errores
- [ ] `npx serverless deploy --stage staging` crea el stack y devuelve un endpoint
- [ ] `curl https://{endpoint}/api/salud` devuelve HTTP 200 con `stage: "staging"`
- [ ] Las 5 tablas existen en DynamoDB con el sufijo `-staging`, y `agora-compras` tiene TTL en `expiraEn` y Streams activados (verificado en la consola o con `aws dynamodb describe-table`)
- [ ] `agora-comprobantes-staging` tiene Block Public Access activado (verificado con `aws s3api get-public-access-block`)
- [ ] El workflow corre en el PR y comenta la URL de staging
- [ ] Cada función tiene su propio rol IAM, sin `AdministratorAccess` ni comodines sobre `dynamodb:*` en `Resource: "*"`
- [ ] Ninguna descripción de función supera 256 caracteres
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (de `tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Tema visual Le Tiende completo y `docs/DESIGN.md`
2. Autenticación con Google y resolución de roles (`agora-usuarios`)
3. Gestión de usuarios
4. CRUD de eventos
5. Cartelera pública y página de evento (SEO/Open Graph/JSON-LD)
6. Motor de aforo (reserva condicional, TTL, liberación por Streams)
7. Compra y reserva de sillas
8. Carga de comprobante por enlace mágico
9. Aprobación del productor
10. Emisión de boletas con QR firmado
11. Validación en puerta
12. Venta en efectivo
13. QR del evento para afiches
14. Panel de control básico
15. Dominio personalizado `agora.letiende.co`

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea las tareas activas de arriba:

- 🔴 **Secciones 1 a 3** de ese documento — proteger la rama `main`, crear el usuario IAM de despliegue y cargar los 3 secretos mínimos en GitHub Actions. Sin esto, la **Tarea 2 no puede desplegar**. ≈35 minutos.

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- 🟡 Verificar el remitente `taquilla@letiende.co` y revisar SPF/DKIM/DMARC (sección 5). ✅ Ya confirmado que la cuenta **no** está en el sandbox de SES.
- 🟡 Registrar la app web de Ágora en el proyecto Firebase compartido y crear su cuenta de servicio propia (sección 4, ADR-002).
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7).

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).
