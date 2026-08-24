import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';

/** Los únicos campos que la vigencia de un evento necesita leer. */
export interface EventoParaVigencia {
  fechaHora: string;
  etapas: { cierraEn: string }[];
}

const ESTADOS_QUE_PUEDEN_VENCER = new Set(['publicado', 'agotado', 'cancelado']);

/**
 * Fin real de un evento: el más tardío entre su `fechaHora` y el cierre de
 * su etapa que más tarde cierra (por `cierraEn`, nunca por `orden` — mismo
 * criterio que `etapaVigente()` en `handlers/compras.ts`). Un evento sin
 * etapas (v2, roadmap #24 — boletería opcional) no tiene ningún cierre que
 * considerar: su vigencia depende solo de `fechaHora`.
 */
function finDeVigencia(evento: EventoParaVigencia): number {
  const finFecha = new Date(evento.fechaHora).getTime();
  if (evento.etapas.length === 0) {
    return finFecha;
  }
  const finEtapas = Math.max(...evento.etapas.map((etapa) => new Date(etapa.cierraEn).getTime()));
  return Math.max(finFecha, finEtapas);
}

/**
 * Un evento deja de estar vigente cuando TANTO su fecha como el cierre de su
 * última etapa ya pasaron — equivalente a decir que sigue vigente mientras
 * cualquiera de los dos todavía no pase (hotfixes pre-producción: "cuando ya
 * pasaron la fecha del evento y la fecha límite de la última etapa").
 */
export function haFinalizadoPorVigencia(evento: EventoParaVigencia, ahora: Date): boolean {
  return finDeVigencia(evento) <= ahora.getTime();
}

/**
 * Estado "efectivo" de un evento para decidir visibilidad/venta: si el
 * estado persistido todavía puede vencer (`publicado`/`agotado`/`cancelado`)
 * y su vigencia ya terminó, se trata como `finalizado` aunque el campo
 * `estado` en DynamoDB no lo refleje todavía — mismo principio que el TTL de
 * reservas (`CLAUDE.md` §7: "el TTL no puede ser el mecanismo que hace
 * cumplir la expiración... la lógica de negocio debe tratar como expirada
 * toda reserva cuyo `expiraEn` ya pasó, aunque el ítem siga existiendo").
 * `borrador`/`finalizado` nunca cambian por este cálculo: un borrador nunca
 * fue público, y un evento ya finalizado no "revive".
 */
export function estadoEfectivo(
  evento: EventoParaVigencia & { estado: string },
  ahora: Date,
): string {
  return ESTADOS_QUE_PUEDEN_VENCER.has(evento.estado) && haFinalizadoPorVigencia(evento, ahora)
    ? 'finalizado'
    : evento.estado;
}

/**
 * Persiste `estado = 'finalizado'` cuando la vigencia ya terminó, como
 * efecto secundario best-effort de un GET/POST que de todas formas ya leyó
 * el evento — decisión explícita (no una Lambda programada, `docs/MEMORY.md`
 * sesión de hotfixes pre-producción): sin infraestructura nueva, la
 * visibilidad real la sigue garantizando `estadoEfectivo()` en cada lectura,
 * este `UpdateItem` solo mantiene el dato en la base de datos al día para
 * quien lo lea directamente (reportes, panel de administración) — sin
 * garantía de que ocurra de inmediato para un evento que nadie visita.
 * `ConditionExpression` sobre el `estado` ya leído: si otra invocación
 * concurrente ya lo cambió (a `finalizado` o a cualquier otra cosa), esta
 * escritura simplemente no aplica — nunca se relee ni se reintenta, el
 * mismo criterio "silenciar el fallo de condición" que ya usa
 * `confirmarSillas()` para su transición automática a `agotado`.
 */
export async function finalizarSiVencido(
  tablaEventos: string | undefined,
  eventoId: string,
  estadoActual: string,
): Promise<void> {
  try {
    await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: tablaEventos,
        Key: { eventoId },
        UpdateExpression: 'SET estado = :finalizado',
        ConditionExpression: 'estado = :estadoActual',
        ExpressionAttributeValues: { ':finalizado': 'finalizado', ':estadoActual': estadoActual },
      }),
    );
  } catch {
    // Best-effort: una condición fallida (alguien más ya lo cambió) o
    // cualquier otro error de esta escritura nunca debe romper la lectura
    // que la disparó — la visibilidad ya la decidió `estadoEfectivo()`.
  }
}
