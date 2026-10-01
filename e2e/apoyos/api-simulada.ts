import type { Page, Route } from '@playwright/test';
import { PRECIO_BOLETA, type EventoPublicoSimulado } from './datos';

export type EstadoCompraSimulado = 'esperando_pago_bold' | 'aprobada' | 'rechazada' | 'expirada';

export interface CuerpoCompraEnviado {
  slug: string;
  cantidad: number;
  cliente: { nombre: string; telefono: string; correo: string };
  autorizacionDatos: boolean;
  medioPago?: string;
  [campo: string]: unknown;
}

/** Control de la API simulada: el test decide qué responde y revisa qué recibió. */
export interface ApiSimulada {
  /** Estado que devolverá `GET /api/compras/:id/estado` (el que "decidió Bold" vía webhook). */
  estadoCompra: EstadoCompraSimulado;
  /** Cuerpos recibidos por `POST /api/compras`, en orden. */
  comprasRecibidas: CuerpoCompraEnviado[];
  /** Cuántas veces se consultó `GET /api/compras/:id/estado`. */
  consultasDeEstado: number;
  /** Cuántas veces se pidió el evento por slug. */
  cargasDeEvento: number;
  /** Si se define, `POST /api/compras` responde este error en lugar de crear la compra. */
  errorAlComprar?: { status: number; mensaje: string };
}

const ID_COMPRA = 'compra-e2e-1';

function json(ruta: Route, status: number, cuerpo: unknown): Promise<void> {
  return ruta.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
}

/**
 * Intercepta la API del backend y aísla la prueba de internet: cualquier
 * petición a otro origen que no sea la propia app se aborta (Firebase, fuentes
 * de Google…), así la suite es hermética y no depende de servicios externos.
 * El precio y el total los calcula esta API simulada, como el backend real
 * (`CLAUDE.md` §5, A08): el cliente nunca los envía.
 */
export async function simularApi(page: Page, evento: EventoPublicoSimulado): Promise<ApiSimulada> {
  const control: ApiSimulada = {
    estadoCompra: 'esperando_pago_bold',
    comprasRecibidas: [],
    consultasDeEstado: 0,
    cargasDeEvento: 0,
  };

  // Primero el más general: Playwright evalúa las rutas de la última registrada a la primera.
  await page.route('**/*', (ruta) => {
    const url = new URL(ruta.request().url());
    return url.hostname === 'localhost' ? ruta.continue() : ruta.abort();
  });

  await page.route(`**/api/eventos-publicos/${evento.slug}`, (ruta) => {
    control.cargasDeEvento += 1;
    return json(ruta, 200, evento);
  });

  await page.route('**/api/compras', async (ruta) => {
    if (ruta.request().method() !== 'POST') {
      return ruta.fallback();
    }
    const cuerpo = ruta.request().postDataJSON() as CuerpoCompraEnviado;
    control.comprasRecibidas.push(cuerpo);
    if (control.errorAlComprar) {
      return json(ruta, control.errorAlComprar.status, { mensaje: control.errorAlComprar.mensaje });
    }
    return json(ruta, 201, {
      compraId: ID_COMPRA,
      estado: 'esperando_pago_bold',
      cantidad: cuerpo.cantidad,
      montoTotal: PRECIO_BOLETA * cuerpo.cantidad,
      expiraEn: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      bold: { llaveIdentidad: 'llave-publica-e2e', firma: 'firma-integridad-e2e', moneda: 'COP' },
    });
  });

  await page.route(`**/api/compras/${ID_COMPRA}/estado`, (ruta) => {
    control.consultasDeEstado += 1;
    const cuerpo = control.comprasRecibidas[0];
    return json(ruta, 200, {
      compraId: ID_COMPRA,
      estado: control.estadoCompra,
      cantidad: cuerpo?.cantidad ?? 1,
      montoTotal: PRECIO_BOLETA * (cuerpo?.cantidad ?? 1),
    });
  });

  return control;
}
