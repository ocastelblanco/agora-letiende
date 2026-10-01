import type { Page } from '@playwright/test';

const URL_LIBRERIA_BOLD = 'https://checkout.bold.co/library/boldPaymentButton.js';

/**
 * Sustituto de la librería real de Bold (`window.BoldCheckout`). Reproduce solo
 * el contrato que usa `comprar.component.ts`: un constructor que recibe la
 * configuración, `open()` que muestra el "modal" y el `postMessage` de tipo
 * `BOLD_CHECKOUT_EVENT` con el que la librería real avisa que cerró el suyo.
 *
 * Lo que NO simula es el contenido del iframe real de Bold (formulario de
 * tarjeta, PSE): eso lo cubre la suite contra el sandbox real (`e2e/staging/`).
 */
const GUION_BOLD_SIMULADO = `
(function () {
  var estado = { aperturas: 0, config: null };
  window.__boldSimulado = estado;
  window.__cerrarBoldSimulado = function () {
    var modal = document.getElementById('bold-simulado');
    if (modal) { modal.remove(); }
    window.postMessage({ type: 'BOLD_CHECKOUT_EVENT' }, window.location.origin);
  };
  window.BoldCheckout = function (config) {
    estado.config = config;
    this.open = function () {
      estado.aperturas += 1;
      var modal = document.createElement('div');
      modal.id = 'bold-simulado';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-label', 'Checkout de Bold (simulado)');
      modal.textContent = 'Checkout de Bold (simulado)';
      document.body.appendChild(modal);
    };
  };
})();
`;

export interface ConfigBoldRecibida {
  orderId: string;
  currency: string;
  amount: string;
  apiKey: string;
  integritySignature: string;
  description: string;
  renderMode: string;
}

/**
 * Sirve la librería simulada en lugar de la de Bold, o la hace fallar para probar el error de carga.
 * Se llama DESPUÉS de `simularApi()`: Playwright evalúa las rutas de la última registrada a la
 * primera, y el aislamiento de red de `simularApi()` abortaría esta petición si quedara por encima.
 */
export async function simularLibreriaBold(page: Page, opciones: { falla?: boolean } = {}): Promise<void> {
  await page.route(URL_LIBRERIA_BOLD, (ruta) =>
    opciones.falla
      ? ruta.abort('failed')
      : ruta.fulfill({ contentType: 'application/javascript', body: GUION_BOLD_SIMULADO }),
  );
}

/** Cierra el modal simulado: lo que haría Bold al terminar o cancelar el pago. */
export async function cerrarCheckoutBold(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __cerrarBoldSimulado: () => void }).__cerrarBoldSimulado());
}

export function aperturasDeBold(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __boldSimulado: { aperturas: number } }).__boldSimulado.aperturas);
}

export function configDeBold(page: Page): Promise<ConfigBoldRecibida> {
  return page.evaluate(
    () => (window as unknown as { __boldSimulado: { config: unknown } }).__boldSimulado.config as ConfigBoldRecibida,
  );
}
