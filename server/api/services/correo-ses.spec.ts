import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(function (this: { send: typeof sendMock }) {
    this.send = sendMock;
  }),
  SendEmailCommand: vi.fn().mockImplementation(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

const { enviarCorreo } = await import('./correo-ses');

beforeEach(() => {
  sendMock.mockReset();
  process.env['SES_REMITENTE'] = 'taquilla@letiende.co';
});

describe('enviarCorreo', () => {
  it('envía el correo con remitente, destinatario, asunto y cuerpo HTML', async () => {
    sendMock.mockResolvedValueOnce({});

    await enviarCorreo({
      destinatario: 'cliente@correo.com',
      asunto: 'Carga tu comprobante',
      html: '<p>Hola</p>',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      Source: '"Taquilla Le Tiende" <taquilla@letiende.co>',
      Destination: { ToAddresses: ['cliente@correo.com'] },
      Message: {
        Subject: { Data: 'Carga tu comprobante', Charset: 'UTF-8' },
        Body: { Html: { Data: '<p>Hola</p>', Charset: 'UTF-8' } },
      },
    });
  });

  it('propaga el error si SES falla', async () => {
    sendMock.mockRejectedValueOnce(new Error('SES no disponible'));

    await expect(
      enviarCorreo({ destinatario: 'cliente@correo.com', asunto: 'Asunto', html: '<p>Hola</p>' }),
    ).rejects.toThrow('SES no disponible');
  });
});
