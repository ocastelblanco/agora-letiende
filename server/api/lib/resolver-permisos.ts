import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';

export type Rol = 'administrador' | 'productor' | 'portero';

export interface PermisosUsuario {
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

/**
 * Jerarquía única de roles de Ágora (CLAUDE.md §5, A01): esta es la única
 * fuente de comparación de roles del backend — ningún otro handler debe
 * replicar esta lógica.
 */
const JERARQUIA_ROLES: Record<Rol, number> = {
  administrador: 3,
  productor: 2,
  portero: 1,
};

export function cumpleRolMinimo(rol: Rol, rolMinimo: Rol): boolean {
  return JERARQUIA_ROLES[rol] >= JERARQUIA_ROLES[rolMinimo];
}

interface ItemUsuarioDynamoDB {
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

function esItemUsuarioValido(item: unknown): item is ItemUsuarioDynamoDB {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const registro = item as Record<string, unknown>;
  return (
    typeof registro['email'] === 'string' &&
    typeof registro['nombre'] === 'string' &&
    typeof registro['rol'] === 'string' &&
    typeof registro['activo'] === 'boolean'
  );
}

/**
 * Resuelve el rol y estado del correo verificado del token consultando
 * `agora-usuarios` por `GetItem` (nunca `Query`/`Scan`). Devuelve `null` si
 * el correo no existe — estar autenticado en el proyecto Firebase
 * compartido no implica ninguna autorización en Ágora (tech-specs.md §8.1).
 */
export async function resolverPermisos(email: string): Promise<PermisosUsuario | null> {
  const resultado = await documentoDynamoDB.send(
    new GetCommand({
      TableName: process.env['TABLA_USUARIOS'],
      Key: { email },
    }),
  );

  if (!esItemUsuarioValido(resultado.Item)) {
    return null;
  }

  return {
    email: resultado.Item.email,
    nombre: resultado.Item.nombre,
    rol: resultado.Item.rol,
    activo: resultado.Item.activo,
  };
}
