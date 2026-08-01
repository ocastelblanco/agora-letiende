import { definePreset, palette } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Preset de tema propio para PrimeNG, mapeado a la paleta de Le Tiende
 * (CLAUDE.md §4). Nunca se usa un tema por defecto de PrimeNG sin adaptar
 * (ADR-006 en docs/MEMORY.md).
 */
export const LeTiendePreset = definePreset(Aura, {
  semantic: {
    primary: palette('#230c00'),
    colorScheme: {
      light: {
        primary: {
          color: '#230c00',
          contrastColor: '#ffe7b3',
          hoverColor: '#3a1900',
          activeColor: '#180800',
        },
        surface: {
          0: '#ffffff',
          50: '#fff8f1',
        },
      },
    },
  },
});
