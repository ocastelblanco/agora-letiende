# TODO.md — Ágora

Motor JIT: este documento mantiene **siempre exactamente 2 tareas atómicas** activas. Al completar cualquiera, se elimina, se mueve su resumen a `MEMORY.md` §2, y se calcula la siguiente tarea más prioritaria comparando `PRD.md` (roadmap) contra `MEMORY.md` (estado actual).

---

## Tarea 1 — Sin tarea iniciable (decisión de OCM)

**Tipos de boletería (roadmap #33, ADR-020) quedó completo el 29/10/2026** en 3 PR (#114 backend, #115 administración y #116 frontend público) más el ajuste de UI móvil (#117); resumen en `docs/MEMORY.md` §2. No queda ningún ítem de v2 sin prerrequisito externo: el único restante es WhatsApp (Tarea 2, bloqueada por la Verificación de Negocio de Meta). Para tener un segundo ítem activo hay que promover uno de v3 (`PRD.md` §6: validación en puerta sin conexión, devoluciones y transferencia de boletas, códigos de descuento y cortesías, historial de compras por correo) — **decisión de OCM, no del agente**.

---

## Tarea 2 — Notificaciones por WhatsApp (roadmap #20) — 🔒 bloqueada por prerrequisito externo

**Prioridad Alta, pero no iniciable hoy.** Depende de la Verificación de Negocio de Meta y de un número de teléfono nuevo que no esté en uso en la app de WhatsApp (ver "Pendientes que no son de código" abajo y `docs/tareas-a-realizar.md` §8). Es el único ítem de v2 que queda: ya no hay ningún otro sin prerrequisito externo (el PDF se completó el 15/10/2026). Mientras siga bloqueada, el trabajo de desarrollo disponible es el de la Tarea 1; al terminarla, sin otro ítem iniciable, hay que esperar a que OCM promueva uno de v3 (`PRD.md` §6).

---

---

## Backlog

Vacío. v1 completa (`PRD.md` §6). De v2 solo queda WhatsApp (Tarea 2); el resto está en producción y resumido en `MEMORY.md` §2. Los planes ya cumplidos (pre-producción, ajustes de eventos, tipos de boletería) están en `docs/archivo/`.

---

## Pendientes que no son de código

No ocupan slots del motor JIT porque no dependen del desarrollo. El paso a paso de los trámites está en `docs/tareas-a-realizar.md` (documento de trabajo personal de OCM, fuera de control de versiones porque puede contener secretos).

- 🟢 **Alta de la WABA de WhatsApp** (`tareas-a-realizar.md` §8), que desbloquea la Tarea 2. Conviene arrancarla pronto porque la Verificación de Negocio de Meta es lenta. Ojo con el requisito del número: **no puede estar en uso en la app de WhatsApp**.
- 🟡 **Crear el presupuesto de AWS propio de Ágora** (filtro por la etiqueta `Proyecto: agora`, umbral ~US$1), que exige `CLAUDE.md` §5-bis. Verificado el 04/11/2026: la cuenta solo tiene los dos presupuestos compartidos (`Costo diario` y `Costos promedio`).
- 🟡 **Revisar la factura real de Ágora** con Cost Explorer filtrado por la misma etiqueta (`aws ce get-cost-and-usage`, `docs/advertencia-urgente-costos-aws.md` §4 Paso 4) y confirmar el objetivo de < US$1/mes. Reemplaza los recordatorios de 48 horas que quedaron de agosto (dominio personalizado, SSM, `boldWebhook`).
