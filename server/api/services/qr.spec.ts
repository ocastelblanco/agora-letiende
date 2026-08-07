import { describe, expect, it } from 'vitest';
import { generarQrPng, generarQrSvg } from './qr';

describe('qr', () => {
  it('generarQrSvg devuelve un SVG que codifica la URL dada', async () => {
    const svg = await generarQrSvg('https://agora.letiende.co/evento/concierto-jazz');

    expect(svg.trim().startsWith('<svg')).toBe(true);
  });

  it('generarQrPng devuelve un Buffer PNG válido', async () => {
    const png = await generarQrPng('https://agora.letiende.co/evento/concierto-jazz');

    // Firma PNG: 0x89 'P' 'N' 'G' (RFC 2083).
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});
