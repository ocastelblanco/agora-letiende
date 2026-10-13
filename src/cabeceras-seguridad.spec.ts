import { describe, expect, it } from 'vitest';
import { politicaCsp, politicaReferer } from './cabeceras-seguridad';

describe('politicaCsp', () => {
  const csp = politicaCsp('abc123');
  const directiva = (nombre: string) => csp.split('; ').find((d) => d.startsWith(`${nombre} `));

  it('autoriza scripts solo por nonce y strict-dynamic', () => {
    expect(directiva('script-src')).toBe("script-src 'nonce-abc123' 'strict-dynamic' https: 'unsafe-inline'");
  });

  it('no pone nonce en style-src, para que unsafe-inline siga vigente', () => {
    expect(directiva('style-src')).not.toContain('nonce-');
    expect(directiva('style-src')).toContain("'unsafe-inline'");
  });

  it.each(["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "default-src 'self'"])(
    'incluye %s',
    (esperada) => {
      expect(csp.split('; ')).toContain(esperada);
    },
  );

  it('permite el checkout de Bold y el inicio de sesión de Firebase', () => {
    expect(directiva('frame-src')).toContain('https://*.bold.co');
    expect(directiva('frame-src')).toContain('https://comandante-letiende.firebaseapp.com');
    expect(directiva('connect-src')).toContain('https://*.googleapis.com');
  });
});

describe('politicaReferer', () => {
  it.each([
    '/cartelera/comprobante/tok123',
    '/cartelera/aprobaciones/tok123',
    '/cartelera/boleta/bol-1.firma',
    '/comprobante/tok123',
  ])('no envía Referer desde %s', (ruta) => {
    expect(politicaReferer(ruta)).toBe('no-referrer');
  });

  it.each(['/cartelera/', '/cartelera/evento/jazz', '/cartelera/mis-eventos/aprobaciones', '/cartelera/login'])(
    'envía solo el origen desde %s',
    (ruta) => {
      expect(politicaReferer(ruta)).toBe('strict-origin-when-cross-origin');
    },
  );
});
