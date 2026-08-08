import { enviarCorreo } from './correo-ses';

export interface Destinatario {
  correo: string;
  nombre: string;
}

/**
 * Plantillas de v1 (`tech-specs.md` §5.6). Implementadas hasta ahora:
 * `enlace_comprobante` (Compra y reserva de sillas), `aviso_comprobante`
 * (Carga de comprobante) y `compra_rechazada` (Aprobación del productor) —
 * el resto se agrega en las tareas que las usan (emisión de boletas,
 * liberación de reserva), no como stubs vacíos por adelantado.
 */
export type Plantilla = 'enlace_comprobante' | 'aviso_comprobante' | 'compra_rechazada';

export interface DatosEnlaceComprobante {
  nombreEvento: string;
  cantidad: number;
  montoTotal: number;
  urlComprobante: string;
  plazoComprobanteMinutos: number;
}

export interface DatosAvisoComprobante {
  nombreEvento: string;
  cantidad: number;
  urlAprobacion: string;
}

export interface DatosCompraRechazada {
  nombreEvento: string;
  cantidad: number;
  motivo?: string;
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

function renderizarAvisoComprobante(datos: DatosAvisoComprobante): { asunto: string; html: string } {
  const nombreEvento = escaparHtml(datos.nombreEvento);
  return {
    asunto: `Comprobante por revisar — ${nombreEvento}`,
    html: `
      <p>Un cliente cargó el comprobante de una compra de ${datos.cantidad} boleta(s) para <strong>${nombreEvento}</strong>.</p>
      <p>Revísalo y apruébalo o recházalo aquí:</p>
      <p><a href="${datos.urlAprobacion}">${datos.urlAprobacion}</a></p>
      <p>Si otro productor del evento ya lo resolvió, este enlace lo va a indicar.</p>
    `.trim(),
  };
}

function renderizarCompraRechazada(datos: DatosCompraRechazada): { asunto: string; html: string } {
  const nombreEvento = escaparHtml(datos.nombreEvento);
  const motivo = datos.motivo ? escaparHtml(datos.motivo) : undefined;
  return {
    asunto: `Tu compra no fue aprobada — ${nombreEvento}`,
    html: `
      <p>Tu compra de ${datos.cantidad} boleta(s) para <strong>${nombreEvento}</strong> no fue aprobada.</p>
      ${motivo ? `<p>Motivo: ${motivo}</p>` : ''}
      <p>Las sillas ya se liberaron. Si crees que fue un error, puedes volver a intentar la compra.</p>
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
      case 'aviso_comprobante': {
        const { asunto, html } = renderizarAvisoComprobante(datos as DatosAvisoComprobante);
        await enviarCorreo({ destinatario: destinatario.correo, asunto, html });
        return;
      }
      case 'compra_rechazada': {
        const { asunto, html } = renderizarCompraRechazada(datos as DatosCompraRechazada);
        await enviarCorreo({ destinatario: destinatario.correo, asunto, html });
        return;
      }
    }
  }
}
