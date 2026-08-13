import { Rol, cumpleRolMinimo } from '../../core/models/usuario.model';

/** Un tab de nivel 2 dentro de un grupo del menú de navegación de personal autenticado. */
export interface TabNavegacion {
  etiqueta: string;
  ruta: string;
  rolMinimo: Rol;
}

/**
 * Un grupo de nivel 1 del menú de navegación de personal autenticado — NO
 * tiene un `rolMinimo` propio: cada tab conserva el suyo individual. Esto es
 * crítico para "Eventos" (dentro del grupo "Mis Eventos"): sigue exigiendo
 * `administrador` aunque quede agrupado visualmente junto a "Panel" y
 * "Aprobaciones" (`productor`) — darle al grupo un solo rolMinimo compartido
 * volvería "Eventos" accesible a cualquier productor, una fuga de
 * autorización real, no cosmética.
 */
export interface GrupoNavegacion {
  etiqueta: string;
  tabs: TabNavegacion[];
}

/**
 * Única fuente de verdad de la navegación de personal autenticado
 * (`TODO.md` Tarea 1) — consumida tanto por `BarraNavegacionComponent`
 * (qué grupos/tabs mostrar según `cumpleRolMinimo`) como por `app.routes.ts`
 * (qué `rolMinimo` exige el `guardiaRol` de cada ruta de personal), para no
 * declarar el mismo rol dos veces.
 *
 * Orden intencional, tanto de grupos como de tabs dentro de cada grupo: de
 * más accesible a más restrictivo. `rutaDestinoParaRol` depende de este
 * orden (aplanado con `flatMap`) con `findLast` para elegir el tab más
 * específico que el rol de un usuario ya autenticado cumple.
 */
// 'Efectivo' y 'Puerta' comparten rolMinimo 'portero' — 'Efectivo' va ANTES
// a propósito: `rutaDestinoParaRol` usa `findLast`, así que el último tab
// de cada nivel de rol es el que gana como destino tras iniciar sesión.
// Puerta (escanear en la entrada) es la razón principal por la que un
// portero abre la app un día de función (`PRD.md` §8, el requisito de
// rendimiento más estricto del producto); Efectivo es una acción secundaria
// y ocasional. Si se agrega un nuevo tab de nivel 'portero' más adelante,
// insertarlo también antes de 'Puerta' para no cambiar este destino sin una
// decisión explícita (`TODO.md` Tarea 2).
//
// 'Cartelera' (`/`) NO está en este arreglo (`TODO.md` Tarea 1, ajustes
// pre-producción): el logo del header ya enlaza a `/` siempre, con o sin
// sesión, así que repetirla aquí era redundante en el menú de personal
// autenticado. La ruta pública `/` no se toca — sigue existiendo para
// cualquiera vía URL o logo.
export const GRUPOS_NAVEGACION: GrupoNavegacion[] = [
  {
    etiqueta: 'Taquilla',
    tabs: [
      { etiqueta: 'Efectivo', ruta: '/taquilla/efectivo', rolMinimo: 'portero' },
      { etiqueta: 'Puerta', ruta: '/taquilla/puerta', rolMinimo: 'portero' },
    ],
  },
  {
    etiqueta: 'Mis Eventos',
    tabs: [
      // 'Panel' va ANTES de 'Aprobaciones' a propósito (TODO.md Tarea 2):
      // mismo criterio de `findLast` explicado arriba para
      // 'Efectivo'/'Puerta' — 'Aprobaciones' sigue siendo el último tab de
      // rol 'productor' que un productor cumple, así que el destino tras
      // iniciar sesión de un productor no cambia por agregar este grupo.
      // 'Eventos' exige 'administrador' (más restrictivo que 'productor')
      // pese a quedar agrupado visualmente entre 'Panel' y 'Aprobaciones' —
      // ver el docstring de `GrupoNavegacion` sobre por qué el rolMinimo es
      // siempre del tab, nunca del grupo.
      { etiqueta: 'Panel', ruta: '/mis-eventos/panel', rolMinimo: 'productor' },
      { etiqueta: 'Eventos', ruta: '/mis-eventos/eventos', rolMinimo: 'administrador' },
      { etiqueta: 'Aprobaciones', ruta: '/mis-eventos/aprobaciones', rolMinimo: 'productor' },
    ],
  },
  {
    etiqueta: 'Usuarios',
    tabs: [{ etiqueta: 'Usuarios', ruta: '/usuarios', rolMinimo: 'administrador' }],
  },
];

/** Todos los tabs de todos los grupos, aplanados en el mismo orden — única fuente para `rutaDestinoParaRol` y `rolMinimoDeRuta`. */
const TABS_NAVEGACION_PLANOS: TabNavegacion[] = GRUPOS_NAVEGACION.flatMap((grupo) => grupo.tabs);

/**
 * Tab más específico accesible para `rol` (`/` si es `null` o no cumple
 * ninguno) — única fuente de esta decisión, para que "a dónde va alguien
 * tras autenticarse" no se calcule dos veces con el riesgo de que una de las
 * dos copias quede desactualizada. Antes de esta función, `guardiaInvitado`
 * (solo se ejecuta al *revisitar* `/login` ya con sesión) tenía esta lógica
 * inline, pero `LoginComponent` (el flujo real de *primer* ingreso) navegaba
 * a `'/'` a secas — el mismo bug para todos los roles, solo visible para
 * quien no cumple `find`/`findLast` por `'/'` (portero), reportado en vivo
 * por el usuario probando el PR de Validación en puerta (`MEMORY.md` §7).
 *
 * `findLast` (no `find`): con `find`, el primer tab del arreglo accesible
 * para cualquier rol (antes "Cartelera") siempre ganaría, rebotando incluso
 * a un administrador hacia `/`. El razonamiento se mantiene aunque
 * "Cartelera" ya no esté en el arreglo (`TODO.md` Tarea 1): cualquier tab
 * futuro de rol amplio tendría el mismo problema con `find`.
 */
export function rutaDestinoParaRol(rol: Rol | null): string {
  if (!rol) {
    return '/';
  }
  const tab = TABS_NAVEGACION_PLANOS.findLast((t) => cumpleRolMinimo(rol, t.rolMinimo));
  return tab ? tab.ruta : '/';
}

/**
 * `rolMinimo` de una ruta de personal, derivado de `GRUPOS_NAVEGACION`
 * (única fuente de verdad, `TODO.md` Tarea 1) en vez de declararse dos
 * veces — reemplaza lo que antes era `rolMinimoDe` en `app.routes.ts`. Lanza
 * en tiempo de carga del módulo si el tab esperado no existe — un error de
 * configuración así debe fallar ruidosamente, no silenciarse detrás de un
 * `undefined`.
 */
export function rolMinimoDeRuta(ruta: string): Rol {
  const tab = TABS_NAVEGACION_PLANOS.find((t) => t.ruta === ruta);
  if (!tab) {
    throw new Error(`No hay una sección de navegación para la ruta "${ruta}".`);
  }
  return tab.rolMinimo;
}
