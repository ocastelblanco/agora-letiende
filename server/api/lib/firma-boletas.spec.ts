import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { firmarCodigoBoleta, verificarFirmaBoleta } from './firma-boletas';
import { SecretoNoConfigurado } from './secretos';

beforeEach(() => {
  process.env['SECRETO_FIRMA_BOLETAS'] = 'secreto-de-prueba';
});

describe('firmarCodigoBoleta', () => {
  it('produce una firma hexadecimal de 16 caracteres (64 bits)', () => {
    const firma = firmarCodigoBoleta('boleta-1');
    expect(firma).toMatch(/^[0-9a-f]{16}$/);
  });

  it('es determinística: el mismo boletaId produce siempre la misma firma', () => {
    expect(firmarCodigoBoleta('boleta-1')).toBe(firmarCodigoBoleta('boleta-1'));
  });

  it('produce firmas distintas para boletaId distintos', () => {
    expect(firmarCodigoBoleta('boleta-1')).not.toBe(firmarCodigoBoleta('boleta-2'));
  });

  it('produce firmas distintas con secretos distintos (llave predecible = boletas falsificables)', () => {
    const firma = firmarCodigoBoleta('boleta-1');
    process.env['SECRETO_FIRMA_BOLETAS'] = 'otro-secreto';
    expect(firmarCodigoBoleta('boleta-1')).not.toBe(firma);
  });
});

describe('verificarFirmaBoleta', () => {
  it('acepta la firma correcta', () => {
    const firma = firmarCodigoBoleta('boleta-1');
    expect(verificarFirmaBoleta('boleta-1', firma)).toBe(true);
  });

  it('rechaza una firma de otro boletaId', () => {
    const firma = firmarCodigoBoleta('boleta-2');
    expect(verificarFirmaBoleta('boleta-1', firma)).toBe(false);
  });

  it('rechaza una firma alterada de un solo carácter', () => {
    const firma = firmarCodigoBoleta('boleta-1');
    const alterada = firma.slice(0, -1) + (firma.at(-1) === '0' ? '1' : '0');
    expect(verificarFirmaBoleta('boleta-1', alterada)).toBe(false);
  });

  it('rechaza una firma de longitud distinta sin lanzar', () => {
    expect(() => verificarFirmaBoleta('boleta-1', 'corta')).not.toThrow();
    expect(verificarFirmaBoleta('boleta-1', 'corta')).toBe(false);
  });

  it('rechaza una firma vacía', () => {
    expect(verificarFirmaBoleta('boleta-1', '')).toBe(false);
  });
});

describe('sin SECRETO_FIRMA_BOLETAS', () => {
  it.each([undefined, ''])('con %j lanza SecretoNoConfigurado al firmar y al verificar, nunca acepta la firma', (valor) => {
    const firmaConLlaveVacia = createHmac('sha256', '').update('boleta-1').digest('hex').slice(0, 16);
    if (valor === undefined) {
      delete process.env['SECRETO_FIRMA_BOLETAS'];
    } else {
      process.env['SECRETO_FIRMA_BOLETAS'] = valor;
    }

    expect(() => firmarCodigoBoleta('boleta-1')).toThrow(SecretoNoConfigurado);
    expect(() => verificarFirmaBoleta('boleta-1', firmaConLlaveVacia)).toThrow(SecretoNoConfigurado);
  });
});
