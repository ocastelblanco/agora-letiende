import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ErrorAutenticacion, MotivoAutenticacion, verificarToken } from './verificar-token';
import { PermisosUsuario, Rol, cumpleRolMinimo, resolverPermisos } from './resolver-permisos';
import { obtenerEncabezadoAuthorization, respuestaJson } from './http';

export type ResultadoAutorizacion =
  | { autorizado: true; permisos: PermisosUsuario }
  | { autorizado: false; respuesta: APIGatewayProxyResultV2 };

export type MotivoRechazo = MotivoAutenticacion | 'no_registrado' | 'inactivo' | 'rol_insuficiente';

/**
 * Deja en el log cada 401/403 de una ruta protegida (`CLAUDE.md` §5 A09),
 * para poder reconstruir intentos de acceso. Solo datos del personal: el
 * correo cuando ya fue verificado y el rol. Nunca el token ni datos de
 * clientes.
 */
export function registrarRechazo(
  evento: APIGatewayProxyEventV2,
  motivo: MotivoRechazo,
  detalle: { email?: string; rol?: Rol; rolMinimo?: Rol } = {},
): void {
  console.warn('Acceso rechazado', {
    motivo,
    metodo: evento.requestContext?.http?.method,
    ruta: evento.rawPath,
    ...detalle,
  });
}

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
      registrarRechazo(evento, error.motivo);
      return { autorizado: false, respuesta: respuestaJson(401, { mensaje: 'No autenticado' }) };
    }
    console.error('verificarToken falló de forma inesperada', {
      nombreError: error instanceof Error ? error.name : 'error desconocido',
      mensajeError: error instanceof Error ? error.message : undefined,
    });
    return { autorizado: false, respuesta: respuestaJson(500, { mensaje: 'Error interno' }) };
  }

  let permisos: PermisosUsuario | null;
  try {
    permisos = await resolverPermisos(email);
  } catch (error) {
    console.error('resolverPermisos falló de forma inesperada', {
      nombreError: error instanceof Error ? error.name : 'error desconocido',
      mensajeError: error instanceof Error ? error.message : undefined,
    });
    return { autorizado: false, respuesta: respuestaJson(500, { mensaje: 'Error interno' }) };
  }

  if (!permisos) {
    registrarRechazo(evento, 'no_registrado', { email });
    return { autorizado: false, respuesta: respuestaJson(403, { mensaje: 'No autorizado en Ágora' }) };
  }
  if (!permisos.activo) {
    registrarRechazo(evento, 'inactivo', { email });
    return { autorizado: false, respuesta: respuestaJson(403, { mensaje: 'No autorizado en Ágora' }) };
  }
  if (!cumpleRolMinimo(permisos.rol, rolMinimo)) {
    registrarRechazo(evento, 'rol_insuficiente', { email, rol: permisos.rol, rolMinimo });
    return { autorizado: false, respuesta: respuestaJson(403, { mensaje: 'No autorizado en Ágora' }) };
  }

  return { autorizado: true, permisos };
}

/**
 * `true` si `email` está asignado al evento según su rol, o si `rol` es
 * `administrador` (bypass, `CLAUDE.md` §5 A01) — única función que resuelve
 * "¿esta persona del equipo está asignada a este evento puntual?", para que
 * ningún handler nuevo repita esta comparación ad hoc (`listarPendientes()`
 * en `aprobaciones.ts`, `handlers/reportes.ts`, `handlers/ventas-efectivo.ts`
 * y `handlers/boletas.ts`, `TODO.md` Tarea 1 T8). Un `productor` se resuelve
 * contra `productores`; un `portero`, contra `porteros` (`docs/plan-pre-produccion.md`
 * T8) — cualquier otro rol (no debería llegar hasta acá, `exigirRol` ya lo
 * filtra antes) no tiene acceso.
 */
export function tieneAccesoAlEvento(
  // Tipo estructural mínimo (solo los dos campos que esta función lee) en
  // vez de `Record<string, unknown>` — así acepta tanto un ítem crudo de
  // DynamoDB (`GetCommand`/`ScanCommand`, sin tipar) como un objeto ya
  // tipado que declare estos dos campos (`EventoParaCompra` en
  // `handlers/compras.ts`), sin que ninguno de los dos necesite un cast.
  eventoItem: { productores?: unknown; porteros?: unknown },
  permisos: PermisosUsuario,
): boolean {
  if (permisos.rol === 'administrador') {
    return true;
  }
  const campo = permisos.rol === 'portero' ? 'porteros' : 'productores';
  const valor = eventoItem[campo];
  return Array.isArray(valor) && valor.includes(permisos.email);
}
