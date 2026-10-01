import { describe, expect, it } from 'vitest';
import { GeneradorClaveIdempotencia } from './clave-idempotencia';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('GeneradorClaveIdempotencia', () => {
  it('genera un UUID v4 y lo reutiliza para el mismo contenido (reintento)', () => {
    const generador = new GeneradorClaveIdempotencia();
    const primera = generador.obtener({ cantidad: 2 });

    expect(primera).toMatch(UUID_V4);
    expect(generador.obtener({ cantidad: 2 })).toBe(primera);
  });

  it('genera otra clave si el contenido cambió', () => {
    const generador = new GeneradorClaveIdempotencia();
    const primera = generador.obtener({ cantidad: 2 });

    expect(generador.obtener({ cantidad: 3 })).not.toBe(primera);
  });

  it('renovar() descarta la clave: la siguiente operación es nueva', () => {
    const generador = new GeneradorClaveIdempotencia();
    const primera = generador.obtener({ cantidad: 2 });
    generador.renovar();

    expect(generador.obtener({ cantidad: 2 })).not.toBe(primera);
  });
});
