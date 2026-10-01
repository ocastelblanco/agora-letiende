import { createHash } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from './dynamodb';
import { respuestaJson } from '../lib/http';

/**
 * Idempotencia de las operaciones con consecuencia real (`POST /api/compras`,
 * `POST /api/ventas-efectivo`, roadmap #32 parte 1). El cliente genera un
 * UUID v4 por intento y lo envía en `Idempotency-Key`; si la misma petición
 * llega dos veces (reintento de red, segunda pestaña, timeout) la segunda no
 * repite el efecto: devuelve la respuesta ya calculada de la primera.
 *
 * La clave se **reclama** con una escritura condicional
 * (`attribute_not_exists`) ANTES de ejecutar la operación — nunca
 * lectura-y-luego-escritura (`CLAUDE.md` §5, A04). El ítem guarda solo la
 * respuesta (compraId, montos, config pública de Bold — sin datos
 * personales del cliente) y expira solo por TTL.
 *
 * Reglas:
 * - Sin encabezado: la operación corre como antes (retrocompatible).
 * - Misma clave, cuerpo distinto → 409, no se ejecuta nada.
 * - Misma clave en proceso → 409 «sigue en proceso»; si la reclamación tiene
 *   más de `UMBRAL_RECLAMACION_VENCIDA_SEGUNDOS` (la Lambda murió a mitad), se
 *   retoma con una actualización condicional.
 * - Solo se guarda una respuesta 2xx. Cualquier otro resultado (rechazo,
 *   excepción) libera la clave para que el reintento se evalúe de nuevo.
 */

const PATRON_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIDA_CLAVE_SEGUNDOS = 24 * 60 * 60;
const UMBRAL_RECLAMACION_VENCIDA_SEGUNDOS = 60;

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

function leerClave(evento: APIGatewayProxyEventV2): string | undefined {
  const encabezados = evento.headers ?? {};
  return encabezados['idempotency-key'] ?? encabezados['Idempotency-Key'];
}

async function liberarClave(idempotenciaId: string): Promise<void> {
  try {
    await documentoDynamoDB.send(
      new DeleteCommand({
        TableName: process.env['TABLA_IDEMPOTENCIA'],
        Key: { idempotenciaId },
        ConditionExpression: 'estado = :enProceso',
        ExpressionAttributeValues: { ':enProceso': 'en_proceso' },
      }),
    );
  } catch {
    // Best-effort: si no se libera, expira sola por TTL o se retoma por antigüedad.
  }
}

export async function ejecutarIdempotente(
  evento: APIGatewayProxyEventV2,
  operacion: string,
  actor: string,
  accion: () => Promise<APIGatewayProxyResultV2>,
): Promise<APIGatewayProxyResultV2> {
  const clave = leerClave(evento);
  if (clave === undefined) {
    return accion();
  }
  if (!PATRON_UUID_V4.test(clave)) {
    return respuestaJson(400, { mensaje: 'Idempotency-Key debe ser un UUID v4' });
  }

  // El actor entra en el identificador: la misma clave de dos personas
  // distintas nunca colisiona ni deja ver la respuesta de otra.
  const idempotenciaId = sha256(`${operacion}|${actor}|${clave}`);
  const cuerpoHash = sha256(evento.body ?? '');
  const ahora = Math.floor(Date.now() / 1000);

  try {
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_IDEMPOTENCIA'],
        Item: {
          idempotenciaId,
          operacion,
          cuerpoHash,
          estado: 'en_proceso',
          iniciadaEn: ahora,
          expiraEn: ahora + VIDA_CLAVE_SEGUNDOS,
        },
        ConditionExpression: 'attribute_not_exists(idempotenciaId)',
      }),
    );
  } catch (error) {
    if (!esErrorCondicionFallida(error)) {
      throw error;
    }
    const previa = await documentoDynamoDB.send(
      new GetCommand({
        TableName: process.env['TABLA_IDEMPOTENCIA'],
        Key: { idempotenciaId },
        ConsistentRead: true,
      }),
    );
    const item = previa.Item;
    if (!item) {
      return respuestaJson(409, { mensaje: 'No se pudo procesar la solicitud, intenta de nuevo' });
    }
    if (item['cuerpoHash'] !== cuerpoHash) {
      return respuestaJson(409, {
        mensaje: 'Esta clave de idempotencia ya se usó con un contenido distinto',
      });
    }
    if (item['estado'] === 'completada') {
      return {
        statusCode: item['statusCode'] as number,
        headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
        body: item['respuesta'] as string,
      };
    }
    const iniciadaEn = typeof item['iniciadaEn'] === 'number' ? item['iniciadaEn'] : ahora;
    if (ahora - iniciadaEn <= UMBRAL_RECLAMACION_VENCIDA_SEGUNDOS) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
        body: JSON.stringify({ mensaje: 'La operación anterior sigue en proceso, espera unos segundos' }),
      };
    }
    try {
      await documentoDynamoDB.send(
        new UpdateCommand({
          TableName: process.env['TABLA_IDEMPOTENCIA'],
          Key: { idempotenciaId },
          UpdateExpression: 'SET iniciadaEn = :ahora',
          ConditionExpression: 'estado = :enProceso AND iniciadaEn = :vista',
          ExpressionAttributeValues: { ':ahora': ahora, ':enProceso': 'en_proceso', ':vista': iniciadaEn },
        }),
      );
    } catch (errorRetomar) {
      if (esErrorCondicionFallida(errorRetomar)) {
        return respuestaJson(409, { mensaje: 'La operación anterior sigue en proceso, espera unos segundos' });
      }
      throw errorRetomar;
    }
  }

  let respuesta: APIGatewayProxyResultV2;
  try {
    respuesta = await accion();
  } catch (error) {
    await liberarClave(idempotenciaId);
    throw error;
  }

  const resultado = typeof respuesta === 'string' ? { statusCode: 200, body: respuesta } : respuesta;
  const statusCode = resultado.statusCode ?? 200;
  if (statusCode < 200 || statusCode >= 300) {
    await liberarClave(idempotenciaId);
    return respuesta;
  }

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_IDEMPOTENCIA'],
        Key: { idempotenciaId },
        UpdateExpression: 'SET estado = :completada, statusCode = :statusCode, respuesta = :respuesta',
        ConditionExpression: 'estado = :enProceso',
        ExpressionAttributeValues: {
          ':completada': 'completada',
          ':enProceso': 'en_proceso',
          ':statusCode': statusCode,
          ':respuesta': resultado.body ?? '',
        },
      }),
    );
  } catch {
    // El efecto ya ocurrió: no se pierde la respuesta por no poder guardarla.
    // Un reintento volvería a ver la clave «en proceso» y luego la retomaría.
    console.error('No se pudo guardar la respuesta idempotente', { operacion });
  }
  return respuesta;
}
