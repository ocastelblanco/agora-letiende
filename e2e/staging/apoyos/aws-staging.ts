import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * Acceso directo a DynamoDB de STAGING para la suite `e2e/staging/` (roadmap #30,
 * ADR-015): siembra un evento temporal, lee lo que el backend real escribió y lo
 * limpia al terminar. Las tablas están fijadas en código a `-staging`: nada de
 * lo que hay aquí puede apuntar a producción, ni por error de configuración.
 *
 * Permisos mínimos que necesita el usuario IAM de CI (sin `Scan`, sin otras
 * tablas): PutItem, GetItem, DeleteItem, Query sobre eventos/compras/boletas de
 * staging y sus índices (`docs/tareas-a-realizar.md`).
 */
const REGION = 'us-east-1';
export const TABLA_EVENTOS = 'agora-eventos-staging';
export const TABLA_COMPRAS = 'agora-compras-staging';
export const TABLA_BOLETAS = 'agora-boletas-staging';

const DIA_MS = 24 * 60 * 60 * 1000;
const PRECIO_ETAPA = 30_000;
const SILLAS_TOTALES = 10;

const cliente = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

export interface EventoSembrado {
  eventoId: string;
  slug: string;
  nombre: string;
  precio: number;
  sillasTotales: number;
}

type Item = Record<string, unknown>;

/**
 * Crea un evento publicado que cobra solo con Bold (un único medio de pago
 * público, así que el formulario no muestra selector). Escribe directo en la
 * tabla: no pasa por el backend ni por Google Calendar. El slug lleva el prefijo
 * `e2e-` para reconocerlo a simple vista en staging.
 */
export async function sembrarEventoBold(): Promise<EventoSembrado> {
  const ahora = Date.now();
  const eventoId = randomUUID();
  const slug = `e2e-bold-${ahora.toString(36)}-${eventoId.slice(0, 4)}`;
  const nombre = 'E2E Bold (prueba automática)';
  await cliente.send(
    new PutCommand({
      TableName: TABLA_EVENTOS,
      ConditionExpression: 'attribute_not_exists(eventoId)',
      Item: {
        eventoId,
        slug,
        nombre,
        descripcion: 'Evento temporal creado y borrado por las pruebas automáticas de Playwright.',
        fechaHora: new Date(ahora + 10 * DIA_MS).toISOString(),
        duracionMinutos: 180,
        administradoPorLeTiende: true,
        sillasTotales: SILLAS_TOTALES,
        sillasDisponibles: SILLAS_TOTALES,
        sillasReservadas: 0,
        etapas: [
          {
            etapaId: randomUUID(),
            nombre: 'Preventa',
            precio: PRECIO_ETAPA,
            cierraEn: new Date(ahora + 5 * DIA_MS).toISOString(),
            orden: 1,
          },
        ],
        maxBoletasPorCompra: 2,
        mediosPago: ['bold'],
        plazoComprobanteMinutos: 10,
        productores: [],
        porteros: [],
        estado: 'publicado',
        creadoEn: new Date(ahora).toISOString(),
        actualizadoEn: new Date(ahora).toISOString(),
      },
    }),
  );
  return { eventoId, slug, nombre, precio: PRECIO_ETAPA, sillasTotales: SILLAS_TOTALES };
}

async function consultarTodo(parametros: ConstructorParameters<typeof QueryCommand>[0]): Promise<Item[]> {
  const items: Item[] = [];
  let llave: Record<string, unknown> | undefined;
  do {
    const respuesta = await cliente.send(new QueryCommand({ ...parametros, ExclusiveStartKey: llave }));
    items.push(...((respuesta.Items ?? []) as Item[]));
    llave = respuesta.LastEvaluatedKey;
  } while (llave);
  return items;
}

export function leerCompras(eventoId: string): Promise<Item[]> {
  return consultarTodo({
    TableName: TABLA_COMPRAS,
    IndexName: 'eventoId-creadaEn-index',
    KeyConditionExpression: 'eventoId = :e',
    ExpressionAttributeValues: { ':e': eventoId },
  });
}

export function leerBoletas(eventoId: string): Promise<Item[]> {
  return consultarTodo({
    TableName: TABLA_BOLETAS,
    IndexName: 'eventoId-estado-index',
    KeyConditionExpression: 'eventoId = :e',
    ExpressionAttributeValues: { ':e': eventoId },
  });
}

export async function leerEvento(eventoId: string): Promise<Item | undefined> {
  const respuesta = await cliente.send(new GetCommand({ TableName: TABLA_EVENTOS, Key: { eventoId } }));
  return respuesta.Item as Item | undefined;
}

async function borrarPorLotes(tabla: string, llaves: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < llaves.length; i += 25) {
    const lote = llaves.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    await cliente.send(new BatchWriteCommand({ RequestItems: { [tabla]: lote } }));
  }
}

/**
 * Borra el evento sembrado y todo lo que el backend creó a partir de él (sus
 * compras y sus boletas). Es idempotente: se puede llamar de nuevo sin efecto.
 * Lo único que queda es el rastro de la tabla de auditoría, que es de solo
 * escritura por diseño (`CLAUDE.md` §5, A09) y tampoco está en los permisos.
 */
export async function limpiarEvento(eventoId: string): Promise<{ compras: number; boletas: number }> {
  const boletas = await leerBoletas(eventoId);
  const compras = await leerCompras(eventoId);
  await borrarPorLotes(
    TABLA_BOLETAS,
    boletas.map((b) => ({ boletaId: b['boletaId'] })),
  );
  await borrarPorLotes(
    TABLA_COMPRAS,
    compras.map((c) => ({ compraId: c['compraId'] })),
  );
  await cliente.send(new DeleteCommand({ TableName: TABLA_EVENTOS, Key: { eventoId } }));
  return { compras: compras.length, boletas: boletas.length };
}
