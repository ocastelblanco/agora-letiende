import { describe, expect, it } from 'vitest';
import { handler } from './salud';

describe('handler de /api/salud', () => {
  it('responde 200 con estado ok y el stage configurado', async () => {
    process.env['STAGE'] = 'staging';
    process.env['VERSION'] = '0.1.0';

    const respuesta = await handler(
      {} as never,
      {} as never,
      undefined as never,
    );

    expect(respuesta).toBeDefined();
    expect((respuesta as { statusCode: number }).statusCode).toBe(200);

    const cuerpo = JSON.parse((respuesta as { body: string }).body);
    expect(cuerpo).toEqual({ estado: 'ok', stage: 'staging', version: '0.1.0' });
  });
});
