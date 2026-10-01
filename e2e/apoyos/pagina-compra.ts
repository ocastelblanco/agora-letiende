import { expect, type Locator, type Page } from '@playwright/test';
import { CLIENTE_PRUEBA, SLUG_EVENTO } from './datos';

/** Interacciones con `/evento/:slug/comprar`, con los textos reales de la interfaz en español. */
export class PaginaCompra {
  readonly cantidad: Locator;
  readonly nombre: Locator;
  readonly telefono: Locator;
  readonly correo: Locator;
  readonly autorizacion: Locator;
  readonly botonComprar: Locator;
  readonly botonPagarConBold: Locator;
  readonly botonVerificar: Locator;
  readonly botonReabrir: Locator;
  readonly botonIntentarDeNuevo: Locator;

  constructor(readonly page: Page) {
    this.cantidad = page.getByLabel('Cantidad de boletas', { exact: true });
    this.nombre = page.getByLabel('Nombre completo', { exact: true });
    this.telefono = page.getByLabel('Teléfono', { exact: true });
    this.correo = page.getByLabel('Correo', { exact: true });
    this.autorizacion = page.getByRole('checkbox', { name: /autorizo el tratamiento de mis datos personales/i });
    this.botonComprar = page.getByRole('button', { name: 'Comprar', exact: true });
    this.botonPagarConBold = page.getByRole('button', { name: 'Pagar con Bold' });
    this.botonVerificar = page.getByRole('button', { name: /Verificar estado|Verificando/ });
    this.botonReabrir = page.getByRole('button', { name: 'Reabrir el pago con Bold' });
    this.botonIntentarDeNuevo = page.getByRole('button', { name: 'Intentar de nuevo' });
  }

  async abrir(slug = SLUG_EVENTO): Promise<void> {
    await this.page.goto(`/evento/${slug}/comprar`);
  }

  async llenarDatos(cantidad = 2, cliente = CLIENTE_PRUEBA): Promise<void> {
    await this.cantidad.selectOption({ label: String(cantidad) });
    await this.nombre.fill(cliente.nombre);
    await this.telefono.fill(cliente.telefono);
    await this.correo.fill(cliente.correo);
    await this.autorizacion.check();
  }

  /** Llena el formulario y lo envía. Termina cuando aparece el paso "Confirma tu pago". */
  async comprarConBold(cantidad = 2): Promise<void> {
    await this.llenarDatos(cantidad);
    await this.botonComprar.click();
    await expect(this.page.getByRole('heading', { name: 'Confirma tu pago' })).toBeVisible();
  }

  /** Abre el checkout simulado y espera el mensaje de "pago en curso". */
  async abrirCheckout(): Promise<void> {
    await this.botonPagarConBold.click();
    await expect(this.page.getByText('Completa tu pago en la ventana de Bold')).toBeVisible();
  }
}
