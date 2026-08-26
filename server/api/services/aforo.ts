import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from './dynamodb';
import type { NotificacionBold } from './bold';

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
type EstadoConTtl = 'esperando_comprobante' | 'esperando_pago_bold';

async function buscarComprasVencidas(
  eventoId: string,
  estado: EstadoConTtl,
  ahoraEpoch: number,
): Promise<Record<string, unknown>[]> {
  try {
    const resultado = await documentoDynamoDB.send(
      new QueryCommand({
        TableName: process.env['TABLA_COMPRAS'],
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :estado AND expiraEn < :ahora',
        ExpressionAttributeValues: {
          ':eventoId': eventoId,
          ':estado': estado,
          ':ahora': ahoraEpoch,
        },
      }),
    );
    return resultado.Items ?? [];
  } catch {
    return [];
  }
}

async function expirarYLiberar(
  eventoId: string,
  compra: Record<string, unknown>,
  estadoOrigen: EstadoConTtl,
): Promise<void> {
  const compraId = compra['compraId'];
  const cantidadCompra = compra['cantidad'];
  if (typeof compraId !== 'string' || typeof cantidadCompra !== 'number') {
    return;
  }

  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Key: { compraId },
        UpdateExpression: 'SET estado = :expirada',
        ConditionExpression: 'estado = :estadoOrigen',
        ExpressionAttributeValues: { ':expirada': 'expirada', ':estadoOrigen': estadoOrigen },
      }),
    );
  } catch {
    // Condición fallida (alguien más ya la procesó) o cualquier otro error:
    // se ignora esta compra puntual y se sigue con las demás.
    return;
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

const BASE_URL_RECONCILIACION_BOLD = 'https://integrations.api.bold.co';

/**
 * Bold (roadmap #19, Sub-tarea 1, decisión 4 del plan aprobado en
 * `.omc/plans/bold-pagos.md`) — antes de expirar una compra
 * `esperando_pago_bold`, consulta UNA VEZ el endpoint de reconciliación de
 * respaldo de Bold para confirmar que de verdad no hubo un pago aprobado
 * que el webhook (`handlers/bold-webhook.ts`) no logró entregar (reintentos
 * agotados, falla de red, etc.).
 *
 * **Hallazgo que cierra el bloqueo que el plan anticipaba** ("¿Ágora tiene
 * el `payment_id` de Bold antes de que llegue el webhook?"): verificado hoy
 * (25/08/2026) contra la documentación oficial
 * (https://developers.bold.co/webhook) — el propio endpoint acepta
 * consultar por la REFERENCIA EXTERNA en vez del `payment_id` de Bold, con
 * el parámetro `is_external_reference=true`. La referencia externa es
 * exactamente el `compraId` que Ágora ya le envía a Bold como
 * `data-order-id` al renderizar el botón (`firmarBoton`, `services/bold.ts`)
 * — Ágora nunca necesita guardar el `payment_id` de Bold de antemano, el
 * bloqueo no existe.
 *
 * **Decisión de diseño explícita, más allá de lo que el plan detalló** (se
 * documenta aquí porque es una bifurcación real, no algo que deba asumirse
 * en silencio): si la reconciliación encuentra un `SALE_APPROVED`, esta
 * función NO completa la aprobación (no llama `confirmarSillas`/
 * `emitirBoletas`/notifica al cliente desde aquí) — hacerlo duplicaría la
 * lógica de negocio completa de `handlers/bold-webhook.ts` dentro de
 * `aforo.ts`, un servicio que hoy solo conoce DynamoDB, no boletería ni
 * notificaciones (acoplamiento nuevo no pedido explícitamente por la
 * tarea). En vez de eso, deja la compra tal cual — sin expirarla — para que
 * el reintento del webhook de Bold (hasta 24 h) la resuelva por el camino
 * normal la próxima vez que llegue. Esto ya mitiga el riesgo real de la
 * decisión 4 (perder una venta real por expiración prematura) sin inventar
 * una segunda vía de aprobación paralela.
 *
 * Si la consulta misma falla (red, Bold caído, credenciales), también se
 * trata como "no seguro expirar" — más conservador que arriesgar una venta
 * real por un fallo transitorio: el TTL real de DynamoDB (~48 h,
 * `tech-specs.md` §5.4 punto 4) sigue siendo la red de seguridad final si
 * esto queda colgado más de lo esperado.
 */
async function esSeguroExpirarReservaBold(compraId: string): Promise<boolean> {
  try {
    const llaveIdentidad = process.env['BOLD_LLAVE_IDENTIDAD'] ?? '';
    const url = `${BASE_URL_RECONCILIACION_BOLD}/payments/webhook/notifications/${encodeURIComponent(compraId)}?is_external_reference=true`;
    // Timeout corto y explícito (hallazgo de revisión de seguridad,
    // 25/08/2026): esta consulta ocurre en el camino síncrono de
    // reservarSillas() — sin límite propio, una API de Bold lenta o caída
    // podría colgar la petición hasta el timeout del Lambda completo (10s,
    // provider.timeout), bloqueando la compra de OTRO cliente que solo
    // estaba compitiendo por la misma silla. Es un chequeo best-effort (el
    // catch de abajo ya trata cualquier fallo como "no seguro expirar"), así
    // que 3s deja margen de sobra sin arriesgar el resto de la función.
    const respuesta = await fetch(url, {
      headers: { Authorization: `x-api-key ${llaveIdentidad}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!respuesta.ok) {
      return false;
    }
    const cuerpo = (await respuesta.json()) as { notifications?: Pick<NotificacionBold, 'type'>[] };
    const hayPagoAprobado = (cuerpo.notifications ?? []).some(
      (notificacion) => notificacion.type === 'SALE_APPROVED',
    );
    return !hayPagoAprobado;
  } catch {
    return false;
  }
}

/**
 * Libera activamente las reservas de ESTE evento cuyo `expiraEn` ya pasó,
 * en los dos estados que lo usan como TTL de negocio: `esperando_comprobante`
 * (transferencia manual) y `esperando_pago_bold` (roadmap #19, Sub-tarea 1
 * — reconciliada contra Bold antes de expirar, ver
 * `esSeguroExpirarReservaBold`). Sin duplicar el resto de la función: ambas
 * ramas comparten `buscarComprasVencidas`/`expirarYLiberar`.
 */
async function liberarReservasVencidas(eventoId: string): Promise<void> {
  const ahoraEpoch = Math.floor(Date.now() / 1000);

  const vencidasComprobante = await buscarComprasVencidas(eventoId, 'esperando_comprobante', ahoraEpoch);
  for (const compra of vencidasComprobante) {
    await expirarYLiberar(eventoId, compra, 'esperando_comprobante');
  }

  // Verificaciones en paralelo, no secuenciales (hallazgo de revisión de
  // seguridad, 25/08/2026): con el `for...await` original, N reservas de
  // Bold vencidas del mismo evento encadenaban N llamadas de red a Bold una
  // tras otra — el timeout de cada una (arriba) ya no bastaba para acotar
  // el tiempo total si había varias a la vez, en el mismo camino síncrono
  // que bloquea la compra de otro cliente.
  const vencidasBold = await buscarComprasVencidas(eventoId, 'esperando_pago_bold', ahoraEpoch);
  await Promise.allSettled(
    vencidasBold.map(async (compra) => {
      const compraId = compra['compraId'];
      if (typeof compraId !== 'string') {
        return;
      }
      if (!(await esSeguroExpirarReservaBold(compraId))) {
        return;
      }
      await expirarYLiberar(eventoId, compra, 'esperando_pago_bold');
    }),
  );
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
