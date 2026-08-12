import { Rol, cumpleRolMinimo } from '../../core/models/usuario.model';

/** Una sección del menú de navegación de personal autenticado. */
export interface SeccionNavegacion {
  etiqueta: string;
  ruta: string;
  rolMinimo: Rol;
}

/**
 * Única fuente de verdad de la navegación de personal autenticado
 * (`TODO.md` Tarea 1) — consumida tanto por `BarraNavegacionComponent`
 * (qué enlaces mostrar según `cumpleRolMinimo`) como por `app.routes.ts`
 * (qué `rolMinimo` exige el `guardiaRol` de cada ruta `admin/*`), para no
 * declarar el mismo rol dos veces.
 *
 * Orden intencional: de más accesible a más restrictivo. `rutaDestinoParaRol`
 * depende de este orden con `findLast` para elegir la sección más
 * específica que el rol de un usuario ya autenticado cumple.
 */
// 'Efectivo' y 'Puerta' comparten rolMinimo 'portero' — 'Efectivo' va ANTES
// a propósito: `rutaDestinoParaRol` usa `findLast`, así que la última
// sección de cada nivel de rol es la que gana como destino tras iniciar
// sesión. Puerta (escanear en la entrada) es la razón principal por la que
// un portero abre la app un día de función (`PRD.md` §8, el requisito de
// rendimiento más estricto del producto); Efectivo es una acción secundaria
// y ocasional. Si se agrega una nueva sección de nivel 'portero' más
// adelante, insertarla también antes de 'Puerta' para no cambiar este
// destino sin una decisión explícita (`TODO.md` Tarea 2).
//
// 'Cartelera' (`/`) NO está en este arreglo (`TODO.md` Tarea 1, ajustes
// pre-producción): el logo del header ya enlaza a `/` siempre, con o sin
// sesión, así que repetirla aquí era redundante en el menú de personal
// autenticado. La ruta pública `/` no se toca — sigue existiendo para
// cualquiera vía URL o logo.
export const SECCIONES_NAVEGACION: SeccionNavegacion[] = [
  { etiqueta: 'Efectivo', ruta: '/efectivo', rolMinimo: 'portero' },
  { etiqueta: 'Puerta', ruta: '/puerta', rolMinimo: 'portero' },
  // 'Panel' va ANTES de 'Aprobaciones' a propósito (TODO.md Tarea 2): mismo
  // criterio de `findLast` explicado arriba para 'Efectivo'/'Puerta' —
  // 'Aprobaciones' sigue siendo la última sección de nivel 'productor', así
  // que el destino tras iniciar sesión de un productor no cambia por
  // agregar esta sección.
  { etiqueta: 'Panel', ruta: '/panel', rolMinimo: 'productor' },
  { etiqueta: 'Aprobaciones', ruta: '/admin/aprobaciones', rolMinimo: 'productor' },
  { etiqueta: 'Eventos', ruta: '/admin/eventos', rolMinimo: 'administrador' },
  { etiqueta: 'Usuarios', ruta: '/admin/usuarios', rolMinimo: 'administrador' },
];

/**
 * Sección más específica accesible para `rol` (`/` si es `null` o no
 * cumple ninguna) — única fuente de esta decisión, para que "a dónde va
 * alguien tras autenticarse" no se calcule dos veces con el riesgo de que
 * una de las dos copias quede desactualizada. Antes de esta función,
 * `guardiaInvitado` (solo se ejecuta al *revisitar* `/login` ya con
 * sesión) tenía esta lógica inline, pero `LoginComponent` (el flujo real
 * de *primer* ingreso) navegaba a `'/'` a secas — el mismo bug para todos
 * los roles, solo visible para quien no cumple `find`/`findLast` por
 * `'/'` (portero), reportado en vivo por el usuario probando el PR de
 * Validación en puerta (`MEMORY.md` §7).
 *
 * `findLast` (no `find`): con `find`, la primera sección del arreglo
 * accesible para cualquier rol (antes "Cartelera") siempre ganaría,
 * rebotando incluso a un administrador hacia `/`. El razonamiento se
 * mantiene aunque "Cartelera" ya no esté en el arreglo (`TODO.md` Tarea 1):
 * cualquier sección futura de rol amplio tendría el mismo problema con
 * `find`.
 */
export function rutaDestinoParaRol(rol: Rol | null): string {
  if (!rol) {
    return '/';
  }
  const seccion = SECCIONES_NAVEGACION.findLast((s) => cumpleRolMinimo(rol, s.rolMinimo));
  return seccion ? seccion.ruta : '/';
}
