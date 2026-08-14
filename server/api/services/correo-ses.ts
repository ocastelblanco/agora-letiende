import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const clienteSes = new SESClient({});

export interface CorreoAEnviar {
  destinatario: string;
  asunto: string;
  html: string;
}

// Nombre visible del remitente (hotfix pre-producción, 14/08/2026) — hasta
// ahora los correos mostraban el buzón crudo (`taquilla@letiende.co`) en vez
// de un nombre reconocible. `Source` de SES admite el formato RFC 5322
// `"Nombre" <correo>` directamente, sin tocar el secreto `SES_REMITENTE`
// (que sigue siendo solo la dirección).
const NOMBRE_REMITENTE = 'Taquilla Le Tiende';

/**
 * Envoltura mínima de SES (`tech-specs.md` §5.6) — el resto del código
 * nunca llama a `SESClient` directamente, siempre pasa por
 * `services/notificaciones.ts`. `SES_REMITENTE` es `taquilla@letiende.co`
 * (`tech-specs.md` §9), ya verificado y fuera del sandbox.
 */
export async function enviarCorreo(correo: CorreoAEnviar): Promise<void> {
  await clienteSes.send(
    new SendEmailCommand({
      Source: `"${NOMBRE_REMITENTE}" <${process.env['SES_REMITENTE']}>`,
      Destination: { ToAddresses: [correo.destinatario] },
      Message: {
        Subject: { Data: correo.asunto, Charset: 'UTF-8' },
        Body: { Html: { Data: correo.html, Charset: 'UTF-8' } },
      },
    }),
  );
}
