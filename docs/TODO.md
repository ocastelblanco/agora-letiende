# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

**Prioridad de selección aplicada (02/08/2026, sesión de la tarde):** la Tarea 1 (backend de autenticación) se completó — ver `MEMORY.md` §2, §4, §7 y §9 — y quedó como único slot activo la Tarea 1 renumerada (antes Tarea 2: frontend de autenticación), que ya puede construirse contra el contrato real de `GET /api/usuarios/me`. **El segundo slot queda deliberadamente vacío por ahora**, no por descuido del motor JIT: los ítems #5 (gestión de usuarios) y #6 (CRUD de eventos) del roadmap dependen explícitamente de que **ambas mitades** de autenticación y roles estén completas (nota ya existente en la versión anterior de este documento), y la mitad de frontend todavía no cierra. Promover cualquiera de los dos ahora mismo violaría esa dependencia declarada; se recalculan ambos slots en la próxima sesión, apenas cierre esta tarea.

---

## Tarea 1 — [FEATURE]: Frontend de autenticación (login con Google y guardias de ruta)

**Origen:** `PRD.md` §6 (v1) · `tech-specs.md` §11 ítem 4, §4.2 · `MEMORY.md` ADR-002, ADR-010

**Archivos a crear:**
- `src/environments/environment.ts`, `src/environments/environment.production.ts`
- `src/app/core/auth/servicio-auth.ts`
- `src/app/core/guardias/guardia-auth.ts`, `src/app/core/guardias/guardia-rol.ts`
- `src/app/features/login/login.component.ts`

**Qué hacer:**

1. `src/environments/`: pegar el `firebaseConfig` **compartido con Comandante y Babel** (ADR-010 en `MEMORY.md` — no se registra una app web propia). Son valores públicos, no sensibles; ya están documentados en `MEMORY.md` §5.
2. `app.config.ts`: inicializar el SDK cliente de Firebase Authentication (Google Sign-In) con ese `firebaseConfig`.
3. `servicio-auth.ts`: expone el estado de sesión **como Signals** (`CLAUDE.md` §4 — nunca `BehaviorSubject`): `usuarioActual`, `rol`, `cargando`. `iniciarSesionConGoogle()` usa `signInWithPopup` + `GoogleAuthProvider`, obtiene el ID Token y llama a `GET /api/usuarios/me` (backend ya desplegable, ver `MEMORY.md` §2 y §4) para resolver nombre/rol — si la API responde 403, cierra la sesión de Firebase inmediatamente (el usuario está autenticado pero no autorizado en Ágora). `cerrarSesion()` invoca `signOut(auth)` y limpia **todo** el estado reactivo antes de redirigir a `/login` (`CLAUDE.md` §5, A07).
4. `guardia-auth.ts` / `guardia-rol.ts`: guardias de ruta (`CanActivateFn`) que redirigen a `/login` si no hay sesión, o verifican el rol mínimo declarado en `data` de la ruta. **Documentar explícitamente en el código que son solo experiencia de usuario** — el backend siempre revalida (`CLAUDE.md` §5, A01; ya aplicado en `server/api/lib/resolver-permisos.ts`).
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

Orden previsto una vez cerrada la Tarea 1 activa (de `tech-specs.md` §11). El motor JIT solo tiene un slot activo en este momento — ver la nota de prioridad de selección arriba. No desglosar todavía: se convierten en tareas atómicas al promoverse.

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
- 🟡 Secretos de negocio y dominio `agora.letiende.co` (secciones 6 y 7). `SECRETO_FIRMA_BOLETAS` y `SECRETO_ENLACES_MAGICOS` se necesitan más adelante (emisión de boletas y enlaces mágicos), no para la Tarea 1 activa.

Fase 2, conviene arrancarlo pronto porque la Verificación de Negocio de Meta es lenta:

- 🟢 Alta de la WABA de WhatsApp (sección 8). Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟢 Llaves de Bold (sección 9) y Google Calendar (sección 10).

**Recordatorio activo (no es una tarea, ver `MEMORY.md` §9):** revisar el costo diario real de la cuenta AWS 48 horas después del primer despliegue a staging (el 04/08/2026 o después) — `aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4.
