import { expect, test } from '@playwright/test';
import { aperturasDeBold, cerrarCheckoutBold, configDeBold, simularLibreriaBold } from '../apoyos/bold-simulado';
import { simularApi, type ApiSimulada } from '../apoyos/api-simulada';
import { CLIENTE_PRUEBA, PRECIO_BOLETA, SLUG_EVENTO, crearEventoBold } from '../apoyos/datos';
import { PaginaCompra } from '../apoyos/pagina-compra';

/**
 * Flujo de compra con Bold, de punta a punta en el navegador (roadmap #30).
 * Suite simulada: la API de Ágora y la librería de Bold son falsas, así que
 * prueba la interfaz y la máquina de estados del pago, no el cobro real (eso
 * lo cubre la suite `staging/`, ADR-015). Corre idéntica en escritorio,
 * Android y iOS.
 */
test.describe('Compra con Bold (simulada)', () => {
  let api: ApiSimulada;
  let compra: PaginaCompra;

  async function prepararPagina(page: import('@playwright/test').Page, evento = crearEventoBold()) {
    api = await simularApi(page, evento);
    await simularLibreriaBold(page);
    compra = new PaginaCompra(page);
    await compra.abrir();
  }

  test.describe('con el evento disponible', () => {
    test.beforeEach(async ({ page }) => {
      await prepararPagina(page);
      await expect(compra.botonComprar).toBeVisible();
    });

    test('muestra el formulario con el total estimado y el máximo de boletas', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Comprar boletas' })).toBeVisible();
      await expect(page.getByText('Máximo 4 por compra. Sillas disponibles: 10.')).toBeVisible();
      await expect(page.getByText('$45.000')).toBeVisible();

      await compra.cantidad.selectOption({ label: '3' });

      await expect(page.getByText('$135.000')).toBeVisible();
    });

    test('pago aprobado: el cliente termina viendo que sus boletas fueron emitidas', async ({ page }) => {
      await compra.comprarConBold(2);
      await expect(page.getByText('$90.000')).toBeVisible();

      await compra.abrirCheckout();
      // Bold confirma el pago por webhook; el cliente solo cierra su ventana.
      api.estadoCompra = 'aprobada';
      await cerrarCheckoutBold(page);

      await expect(page.getByRole('heading', { name: '¡Listo! Revisa tu correo' })).toBeVisible();
      await expect(page.getByText('Ya emitimos tus 2 boleta(s)')).toBeVisible();
      await expect(compra.botonPagarConBold).toBeHidden();
    });

    test('pago rechazado: avisa que no se emitieron boletas y permite intentar de nuevo', async ({ page }) => {
      await compra.comprarConBold();
      await compra.abrirCheckout();
      api.estadoCompra = 'rechazada';
      await cerrarCheckoutBold(page);

      await expect(page.getByRole('heading', { name: 'Tu pago no fue aprobado' })).toBeVisible();
      await expect(page.getByText('no se emitieron boletas')).toBeVisible();

      await compra.botonIntentarDeNuevo.click();

      await expect(compra.botonComprar).toBeVisible();
      expect(api.cargasDeEvento).toBe(2);
    });

    test('reserva expirada: avisa que las sillas se liberaron', async ({ page }) => {
      await compra.comprarConBold();
      await compra.abrirCheckout();
      api.estadoCompra = 'expirada';
      await cerrarCheckoutBold(page);

      await expect(page.getByRole('heading', { name: 'Tu reserva expiró' })).toBeVisible();
    });

    test('cierre sin pagar: ofrece verificar o reabrir el pago, sin crear otra reserva', async ({ page }) => {
      await compra.comprarConBold();
      await compra.abrirCheckout();
      expect(await aperturasDeBold(page)).toBe(1);

      // El cliente cierra el modal sin pagar: el backend sigue esperando el pago.
      await cerrarCheckoutBold(page);

      await expect(compra.botonVerificar).toBeVisible();
      await expect(compra.botonReabrir).toBeVisible();
      expect(api.consultasDeEstado).toBe(1); // reconsulta automática al detectar el cierre

      await compra.botonReabrir.click();

      await expect(page.getByText('Completa tu pago en la ventana de Bold')).toBeVisible();
      expect(await aperturasDeBold(page)).toBe(2);
      expect(api.comprasRecibidas).toHaveLength(1); // misma reserva, nunca una nueva
    });

    test('cierre sin pagar y pago confirmado después: "Verificar estado" lo recoge', async ({ page }) => {
      await compra.comprarConBold();
      await compra.abrirCheckout();
      await cerrarCheckoutBold(page);
      await expect(compra.botonVerificar).toBeVisible();

      api.estadoCompra = 'aprobada'; // el webhook llegó con retraso
      await compra.botonVerificar.click();

      await expect(page.getByRole('heading', { name: '¡Listo! Revisa tu correo' })).toBeVisible();
    });

    test('entrega a Bold exactamente lo que respondió el backend, sin calcular nada en el cliente', async ({ page }) => {
      await compra.comprarConBold(2);
      await compra.abrirCheckout();

      const config = await configDeBold(page);

      expect(config).toMatchObject({
        orderId: 'compra-e2e-1',
        currency: 'COP',
        amount: String(PRECIO_BOLETA * 2),
        apiKey: 'llave-publica-e2e',
        integritySignature: 'firma-integridad-e2e',
        renderMode: 'embedded',
      });
      expect(config.description).toContain('Show mágico (E2E)');
    });

    test('envía los datos del cliente y la autorización, pero nunca precio ni total', async () => {
      await compra.comprarConBold(2);

      expect(api.comprasRecibidas).toHaveLength(1);
      const cuerpo = api.comprasRecibidas[0];
      expect(cuerpo).toEqual({
        slug: SLUG_EVENTO,
        cantidad: 2,
        cliente: CLIENTE_PRUEBA,
        autorizacionDatos: true,
        medioPago: 'bold',
      });
    });

    test('un doble toque en "Comprar" crea una sola reserva', async ({ page }) => {
      await compra.llenarDatos(1);

      await compra.botonComprar.dblclick();

      await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeVisible();
      expect(api.comprasRecibidas).toHaveLength(1);
    });

    test('no deja comprar sin aceptar el tratamiento de datos personales', async ({ page }) => {
      await compra.cantidad.selectOption({ label: '1' });
      await compra.nombre.fill(CLIENTE_PRUEBA.nombre);
      await compra.telefono.fill(CLIENTE_PRUEBA.telefono);
      await compra.correo.fill(CLIENTE_PRUEBA.correo);

      await compra.botonComprar.click();

      await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeHidden();
      expect(api.comprasRecibidas).toHaveLength(0);
    });

    test('rechaza un correo inválido y no envía la compra', async ({ page }) => {
      await compra.llenarDatos(1);
      await compra.correo.fill('esto-no-es-un-correo');

      await compra.botonComprar.click();

      await expect(page.getByText('Ingresa un correo válido')).toBeVisible();
      expect(api.comprasRecibidas).toHaveLength(0);
    });

    test('si las sillas se agotaron mientras llenaba el formulario, muestra el mensaje del backend', async ({ page }) => {
      api.errorAlComprar = { status: 409, mensaje: 'No hay sillas suficientes para esta compra' };
      await compra.llenarDatos(4);

      await compra.botonComprar.click();

      await expect(page.getByText('No hay sillas suficientes para esta compra')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeHidden();
      await expect(compra.botonComprar).toBeEnabled(); // puede ajustar la cantidad y reintentar
    });

    test('la página de compra no se desborda horizontalmente (mobile-first)', async ({ page }) => {
      const desborda = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );

      expect(desborda).toBe(false);
    });
  });

  test('si no se puede cargar la pasarela de Bold, avisa en vez de dejar al cliente esperando', async ({ page }) => {
    api = await simularApi(page, crearEventoBold());
    await simularLibreriaBold(page, { falla: true });
    compra = new PaginaCompra(page);
    await compra.abrir();

    await compra.comprarConBold();

    await expect(page.getByText('No se pudo cargar la pasarela de pago de Bold.')).toBeVisible();
    await expect(compra.botonPagarConBold).toBeHidden();
  });

  test('con el aforo agotado no ofrece comprar', async ({ page }) => {
    await prepararPagina(page, crearEventoBold({ sillasDisponibles: 0, estado: 'agotado' }));

    await expect(page.getByText('Este evento no tiene boletas disponibles en este momento.')).toBeVisible();
    await expect(compra.botonComprar).toBeHidden();
  });

  test('un evento que no existe muestra "Evento no encontrado"', async ({ page }) => {
    api = await simularApi(page, crearEventoBold());
    await page.route('**/api/eventos-publicos/no-existe', (ruta) =>
      ruta.fulfill({ status: 404, contentType: 'application/json', body: '{"mensaje":"Evento no encontrado"}' }),
    );
    await simularLibreriaBold(page);

    await new PaginaCompra(page).abrir('no-existe');

    await expect(page.getByRole('heading', { name: 'Evento no encontrado' })).toBeVisible();
  });
});
