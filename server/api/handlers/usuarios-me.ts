import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { ErrorAutenticacion, verificarToken } from '../lib/verificar-token';
import { resolverPermisos } from '../lib/resolver-permisos';
import { obtenerEncabezadoAuthorization, respuestaJson } from '../lib/http';

/**
 * `GET /api/usuarios/me` — encadena `verificar-token` + `resolver-permisos`
 * (tech-specs.md §5.1, §8.1; TODO.md Tarea 1): 401 si falta el token o es
 * inválido, 403 si el correo no existe en `agora-usuarios` o está inactivo,
 * 200 con `{ email, nombre, rol }` si todo es válido. Sin stack traces ni
 * detalles internos en las respuestas de error (CLAUDE.md §5, A05).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  let email: string;
  try {
    email = await verificarToken(obtenerEncabezadoAuthorization(evento));
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      return respuestaJson(401, { mensaje: 'No autenticado' });
    }
    return respuestaJson(500, { mensaje: 'Error interno' });
  }

  let permisos;
  try {
    permisos = await resolverPermisos(email);
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }

  if (!permisos || !permisos.activo) {
    return respuestaJson(403, { mensaje: 'No autorizado en Ágora' });
  }

  return respuestaJson(200, {
    email: permisos.email,
    nombre: permisos.nombre,
    rol: permisos.rol,
  });
};
