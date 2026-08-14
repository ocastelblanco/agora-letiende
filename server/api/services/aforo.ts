import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

async function intentarReservar(eventoId: string, cantidad: number): Promise<void> {
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
}

/**
 * Libera activamente las reservas de ESTE evento cuyo `expiraEn` ya pasó,
 * sin esperar al TTL de DynamoDB — hotfix pre-producción (14/08/2026): el
 * TTL no ofrece ninguna garantía de tiempo ("típicamente 48 horas"), pero el
 * SLA de negocio exige que competir por la última silla nunca espere más de
 * 15 minutos a una reserva ya vencida (decisión tomada con el usuario,
 * `AskUserQuestion`: liberación activa solo al competir por cupo, sin
 * infraestructura nueva, en vez de un barrido programado). Se invoca
 * exclusivamente desde `reservarSillas()` cuando la escritura condicional ya
 * falló — nunca en el camino feliz, así que no le agrega costo a una
 * reserva que de todas formas iba a tener éxito.
 *
 * Cada compra vencida se transiciona a `expirada` con su propia escritura
 * condicional **antes** de liberar su aforo — evita liberar dos veces la
 * misma reserva si el TTL real la borra mientras tanto (el consumidor de
 * Streams de `liberar-reservas.ts` ignora `expirada`, no está en
 * `ESTADOS_QUE_RETIENEN_AFORO`) o si dos reservas compitiendo la reclaman a
 * la vez. Best-effort de principio a fin: cualquier fallo aquí nunca debe
 * impedir el reintento de la reserva que sí importa — el TTL real sigue
 * siendo la red de seguridad final.
 */
async function liberarReservasVencidas(eventoId: string): Promise<void> {
  const ahoraEpoch = Math.floor(Date.now() / 1000);

  let vencidas: Record<string, unknown>[];
  try {
    const resultado = await documentoDynamoDB.send(
      new QueryCommand({
        TableName: process.env['TABLA_COMPRAS'],
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :esperando AND expiraEn < :ahora',
        ExpressionAttributeValues: {
          ':eventoId': eventoId,
          ':esperando': 'esperando_comprobante',
          ':ahora': ahoraEpoch,
        },
      }),
    );
    vencidas = resultado.Items ?? [];
  } catch {
    return;
  }

  for (const compra of vencidas) {
    const compraId = compra['compraId'];
    const cantidadCompra = compra['cantidad'];
    if (typeof compraId !== 'string' || typeof cantidadCompra !== 'number') {
      continue;
    }

    try {
      await documentoDynamoDB.send(
        new UpdateCommand({
          TableName: process.env['TABLA_COMPRAS'],
          Key: { compraId },
          UpdateExpression: 'SET estado = :expirada',
          ConditionExpression: 'estado = :esperando',
          ExpressionAttributeValues: { ':expirada': 'expirada', ':esperando': 'esperando_comprobante' },
        }),
      );
    } catch {
      // Condición fallida (alguien más ya la procesó) o cualquier otro
      // error: se ignora esta compra puntual y se sigue con las demás.
      continue;
    }

    try {
      await liberarSillas(eventoId, cantidadCompra);
    } catch {
      // Best-effort — si esto falla, el TTL real de esa compra la recupera
      // más adelante (su estado ya no retiene aforo según liberar-reservas.ts,
      // así que ese camino tampoco duplicaría la liberación si llegara a
      // tener éxito después).
    }
  }
}

/**
 * Reserva `cantidad` sillas al iniciar una compra (`tech-specs.md` §5.4
 * paso 1). Única escritura condicional: resta de `sillasDisponibles` y
 * suma a `sillasReservadas` a la vez, solo si hay aforo suficiente y el
 * evento está `publicado`. Si la primera escritura falla, libera
 * activamente las reservas vencidas de este evento (`liberarReservasVencidas`)
 * y reintenta una sola vez antes de clasificar el fallo como definitivo.
 */
export async function reservarSillas(eventoId: string, cantidad: number): Promise<void> {
  try {
    await intentarReservar(eventoId, cantidad);
    return;
  } catch (error) {
    if (!esErrorCondicionFallida(error)) {
      throw error;
    }
  }

  await liberarReservasVencidas(eventoId);

  try {
    await intentarReservar(eventoId, cantidad);
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
