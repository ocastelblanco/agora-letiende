import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from './dynamodb';

/**
 * Las tres primitivas de escritura condicional del ciclo de vida del aforo
 * (`tech-specs.md` §5.4) — ninguna lee el ítem del evento antes de escribir;
 * el aforo del teatro es físico y una lectura-luego-escritura produce
 * sobreventa bajo concurrencia (`CLAUDE.md` §5, A04).
 */

export class ErrorAforo extends Error {}

/** La condición combinada de `reservarSillas` falló porque el evento no está `publicado`. */
export class EventoNoPublicadoError extends ErrorAforo {
  constructor() {
    super('El evento no está publicado');
  }
}

/** La condición combinada de `reservarSillas` falló por falta de sillas disponibles. */
export class AforoInsuficienteError extends ErrorAforo {
  constructor(public readonly sillasDisponibles: number) {
    super(`Aforo insuficiente: solo quedan ${sillasDisponibles} sillas disponibles`);
  }
}

/** `confirmarSillas`/`liberarSillas` fallaron porque `sillasReservadas` ya no alcanza. */
export class SillasReservadasInsuficientesError extends ErrorAforo {
  constructor() {
    super('sillasReservadas insuficiente para completar la operación');
  }
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * Tras un fallo de la condición combinada de `reservarSillas`, clasifica el
 * motivo con una lectura **posterior** al intento de escritura — nunca
 * antes, así que no reintroduce la decisión de lectura-luego-escritura que
 * la propia función evita. Es solo para producir un error distinguible que
 * el futuro `handlers/compras.ts` (roadmap #9) pueda traducir a un 409 con
 * mensaje claro, no para decidir si la reserva procede.
 */
async function clasificarFalloReserva(eventoId: string): Promise<ErrorAforo> {
  try {
    const resultado = await documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
    );
    const item = resultado.Item;
    if (item?.['estado'] !== 'publicado') {
      return new EventoNoPublicadoError();
    }
    const disponibles =
      typeof item['sillasDisponibles'] === 'number' ? item['sillasDisponibles'] : 0;
    return new AforoInsuficienteError(disponibles);
  } catch {
    return new ErrorAforo('No fue posible reservar las sillas solicitadas');
  }
}

/**
 * Reserva `cantidad` sillas al iniciar una compra (`tech-specs.md` §5.4
 * paso 1). Única escritura condicional: resta de `sillasDisponibles` y
 * suma a `sillasReservadas` a la vez, solo si hay aforo suficiente y el
 * evento está `publicado`.
 */
export async function reservarSillas(eventoId: string, cantidad: number): Promise<void> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        UpdateExpression:
          'SET sillasDisponibles = sillasDisponibles - :n, sillasReservadas = sillasReservadas + :n',
        ConditionExpression: 'sillasDisponibles >= :n AND estado = :publicado',
        ExpressionAttributeValues: { ':n': cantidad, ':publicado': 'publicado' },
      }),
    );
  } catch (error) {
    if (!esErrorCondicionFallida(error)) {
      throw error;
    }
    throw await clasificarFalloReserva(eventoId);
  }
}

/**
 * Confirma `cantidad` sillas reservadas (aprobación del comprobante o venta
 * en efectivo, `tech-specs.md` §5.4 paso 2) — pasan de reservadas a
 * vendidas. Si el aforo del evento ya está en cero, además transiciona
 * `estado` a `agotado` con una segunda escritura condicional, best-effort:
 * si esa condición no aplica (todavía hay sillas, o ya estaba `agotado`),
 * se ignora — es el caso esperado la mayoría de las veces, no un error.
 */
export async function confirmarSillas(eventoId: string, cantidad: number): Promise<void> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        UpdateExpression: 'SET sillasReservadas = sillasReservadas - :n',
        ConditionExpression: 'sillasReservadas >= :n',
        ExpressionAttributeValues: { ':n': cantidad },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      throw new SillasReservadasInsuficientesError();
    }
    throw error;
  }

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        UpdateExpression: 'SET estado = :agotado',
        ConditionExpression: 'sillasDisponibles = :cero AND estado = :publicado',
        ExpressionAttributeValues: { ':agotado': 'agotado', ':cero': 0, ':publicado': 'publicado' },
      }),
    );
  } catch (error) {
    if (!esErrorCondicionFallida(error)) {
      throw error;
    }
  }
}

/**
 * Libera `cantidad` sillas reservadas que no se confirmaron (rechazo del
 * comprobante o vencimiento del plazo, `tech-specs.md` §5.4 paso 3). La
 * condición sobre `sillasReservadas` —no una simple suma— es lo que hace
 * segura la operación ante un registro de Stream entregado dos veces
 * (`handlers/liberar-reservas.ts`): un reintento no puede restar por debajo
 * de lo real, así que la condición vuelve a fallar en vez de inflar el
 * aforo.
 */
export async function liberarSillas(eventoId: string, cantidad: number): Promise<void> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        UpdateExpression:
          'SET sillasDisponibles = sillasDisponibles + :n, sillasReservadas = sillasReservadas - :n',
        ConditionExpression: 'sillasReservadas >= :n',
        ExpressionAttributeValues: { ':n': cantidad },
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      throw new SillasReservadasInsuficientesError();
    }
    throw error;
  }
}
