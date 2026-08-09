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
export const SECCIONES_NAVEGACION: SeccionNavegacion[] = [
  { etiqueta: 'Cartelera', ruta: '/', rolMinimo: 'portero' },
  { etiqueta: 'Puerta', ruta: '/puerta', rolMinimo: 'portero' },
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
 * `findLast` (no `find`): con `find`, "Cartelera" (la primera del arreglo,
 * accesible para cualquier rol) siempre ganaría, rebotando incluso a un
 * administrador hacia `/`.
 */
export function rutaDestinoParaRol(rol: Rol | null): string {
  if (!rol) {
    return '/';
  }
  const seccion = SECCIONES_NAVEGACION.findLast((s) => cumpleRolMinimo(rol, s.rolMinimo));
  return seccion ? seccion.ruta : '/';
}
