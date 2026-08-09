import { Rol } from '../../core/models/usuario.model';

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
 * Orden intencional: de más accesible a más restrictivo. `guardiaInvitado`
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
