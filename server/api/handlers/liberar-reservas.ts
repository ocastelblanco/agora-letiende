import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { SillasReservadasInsuficientesError, liberarSillas } from '../services/aforo';

type EstadoCompra =
  | 'iniciada'
  | 'esperando_comprobante'
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
  'en_revision',
];

/**
 * Consumidor de DynamoDB Streams de `agora-compras` — cuando el TTL borra
 * una reserva vencida, devuelve su aforo al evento (`tech-specs.md` §5.4
 * punto 4, roadmap #8). Streams garantiza entrega *at-least-once*, nunca
 * *exactly-once*: idempotente por diseño gracias a la `ConditionExpression`
 * de `liberarSillas`, así que un mismo registro entregado dos veces solo
 * falla la segunda vez (se ignora), en vez de inflar el aforo.
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

    if (
      typeof eventoId !== 'string' ||
      typeof cantidad !== 'number' ||
      typeof estado !== 'string' ||
      !(ESTADOS_QUE_RETIENEN_AFORO as readonly string[]).includes(estado)
    ) {
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
