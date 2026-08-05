export type Rol = 'administrador' | 'productor' | 'portero';

/** Respuesta de `GET /api/usuarios/me` (server/api/handlers/usuarios-me.ts). */
export interface PerfilUsuario {
  email: string;
  nombre: string;
  rol: Rol;
}

/** Registro completo de `agora-usuarios` (server/api/handlers/usuarios.ts). */
export interface Usuario {
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
}

/** Datos editables de un usuario existente (`PUT /api/usuarios/:email`). */
export interface DatosUsuario {
  nombre?: string;
  rol?: Rol;
  activo?: boolean;
}

/** Datos para crear un usuario nuevo (`POST /api/usuarios`) — incluye `email`, la clave primaria. */
export interface DatosNuevoUsuario {
  email: string;
  nombre: string;
  rol: Rol;
}

/**
 * Espejo de UX de la jerarquía `administrador > productor > portero` que
 * ya resuelve `server/api/lib/resolver-permisos.ts` en el backend — la
 * autorización real vive solo ahí (CLAUDE.md §5, A01). Esta copia solo
 * decide si `GuardiaRol` deja pasar la navegación o redirige.
 */
const JERARQUIA_ROLES: Record<Rol, number> = {
  administrador: 3,
  productor: 2,
  portero: 1,
};

export function cumpleRolMinimo(rol: Rol, rolMinimo: Rol): boolean {
  return JERARQUIA_ROLES[rol] >= JERARQUIA_ROLES[rolMinimo];
}
