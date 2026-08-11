import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ErrorAutenticacion, verificarToken } from './verificar-token';
import { PermisosUsuario, Rol, cumpleRolMinimo, resolverPermisos } from './resolver-permisos';
import { obtenerEncabezadoAuthorization, respuestaJson } from './http';

export type ResultadoAutorizacion =
  | { autorizado: true; permisos: PermisosUsuario }
  | { autorizado: false; respuesta: APIGatewayProxyResultV2 };

/**
 * Encadena `verificar-token` + `resolver-permisos` + `cumpleRolMinimo`
 * (CLAUDE.md §5, A01) para cualquier endpoint que exija un rol mínimo —
 * único punto del backend donde se hace esta composición, para que ningún
 * handler nuevo la repita ni la compare a mano.
 */
export async function exigirRol(
  evento: APIGatewayProxyEventV2,
  rolMinimo: Rol,
): Promise<ResultadoAutorizacion> {
  let email: string;
  try {
    email = await verificarToken(obtenerEncabezadoAuthorization(evento));
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return { autorizado: false, respuesta: respuestaJson(401, { mensaje: 'No autenticado' }) };
    }
    return { autorizado: false, respuesta: respuestaJson(500, { mensaje: 'Error interno' }) };
  }

  let permisos: PermisosUsuario | null;
  try {
    permisos = await resolverPermisos(email);
  } catch {
    return { autorizado: false, respuesta: respuestaJson(500, { mensaje: 'Error interno' }) };
  }

  if (!permisos || !permisos.activo || !cumpleRolMinimo(permisos.rol, rolMinimo)) {
    return {
      autorizado: false,
      respuesta: respuestaJson(403, { mensaje: 'No autorizado en Ágora' }),
    };
  }

  return { autorizado: true, permisos };
}

/**
 * `true` si `email` está en el campo `productores` del evento, o si `rol` es
 * `administrador` (bypass, CLAUDE.md §5 A01) — única función que resuelve
 * "¿este productor está asignado a este evento puntual?", para que ningún
 * handler nuevo repita esta comparación ad hoc (`listarPendientes()` en
 * `aprobaciones.ts` y `handlers/reportes.ts`, TODO.md Tarea 2).
 */
export function tieneAccesoAlEvento(
  eventoItem: Record<string, unknown>,
  permisos: PermisosUsuario,
): boolean {
  if (permisos.rol === 'administrador') {
    return true;
  }
  return Array.isArray(eventoItem['productores']) && eventoItem['productores'].includes(permisos.email);
}
