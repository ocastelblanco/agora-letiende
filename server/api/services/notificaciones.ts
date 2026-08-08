import { enviarCorreo } from './correo-ses';

export interface Destinatario {
  correo: string;
  nombre: string;
}

/**
 * Plantillas de v1 (`tech-specs.md` §5.6). Solo `enlace_comprobante` tiene
 * implementación por ahora — el resto se agrega en las tareas que las usan
 * (carga de comprobante, aprobación, emisión de boletas, liberación de
 * reserva), no como stubs vacíos por adelantado.
 */
export type Plantilla = 'enlace_comprobante';

export interface DatosEnlaceComprobante {
  nombreEvento: string;
  cantidad: number;
  montoTotal: number;
  urlComprobante: string;
  plazoComprobanteMinutos: number;
}

/**
 * Interfaz de canal de notificación (`tech-specs.md` §5.6) — el resto del
 * código nunca llama a SES (ni, en v2, a WhatsApp) directamente, siempre
 * pasa por acá. Es la indirección que permite agregar `CanalWhatsApp` en
 * v2 sin tocar los flujos de compra ni de aprobación (`PRD.md` §9).
 */
export interface CanalNotificacion {
  enviar(destinatario: Destinatario, plantilla: Plantilla, datos: unknown): Promise<void>;
}

/**
 * El nombre del evento es texto libre de un administrador — no tan hostil
 * como el nombre de un cliente anónimo, pero de todas formas nunca se
 * confía en HTML de correo, que no pasa por el sanitizador de Angular
 * (`CLAUDE.md` §5, A03).
 */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderizarEnlaceComprobante(datos: DatosEnlaceComprobante): { asunto: string; html: string } {
  const nombreEvento = escaparHtml(datos.nombreEvento);
  const total = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(datos.montoTotal);
  return {
    asunto: `Carga tu comprobante — ${nombreEvento}`,
    html: `
      <p>¡Gracias por tu compra de ${datos.cantidad} boleta(s) para <strong>${nombreEvento}</strong>!</p>
      <p>Total: $${total}.</p>
      <p>Para confirmar tu compra, carga tu comprobante de pago dentro de los próximos ${datos.plazoComprobanteMinutos} minutos:</p>
      <p><a href="${datos.urlComprobante}">${datos.urlComprobante}</a></p>
      <p>Si el plazo vence sin que cargues el comprobante, la reserva se cancela y puedes volver a intentar la compra.</p>
    `.trim(),
  };
}

export class CanalCorreoSes implements CanalNotificacion {
  async enviar(destinatario: Destinatario, plantilla: Plantilla, datos: unknown): Promise<void> {
    switch (plantilla) {
      case 'enlace_comprobante': {
        const { asunto, html } = renderizarEnlaceComprobante(datos as DatosEnlaceComprobante);
        await enviarCorreo({ destinatario: destinatario.correo, asunto, html });
        return;
      }
    }
  }
}
