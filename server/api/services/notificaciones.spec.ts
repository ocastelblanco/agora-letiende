import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enviarCorreoMock } = vi.hoisted(() => ({ enviarCorreoMock: vi.fn() }));
vi.mock('./correo-ses', () => ({ enviarCorreo: enviarCorreoMock }));

const { CanalCorreoSes } = await import('./notificaciones');

beforeEach(() => {
  enviarCorreoMock.mockReset();
});

describe('CanalCorreoSes', () => {
  it('renderiza y envía la plantilla enlace_comprobante con el total formateado', async () => {
    enviarCorreoMock.mockResolvedValueOnce(undefined);
    const canal = new CanalCorreoSes();

    await canal.enviar(
      { correo: 'cliente@correo.com', nombre: 'Ana' },
      'enlace_comprobante',
      {
        nombreEvento: 'Concierto de jazz',
        cantidad: 2,
        montoTotal: 90000,
        urlComprobante: 'https://agora.letiende.co/comprobante/abc',
        plazoComprobanteMinutos: 10,
      },
    );

    expect(enviarCorreoMock).toHaveBeenCalledTimes(1);
    const llamada = enviarCorreoMock.mock.calls[0]?.[0];
    expect(llamada.destinatario).toBe('cliente@correo.com');
    expect(llamada.asunto).toContain('Concierto de jazz');
    expect(llamada.html).toContain('90.000');
    expect(llamada.html).toContain('https://agora.letiende.co/comprobante/abc');
    expect(llamada.html).toContain('10 minutos');
  });

  it('escapa el nombre del evento en el HTML del correo (defensa en profundidad, A03)', async () => {
    enviarCorreoMock.mockResolvedValueOnce(undefined);
    const canal = new CanalCorreoSes();

    await canal.enviar({ correo: 'cliente@correo.com', nombre: 'Ana' }, 'enlace_comprobante', {
      nombreEvento: '<script>alert(1)</script>',
      cantidad: 1,
      montoTotal: 45000,
      urlComprobante: 'https://agora.letiende.co/comprobante/abc',
      plazoComprobanteMinutos: 10,
    });

    const llamada = enviarCorreoMock.mock.calls[0]?.[0];
    expect(llamada.html).not.toContain('<script>');
    expect(llamada.html).toContain('&lt;script&gt;');
  });

  it('propaga el error si el envío de correo falla', async () => {
    enviarCorreoMock.mockRejectedValueOnce(new Error('SES no disponible'));
    const canal = new CanalCorreoSes();

    await expect(
      canal.enviar({ correo: 'cliente@correo.com', nombre: 'Ana' }, 'enlace_comprobante', {
        nombreEvento: 'Concierto',
        cantidad: 1,
        montoTotal: 45000,
        urlComprobante: 'https://agora.letiende.co/comprobante/abc',
        plazoComprobanteMinutos: 10,
      }),
    ).rejects.toThrow('SES no disponible');
  });
});
