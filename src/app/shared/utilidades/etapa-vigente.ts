import type { EtapaBoleteria } from '../../core/models/evento.model';

/**
 * Etapa vigente **solo para mostrar en pantalla** — mismo criterio que usa
 * `etapaVigente()` en el backend (`server/api/handlers/compras.ts`, primera
 * etapa ordenada cronológicamente por `cierraEn` que todavía no ha pasado;
 * `orden` es solo la posición manual del formulario de administración y no
 * necesariamente coincide con el orden real de cierre). El precio/total
 * real de una compra siempre lo calcula y devuelve el servidor
 * (`CLAUDE.md` §5 A08): este cálculo nunca se envía ni se acepta como el
 * precio final, es puramente de presentación.
 *
 * Antes vivía duplicada, idéntica, en `ComprarComponent` y
 * `VentaEfectivoComponent` (`TODO.md` Tarea 2) — se conserva el nombre
 * `etapaVigenteParaMostrar` ya usado en ambos para no romper su intención
 * ("solo para mostrar") al centralizarla aquí. `DetalleEventoComponent`
 * la consume además para distinguir la etapa vigente de las ya cerradas.
 */
export function etapaVigenteParaMostrar(etapas: EtapaBoleteria[]): EtapaBoleteria | null {
  const ahora = Date.now();
  const ordenadas = [...etapas].sort((a, b) => new Date(a.cierraEn).getTime() - new Date(b.cierraEn).getTime());
  return ordenadas.find((etapa) => new Date(etapa.cierraEn).getTime() > ahora) ?? null;
}
