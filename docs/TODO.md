# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (02/08/2026):** las Tareas 1 (`docs/DESIGN.md`) y 2 (infraestructura base y CI/CD) se completaron y fusionaron a `main` — ver `MEMORY.md` §2, §5 y §9. El tema visual (roadmap #3 de `tech-specs.md` §11) también quedó resuelto como parte del andamiaje anterior, así que el siguiente ítem sin bloqueos es el #4: **autenticación y roles**. Sus dos mitades (verificación de token en el backend vs. login y guardias en el frontend) comparten el mismo ítem de roadmap pero son suficientemente independientes para avanzar en paralelo — el frontend puede construirse contra el contrato de `GET /api/usuarios/me` que define la Tarea 1, igual que ya se hizo con documentación e infraestructura. Los ítems #5 (gestión de usuarios) y #6 (CRUD de eventos) del roadmap dependen de este y no se promueven todavía.

---

## Tarea 1 — [FEATURE]: Backend de autenticación (verificación de token y resolución de roles)

**Origen:** `PRD.md` §6 (v1) · `tech-specs.md` §11 ítem 4, §8.1 · `CLAUDE.md` §5 (A01, A07)

**Archivos a crear:**
- `server/api/services/dynamodb.ts`
- `server/api/lib/verificar-token.ts`
- `server/api/lib/resolver-permisos.ts`
- `server/api/handlers/usuarios-me.ts` (+ `usuarios-me.spec.ts`)

**Qué hacer:**

1. `server/api/services/dynamodb.ts`: instancia única y reutilizable de `DocumentClient` (`@aws-sdk/lib-dynamodb` sobre `@aws-sdk/client-dynamodb`), sin credenciales hardcodeadas — el rol IAM de cada Lambda ya las provee.
2. `server/api/lib/verificar-token.ts`: usa `firebase-admin` inicializado con la cuenta de servicio propia de Ágora (`FIREBASE_SERVICE_ACCOUNT_AGORA`, JSON parseado desde la variable de entorno — nunca desde un archivo commiteado). Expone una función que recibe el header `Authorization: Bearer <token>`, llama `verifyIdToken` (valida firma, expiración y revocación) y devuelve el correo verificado, o lanza un error tipado si falta el header o el token es inválido.
3. `server/api/lib/resolver-permisos.ts`: **única función del backend** que resuelve la jerarquía `administrador > productor > portero` (`CLAUDE.md` §5, A01 — prohibido replicar comparaciones de rol en cada handler). Consulta `agora-usuarios` por el correo verificado (`GetItem`, no `Query`/`Scan`) y devuelve `{ rol, activo }` o `null` si el correo no existe. Estar autenticado en el proyecto Firebase compartido **no implica ninguna autorización**: el correo debe existir explícitamente en `agora-usuarios` con `activo: true`.
4. `server/api/handlers/usuarios-me.ts`: `GET /api/usuarios/me`. Encadena `verificar-token` + `resolver-permisos`: `401` si falta el token o es inválido, `403` si el correo no existe en `agora-usuarios` o `activo: false`, `200` con `{ email, nombre, rol }` si todo es válido. Sin stack traces ni detalles internos en las respuestas de error (`CLAUDE.md` §5, A05).
5. `serverless.yml`: agrega la función `usuariosMe` con su **propio rol IAM** (`dynamodb:GetItem` acotado exclusivamente a `agora-usuarios`, sin comodines sobre `Resource: "*"`), variables de entorno `TABLA_USUARIOS` y `FIREBASE_SERVICE_ACCOUNT_AGORA: ${env:FIREBASE_SERVICE_ACCOUNT_AGORA, ''}` (tolera su ausencia, `tech-specs.md` §9), y el patrón de `package.patterns` correspondiente (esta función sí necesita `node_modules/**` completo por `firebase-admin`, con las mismas exclusiones de paquetes solo-frontend que ya documentó Babel — ver `MEMORY.md` §7 antes de escribirlo a mano).
6. `usuarios-me.spec.ts`: pruebas con `firebase-admin` y el `DocumentClient` mockeados — cubrir los tres casos (401 sin token/token inválido, 403 correo inexistente o inactivo, 200 correo válido y activo).

**Definition of done:**
- [ ] `verificar-token.ts` usa `verifyIdToken` (no decodifica el JWT a mano)
- [ ] `resolver-permisos.ts` es la única fuente de la jerarquía de roles; ningún otro archivo del backend compara roles directamente
- [ ] `GET /api/usuarios/me` distingue 401/403/200 según corresponda, sin filtrar detalles internos en el cuerpo de error
- [ ] Rol IAM de `usuariosMe` limitado a `dynamodb:GetItem` sobre `agora-usuarios` exclusivamente
- [ ] `npm run test:api` en verde, con los tres casos cubiertos
- [ ] `npx serverless package --stage staging` sin errores tras agregar la función
- [ ] Auditoría de costos (`grep -nE "PROVISIONED|..."` de `CLAUDE.md`) sin coincidencias nuevas
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar** (`CLAUDE.md` §6)

---

## Tarea 2 — [FEATURE]: Frontend de autenticación (login con Google y guardias de ruta)

**Origen:** `PRD.md` §6 (v1) · `tech-specs.md` §11 ítem 4, §4.2 · `MEMORY.md` ADR-002, ADR-010

**Archivos a crear:**
- `src/environments/environment.ts`, `src/environments/environment.production.ts`
- `src/app/core/auth/servicio-auth.ts`
- `src/app/core/guardias/guardia-auth.ts`, `src/app/core/guardias/guardia-rol.ts`
- `src/app/features/login/login.component.ts`

**Qué hacer:**

1. `src/environments/`: pegar el `firebaseConfig` **compartido con Comandante y Babel** (ADR-010 en `MEMORY.md` — no se registra una app web propia). Son valores públicos, no sensibles; ya están documentados en `MEMORY.md` §5.
2. `app.config.ts`: inicializar el SDK cliente de Firebase Authentication (Google Sign-In) con ese `firebaseConfig`.
3. `servicio-auth.ts`: expone el estado de sesión **como Signals** (`CLAUDE.md` §4 — nunca `BehaviorSubject`): `usuarioActual`, `rol`, `cargando`. `iniciarSesionConGoogle()` usa `signInWithPopup` + `GoogleAuthProvider`, obtiene el ID Token y llama a `GET /api/usuarios/me` (Tarea 1) para resolver nombre/rol — si la API responde 403, cierra la sesión de Firebase inmediatamente (el usuario está autenticado pero no autorizado en Ágora). `cerrarSesion()` invoca `signOut(auth)` y limpia **todo** el estado reactivo antes de redirigir a `/login` (`CLAUDE.md` §5, A07).
4. `guardia-auth.ts` / `guardia-rol.ts`: guardias de ruta (`CanActivateFn`) que redirigen a `/login` si no hay sesión, o verifican el rol mínimo declarado en `data` de la ruta. **Documentar explícitamente en el código que son solo experiencia de usuario** — el backend siempre revalida (`CLAUDE.md` §5, A01; ya aplicado en la Tarea 1).
5. `login.component.ts`: botón "Ingresar con Google" con las clases ya definidas en `docs/DESIGN.md` (contenedor `min-h-screen bg-surface`, tarjeta, botón primario). Si se muestra el avatar de Google en algún punto del flujo, usar `referrerpolicy="no-referrer"` (gotcha verificado, `MEMORY.md` §7 — evita 429 de `lh3.googleusercontent.com`).
6. Ruta `/login` en `app.routes.ts` (`tech-specs.md` §4.2), sin guardia (es pública).

**Definition of done:**
- [ ] Login con Google funciona contra el proyecto Firebase compartido y resuelve rol vía `GET /api/usuarios/me`
- [ ] `ServicioAuth` expone el estado de sesión con Signals, no `BehaviorSubject`
- [ ] Un correo autenticado en Firebase pero ausente/inactivo en `agora-usuarios` no queda con sesión iniciada en Ágora
- [ ] `GuardiaAuth`/`GuardiaRol` implementados y comentados como mecanismo de UX, no de seguridad
- [ ] `cerrarSesion()` invoca `signOut(auth)` y limpia el estado reactivo antes de redirigir
- [ ] Cualquier avatar de Google usa `referrerpolicy="no-referrer"`
- [ ] `npm run build` sin errores
- [ ] Todo entregado en una rama `feature/*` con PR abierto — **sin fusionar**

---

## Backlog

Orden previsto una vez cerradas las dos tareas activas (de `tech-specs.md` §11). No desglosar todavía: se convierten en tareas atómicas al promoverse.

1. Gestión de usuarios
2. CRUD de eventos
3. Cartelera pública y página de evento (SEO/Open Graph/JSON-LD)
4. Motor de aforo (reserva condicional, TTL, liberación por Streams)
5. Compra y reserva de sillas
6. Carga de comprobante por enlace mágico
7. Aprobación del productor
8. Emisión de boletas con QR firmado
9. Validación en puerta
10. Venta en efectivo
11. QR del evento para afiches
12. Panel de control básico
13. Dominio personalizado `agora.letiende.co`

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. **El paso a paso completo está en `docs/tareas-a-realizar.md`** (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

Lo que bloquea el primer evento real, pero no el desarrollo inmediato:

- ✅ Remitente `taquilla@letiende.co` en SES probado — llegó a bandeja de entrada en Gmail (sección 5). Queda una verificación opcional de cabeceras SPF/DKIM/DMARC, no bloqueante.
- ✅ Cuenta de servicio de Firebase creada y cargada (sección 4.3, ADR-002). **No se registra app web propia** — Ágora reutiliza el `firebaseConfig` de Comandante, igual que Babel (ADR-010). El dominio `agora.letiende.co` ya está en Authorized domains; falta el de staging, que se agrega cuando se monte el dominio personalizado (roadmap #13 del backlog).
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para las Tareas 1/2 activas.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
