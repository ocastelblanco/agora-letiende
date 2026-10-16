import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord, DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { SillasReservadasInsuficientesError, liberarSillas } from '../services/aforo';

// 'esperando_pago_bold' (roadmap #19, Sub-tarea 1) — agregado en el mismo
// cambio que handlers/compras.ts (única otra copia local de este tipo en el
// backend, verificado con `grep -rn "type EstadoCompra" server/api`): una
// compra en este estado también tiene sillas reservadas hasta que el
// webhook de Bold la resuelva (handlers/bold-webhook.ts).
type EstadoCompra =
  | 'iniciada'
  | 'esperando_comprobante'
  | 'esperando_pago_bold'
  | 'en_revision'
  | 'aprobada'
  | 'rechazada'
  | 'expirada';

// Solo estos estados todavía retienen aforo reservado cuando el TTL borra la
// compra — aprobada/rechazada/expirada ya liberaron o confirmaron su aforo
// por otro camino (tech-specs.md §5.4).
const ESTADOS_QUE_RETIENEN_AFORO: readonly EstadoCompra[] = [
  'iniciada',
  'esperando_comprobante',
  'esperando_pago_bold',
  'en_revision',
];

/** El borrado lo hizo el TTL de DynamoDB, no la aplicación ni una persona. */
function esBorradoPorTtl(registro: DynamoDBRecord): boolean {
  return (
    registro.userIdentity?.type === 'Service' && registro.userIdentity?.principalId === 'dynamodb.amazonaws.com'
  );
}

/**
 * El TTL de `agora-compras` borra el ítem completo, con los datos del cliente y
 * la referencia que usa Bold. Incidente del 16/10/2026: el webhook de Bold
 * estaba inactivo, el TTL borró una compra pagada a los 20 minutos y no quedó
 * ningún rastro (`CLAUDE.md` §5, A09: el registro de una transacción con
 * consecuencia económica no se borra nunca). Se vuelve a escribir la compra
 * archivada: sin `expiraEn` (el TTL no la vuelve a tocar) y en `expirada` si
 * todavía retenía aforo. Si el aviso de Bold llega después, el webhook la
 * encuentra y puede aprobarla (`handlers/bold-webhook.ts`).
 *
 * `attribute_not_exists` hace la escritura idempotente: un registro de Stream
 * duplicado (*at-least-once*) falla aquí y no devuelve el aforo dos veces.
 * Devuelve `false` si la compra ya estaba archivada.
 */
async function archivarCompraVencida(compra: Record<string, unknown>, retieneAforo: boolean): Promise<boolean> {
  const archivada: Record<string, unknown> = { ...compra, archivadaPorTtlEn: new Date().toISOString() };
  delete archivada['expiraEn'];
  if (retieneAforo) {
    archivada['estadoAlExpirar'] = compra['estado'];
    archivada['estado'] = 'expirada';
  }
  try {
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Item: archivada,
        ConditionExpression: 'attribute_not_exists(compraId)',
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

/**
 * Consumidor de DynamoDB Streams de `agora-compras` — cuando el TTL borra
 * una reserva vencida, devuelve su aforo al evento (`tech-specs.md` §5.4
 * punto 4, roadmap #8) y archiva la compra (`archivarCompraVencida`).
 * Streams garantiza entrega *at-least-once*, nunca *exactly-once*: en un
 * borrado por TTL, la escritura condicional del archivo es la que impide
 * devolver el aforo dos veces; la `ConditionExpression` de `liberarSillas`
 * sigue como segunda guarda.
 */
export const handler: DynamoDBStreamHandler = async (
  evento: DynamoDBStreamEvent,
): Promise<void> => {
  for (const registro of evento.Records) {
    // Solo interesa el borrado por TTL — INSERT/MODIFY son el resto del
    // ciclo de vida de la compra, manejado directamente por sus endpoints.
    if (registro.eventName !== 'REMOVE') {
      continue;
    }

    const imagenAnterior = registro.dynamodb?.OldImage;
    if (!imagenAnterior) {
      continue;
    }

    const compra = unmarshall(imagenAnterior as unknown as Record<string, AttributeValue>) as Record<
      string,
      unknown
    >;

    const eventoId = compra['eventoId'];
    const cantidad = compra['cantidad'];
    const estado = compra['estado'];
    const retieneAforo =
      typeof estado === 'string' && (ESTADOS_QUE_RETIENEN_AFORO as readonly string[]).includes(estado);

    if (esBorradoPorTtl(registro) && typeof compra['compraId'] === 'string') {
      if (!(await archivarCompraVencida(compra, retieneAforo))) {
        continue;
      }
      if (estado === 'esperando_pago_bold') {
        // Ni aprobada ni rechazada por Bold dentro del plazo: o el cliente no
        // pagó, o el aviso de Bold no llegó. Sin datos del cliente (A09).
        console.error('Compra de Bold expirada sin respuesta de Bold; quedó archivada', {
          compraId: compra['compraId'],
          eventoId,
        });
      }
    }

    if (typeof eventoId !== 'string' || typeof cantidad !== 'number' || !retieneAforo) {
      continue;
    }

    try {
      await liberarSillas(eventoId, cantidad);
    } catch (error) {
      if (!(error instanceof SillasReservadasInsuficientesError)) {
        throw error;
      }
      // Registro de Stream duplicado (at-least-once): ya se liberó antes.
    }
  }
};
