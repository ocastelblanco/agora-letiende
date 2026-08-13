import type { EstadoEvento } from '../../core/models/evento.model';

/**
 * Texto del banner diagonal AGOTADO/CANCELADO para un evento, o `null` si no
 * aplica (`borrador`/`publicado`/`finalizado`) — compartido entre
 * `DetalleEventoComponent` y `CarteleraComponent` (`docs/plan-pre-producción.md` T3).
 */
export function avisoEstadoEvento(estado: EstadoEvento): 'AGOTADO' | 'CANCELADO' | null {
  if (estado === 'agotado') {
    return 'AGOTADO';
  }
  if (estado === 'cancelado') {
    return 'CANCELADO';
  }
  return null;
}
