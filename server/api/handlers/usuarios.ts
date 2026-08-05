import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { exigirRol } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';
import { Rol } from '../lib/resolver-permisos';

const ROLES_VALIDOS: readonly Rol[] = ['administrador', 'productor', 'portero'];

function esRolValido(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES_VALIDOS as readonly string[]).includes(valor);
}

function esEmailValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.length > 0 &&
    valor.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
  );
}

function esNombreValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= 200;
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

function leerCuerpo(evento: APIGatewayProxyEventV2): unknown {
  if (!evento.body) {
    return null;
  }
  try {
    return JSON.parse(evento.body);
  } catch {
    return undefined;
  }
}

async function listarUsuarios(): Promise<APIGatewayProxyResultV2> {
  const resultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_USUARIOS'] }),
  );
  return respuestaJson(200, resultado.Items ?? []);
}

async function crearUsuario(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }

  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  if (
    !esEmailValido(datos['email']) ||
    !esNombreValido(datos['nombre']) ||
    !esRolValido(datos['rol'])
  ) {
    return respuestaJson(400, {
      mensaje: 'email, nombre y rol son obligatorios y deben ser válidos',
    });
  }

  const usuario = {
    email: datos['email'],
    nombre: datos['nombre'],
    rol: datos['rol'],
    activo: true,
    creadoEn: new Date().toISOString(),
  };

  try {
    // Sin lectura previa: la condición evita sobrescribir un usuario ya
    // existente bajo concurrencia (mismo criterio que el aforo, CLAUDE.md
    // §5 A04, aplicado aquí a la unicidad del correo).
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_USUARIOS'],
        Item: usuario,
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Ya existe un usuario registrado con ese correo' });
    }
    throw error;
  }

  return respuestaJson(201, usuario);
}

async function actualizarUsuario(
  emailObjetivo: string | undefined,
  evento: APIGatewayProxyEventV2,
  correoToken: string,
): Promise<APIGatewayProxyResultV2> {
  if (!emailObjetivo) {
    return respuestaJson(400, { mensaje: 'Falta el correo en la ruta' });
  }

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (datos['nombre'] !== undefined && !esNombreValido(datos['nombre'])) {
    return respuestaJson(400, { mensaje: 'nombre inválido' });
  }
  if (datos['rol'] !== undefined && !esRolValido(datos['rol'])) {
    return respuestaJson(400, { mensaje: 'rol inválido' });
  }
  if (datos['activo'] !== undefined && typeof datos['activo'] !== 'boolean') {
    return respuestaJson(400, { mensaje: 'activo inválido' });
  }

  // Salvaguarda obligatoria (TODO.md Tarea 1): sin esto, un único
  // administrador que se equivoca puede dejar Ágora sin ningún
  // administrador activo.
  if (
    emailObjetivo === correoToken &&
    datos['rol'] !== undefined &&
    datos['rol'] !== 'administrador'
  ) {
    return respuestaJson(400, {
      mensaje:
        'No puedes degradar tu propio rol de administrador. Pídele a otro administrador que lo haga.',
    });
  }

  const asignaciones: string[] = [];
  const nombresAtributos: Record<string, string> = {};
  const valoresExpresion: Record<string, unknown> = {};

  for (const [campo, marcador] of [
    ['nombre', '#nombre'],
    ['rol', '#rol'],
    ['activo', '#activo'],
  ] as const) {
    if (datos[campo] !== undefined) {
      asignaciones.push(`${marcador} = :${campo}`);
      nombresAtributos[marcador] = campo;
      valoresExpresion[`:${campo}`] = datos[campo];
    }
  }

  if (asignaciones.length === 0) {
    return respuestaJson(400, { mensaje: 'No hay campos para actualizar' });
  }

  try {
    const resultado = await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_USUARIOS'],
        Key: { email: emailObjetivo },
        UpdateExpression: `SET ${asignaciones.join(', ')}`,
        ExpressionAttributeNames: nombresAtributos,
        ExpressionAttributeValues: valoresExpresion,
        ConditionExpression: 'attribute_exists(email)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return respuestaJson(200, resultado.Attributes);
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(404, { mensaje: 'No existe un usuario con ese correo' });
    }
    throw error;
  }
}

async function eliminarUsuario(
  emailObjetivo: string | undefined,
  correoToken: string,
): Promise<APIGatewayProxyResultV2> {
  if (!emailObjetivo) {
    return respuestaJson(400, { mensaje: 'Falta el correo en la ruta' });
  }

  // Salvaguarda obligatoria (TODO.md Tarea 1): mismo motivo que en
  // actualizarUsuario — nunca permitir quedarse sin administradores.
  if (emailObjetivo === correoToken) {
    return respuestaJson(400, {
      mensaje: 'No puedes eliminarte a ti mismo. Pídele a otro administrador que lo haga.',
    });
  }

  try {
    await documentoDynamoDB.send(
      new DeleteCommand({
        TableName: process.env['TABLA_USUARIOS'],
        Key: { email: emailObjetivo },
        ConditionExpression: 'attribute_exists(email)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(404, { mensaje: 'No existe un usuario con ese correo' });
    }
    throw error;
  }

  return { statusCode: 204 };
}

/**
 * `GET/POST /api/usuarios`, `PUT/DELETE /api/usuarios/:email` — CRUD de
 * `agora-usuarios`, exclusivo de `administrador` (tech-specs.md §5.1,
 * TODO.md Tarea 1). La autorización se resuelve una sola vez por petición
 * con `exigirRol` (`CLAUDE.md` §5, A01) antes de despachar por método.
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const autorizacion = await exigirRol(evento, 'administrador');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  const emailObjetivo = evento.pathParameters?.['email'];

  try {
    switch (evento.requestContext.http.method) {
      case 'GET':
        return await listarUsuarios();
      case 'POST':
        return await crearUsuario(evento);
      case 'PUT':
        return await actualizarUsuario(emailObjetivo, evento, autorizacion.permisos.email);
      case 'DELETE':
        return await eliminarUsuario(emailObjetivo, autorizacion.permisos.email);
      default:
        return respuestaJson(405, { mensaje: 'Método no soportado' });
    }
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
