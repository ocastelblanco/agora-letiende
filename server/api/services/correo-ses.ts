import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const clienteSes = new SESClient({});

export interface CorreoAEnviar {
  destinatario: string;
  asunto: string;
  html: string;
}

/**
 * Envoltura mínima de SES (`tech-specs.md` §5.6) — el resto del código
 * nunca llama a `SESClient` directamente, siempre pasa por
 * `services/notificaciones.ts`. `SES_REMITENTE` es `taquilla@letiende.co`
 * (`tech-specs.md` §9), ya verificado y fuera del sandbox.
 */
export async function enviarCorreo(correo: CorreoAEnviar): Promise<void> {
  await clienteSes.send(
    new SendEmailCommand({
      Source: process.env['SES_REMITENTE'],
      Destination: { ToAddresses: [correo.destinatario] },
      Message: {
        Subject: { Data: correo.asunto, Charset: 'UTF-8' },
        Body: { Html: { Data: correo.html, Charset: 'UTF-8' } },
      },
    }),
  );
}
