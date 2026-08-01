import { Pipe, PipeTransform } from '@angular/core';

const FORMATO_COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/**
 * Formatea un valor en pesos colombianos como "$45.000", sin depender de
 * CurrencyPipe/DecimalPipe (que obligan a registrar el locale es-CO y
 * complican el bundle SSR — ver CLAUDE.md §4 y MEMORY.md §7).
 */
@Pipe({
  name: 'precio',
})
export class PrecioPipe implements PipeTransform {
  transform(valor: number): string {
    return `$${FORMATO_COP.format(valor)}`;
  }
}
