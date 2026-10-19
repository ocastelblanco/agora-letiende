import { CARTA_PUBLICADA, cartaVisibleEnHost, esEmbebido } from './embebido.service';

/**
 * Solo se prueba `esEmbebido()` como función pura — toda la lógica real
 * vive ahí. Probar la clase `EmbebidoService` con TestBed requeriría
 * mockear `REQUEST`/`PLATFORM_ID` de forma compleja para poco valor
 * adicional.
 */
describe('esEmbebido', () => {
  it('devuelve true para letiende.co', () => {
    expect(esEmbebido('letiende.co')).toBe(true);
  });

  it('devuelve true para staging.letiende.co', () => {
    expect(esEmbebido('staging.letiende.co')).toBe(true);
  });

  it('devuelve false para agora.letiende.co (dominio propio)', () => {
    expect(esEmbebido('agora.letiende.co')).toBe(false);
  });

  it('devuelve false para localhost', () => {
    expect(esEmbebido('localhost')).toBe(false);
  });

  it('devuelve false para una cadena vacía', () => {
    expect(esEmbebido('')).toBe(false);
  });
});

describe('cartaVisibleEnHost', () => {
  it.each(['staging.letiende.co', 'localhost', '127.0.0.1'])('devuelve true para %s', (host) => {
    expect(cartaVisibleEnHost(host, false)).toBe(true);
  });

  it.each(['letiende.co', 'agora.letiende.co', ''])('devuelve false para %s mientras no esté publicada', (host) => {
    expect(cartaVisibleEnHost(host, false)).toBe(false);
  });

  it('la carta está publicada (T-0040 de letiende.co)', () => {
    expect(CARTA_PUBLICADA).toBe(true);
    expect(cartaVisibleEnHost('letiende.co')).toBe(true);
  });

  it('devuelve true en cualquier host cuando la carta está publicada', () => {
    expect(cartaVisibleEnHost('letiende.co', true)).toBe(true);
  });
});
