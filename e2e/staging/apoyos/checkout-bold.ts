import { expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * Datos de prueba del sandbox de Bold, verificados contra
 * https://developers.bold.co/pagos-en-linea/boton-de-pagos/ambiente-pruebas
 * (01/10/2026). Si Bold los cambia, esta es la única constante que hay que tocar.
 */
export const TARJETA_APROBADA = '4111111111111111';
export const TARJETA_RECHAZADA = '4970110000000062';
export const URL_WEBHOOK_STAGING =
  process.env['E2E_WEBHOOK_URL'] ?? 'https://ttukw9i82m.execute-api.us-east-1.amazonaws.com/api/pagos/bold/webhook';

// Bold no valida estos datos en modo pruebas ("Bold no almacenará ningún dato"), pero el
// formulario los pide. Son inventados; el correo es el simulador de SES (nunca llega a una persona).
const DATOS_PAGADOR = {
  celular: '3000000000',
  correo: 'success@simulator.amazonses.com',
  vencimiento: '1230',
  cvc: '123',
  titular: 'Prueba Automatica E2E',
  documento: '1234567890',
  direccion: 'Calle 1 # 2-3',
};

/**
 * Hace que el checkout embebido de Bold sea alcanzable. Bold monta un
 * `<bold-embedded-checkout>` con shadow root **cerrado** que contiene el iframe;
 * Playwright solo atraviesa shadow roots abiertos. Se fuerza el modo abierto antes
 * de que cargue la librería (`addInitScript`): no cambia el comportamiento de la
 * página, solo permite inspeccionarla. Hay que llamarlo ANTES de `page.goto()`.
 */
export async function permitirInspeccionarCheckoutBold(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init: ShadowRootInit) {
      return original.call(this, { ...init, mode: 'open' });
    };
  });
}

/**
 * Interacciones con el checkout REAL de Bold en modo pruebas (iframe dentro del shadow
 * DOM). Su HTML interno no es una API documentada: los selectores salen de inspeccionar
 * el checkout el 01/10/2026 y pueden romperse sin aviso. Por eso esta suite nunca bloquea
 * un PR (ADR-015).
 */
export class CheckoutBold {
  readonly marco: FrameLocator;

  constructor(private readonly page: Page) {
    this.marco = page.frameLocator('bold-embedded-checkout iframe');
  }

  private static sinFormato(texto: string): string {
    return texto.replace(/[\s/]/g, '');
  }

  /**
   * Asigna un valor con los eventos nativos `input`/`change`/`blur` que el formulario
   * espera: ni `fill()` ni teclear dejan un valor estable en el CVC (verificado).
   */
  private async asignar(id: string, valor: string): Promise<void> {
    await this.marco.locator(`#${id}`).evaluate((el, v) => {
      const asignarValor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      asignarValor.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }, valor);
  }

  /** Campos del formulario que hoy no tienen el valor esperado (los ausentes se ignoran). */
  private async camposPendientes(campos: [string, string][]): Promise<[string, string][]> {
    const pendientes: [string, string][] = [];
    for (const [id, valor] of campos) {
      const campo = this.marco.locator(`#${id}`);
      if ((await campo.count()) === 0) {
        continue; // p. ej. cuotas y documento dependen de la tarjeta
      }
      if (CheckoutBold.sinFormato(await campo.inputValue()) !== CheckoutBold.sinFormato(valor)) {
        pendientes.push([id, valor]);
      }
    }
    return pendientes;
  }

  /**
   * "Tipo de documento" es un `<bold-dropdown>` propio (no un `<select>`): su valor está en el
   * atributo `user-input` ("CEDULA"). Bold lo preselecciona, pero los redibujados del
   * formulario a veces lo borran (verificado: "Selecciona un tipo de documento"). Devuelve
   * `true` si ya estaba elegido; si no, lo elige y devuelve `false` para volver a verificar.
   */
  private async asegurarTipoDocumento(): Promise<boolean> {
    const lista = this.marco.locator('#dd_payer_identification_type');
    if ((await lista.count()) === 0) {
      return true; // según la tarjeta, el formulario no pide documento
    }
    if ((await lista.getAttribute('user-input'))?.trim() === 'CEDULA') {
      return true;
    }
    await lista.click({ force: true });
    await lista.getByText('(C.C.) Cédula de Ciudadanía').click({ force: true });
    return false;
  }

  /**
   * Llena el formulario y espera a que quede estable. Bold lo vuelve a dibujar mientras
   * detecta la marca de la tarjeta y agrega campos (cuotas, documento, dirección), y cada
   * redibujado puede borrar lo ya escrito (verificado: el CVC y el documento se perdían).
   * Se escribe, se vuelve a leer todo y se repite hasta que todo coincide dos lecturas
   * seguidas.
   */
  private async llenarFormulario(campos: [string, string][]): Promise<void> {
    let lecturasLimpias = 0;
    await expect(async () => {
      const pendientes = await this.camposPendientes(campos);
      for (const [id, valor] of pendientes) {
        await this.asignar(id, valor);
      }
      const tipoDocumentoListo = await this.asegurarTipoDocumento();
      lecturasLimpias = pendientes.length === 0 && tipoDocumentoListo ? lecturasLimpias + 1 : 0;
      await this.page.waitForTimeout(400);
      expect(lecturasLimpias, 'el formulario de Bold debe quedar estable').toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 30_000, intervals: [100] });
  }

  /** Elige "Pago con tarjeta", llena el formulario, acepta los dos consentimientos y paga. */
  async pagarConTarjeta(numero: string): Promise<void> {
    await this.marco.locator('#btn_container_payment_method_credit_card').click();
    await this.marco.locator('#et_card_number').waitFor({ timeout: 30_000 });
    const campos: [string, string][] = [
      // El número va primero: dispara el redibujado y, según la tarjeta, agrega campos.
      ['et_card_number', numero],
      ['et_payer_phone', DATOS_PAGADOR.celular],
      ['et_payer_email', DATOS_PAGADOR.correo],
      ['et_card_date', DATOS_PAGADOR.vencimiento],
      ['et_card_cvc', DATOS_PAGADOR.cvc],
      ['et_payer_name', DATOS_PAGADOR.titular],
      ['et_payer_identification_number', DATOS_PAGADOR.documento],
      ['et_payer_address', DATOS_PAGADOR.direccion],
    ];
    await this.llenarFormulario(campos);

    // `bold-checkbox` es un componente propio: hay que pulsar la casilla (esquina izquierda),
    // no el centro, donde está el enlace a los términos que abre otra página.
    for (const id of ['cb_privacy_policy_acceptance', 'cb_terms_and_conditions_acceptance']) {
      const casilla = this.marco.locator(`#${id}`);
      await casilla.click({ position: { x: 12, y: 12 } });
      await expect(casilla).toHaveAttribute('aria-checked', 'true');
    }
    // Aceptar los términos también puede redibujar el formulario: una última verificación.
    await this.llenarFormulario(campos);

    // El botón vive en el shadow DOM de un componente de Bold cuyo contenedor intercepta el
    // puntero: Playwright lo detecta y espera para siempre. Se desplaza hasta verlo y se
    // fuerza el clic (verificado: el botón recibe el evento).
    const pagar = this.marco.getByRole('button', { name: 'Pagar', exact: true });
    await pagar.scrollIntoViewIfNeeded();
    await pagar.click({ force: true });
  }

  /** Pantalla de pago aprobado: ofrece "Probar el webhook" (solo existe en modo pruebas). */
  async esperarPagoAprobado(): Promise<void> {
    await expect(this.marco.getByText('¡Completaste el pago!')).toBeVisible({ timeout: 60_000 });
  }

  /**
   * En modo pruebas Bold NO envía el webhook por sí solo: hay que registrar la URL en la
   * propia pantalla de resultado ("Probar el webhook"), y al guardarla Bold lo dispara.
   * En producción es automático (verificado, `docs/MEMORY.md` 26/08/2026).
   */
  async dispararWebhook(url = URL_WEBHOOK_STAGING): Promise<void> {
    await this.marco.getByText('Probar el webhook').first().click();
    await this.marco.locator('#et_webhook').fill(url);
    await this.marco.getByText('Guardar webhook').click();
    await expect(this.marco.getByText('¡Guardaste el webhook!')).toBeVisible({ timeout: 30_000 });
  }

  /** Pantalla de pago rechazado: no ofrece webhook y Bold no notifica nada a Ágora. */
  async esperarPagoRechazado(): Promise<void> {
    await expect(this.marco.getByText('Tu transacción fue rechazada')).toBeVisible({ timeout: 60_000 });
  }

  async volverALaTienda(): Promise<void> {
    // Tras "Probar el webhook", el panel deslizable de Bold queda encima del botón e intercepta
    // el puntero, y su "X" no responde a un clic simulado (verificado). Se despacha el evento
    // `click` directamente sobre el botón, que es lo que su manejador escucha.
    await this.marco.getByText('Volver a la tienda').first().dispatchEvent('click');
    await expect(this.page.locator('bold-embedded-checkout')).toHaveCount(0, { timeout: 15_000 });
  }
}
