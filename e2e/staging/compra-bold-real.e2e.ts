import { expect, test } from '@playwright/test';
import { CLIENTE_PRUEBA } from '../apoyos/datos';
import { PaginaCompra } from '../apoyos/pagina-compra';
import { leerBoletas, leerCompras, leerEvento, type EventoSembrado } from './apoyos/aws-staging';
import {
  CheckoutBold,
  TARJETA_APROBADA,
  TARJETA_RECHAZADA,
  permitirInspeccionarCheckoutBold,
} from './apoyos/checkout-bold';

/**
 * Flujo de compra REAL contra staging (roadmap #30, ADR-015): backend desplegado,
 * checkout sandbox de Bold con sus tarjetas de prueba, webhook real y DynamoDB de
 * staging. El evento temporal lo siembra `global-setup.ts` y lo borra
 * `global-teardown.ts`. A demanda (`npm run e2e:staging`); nunca bloquea un PR.
 *
 * Cada prueba lee la base de datos para comprobar lo que la interfaz no puede
 * mostrar: que el webhook aprobó la compra, que se emitieron las boletas y que el
 * aforo quedó bien.
 */
const evento = JSON.parse(process.env['E2E_EVENTO'] ?? '{}') as EventoSembrado;

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function comprarYAbrirCheckout(page: import('@playwright/test').Page) {
  await permitirInspeccionarCheckoutBold(page);
  const compra = new PaginaCompra(page);
  await compra.abrir(evento.slug);
  await compra.llenarDatos(1, { ...CLIENTE_PRUEBA, correo: 'success@simulator.amazonses.com' });
  await compra.botonComprar.click();
  await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeVisible({ timeout: 60_000 });
  await compra.botonPagarConBold.click();
  return { compra, bold: new CheckoutBold(page) };
}

test.describe('Compra con Bold contra staging', () => {
  test.beforeAll(() => {
    expect(evento.eventoId, 'global-setup debe haber sembrado el evento').toBeTruthy();
  });

  test('pago aprobado: el webhook aprueba la compra, se emiten las boletas y el aforo se confirma', async ({ page }) => {
    const { bold } = await comprarYAbrirCheckout(page);

    await bold.pagarConTarjeta(TARJETA_APROBADA);
    await bold.esperarPagoAprobado();
    await bold.dispararWebhook();

    // El webhook llega a la Lambda real de staging: se espera a que apruebe la compra.
    await expect
      .poll(async () => (await leerCompras(evento.eventoId)).find((c) => c['estado'] === 'aprobada') !== undefined, {
        timeout: 60_000,
        intervals: [1000, 2000, 3000],
        message: 'la compra debería quedar aprobada por el webhook de Bold',
      })
      .toBe(true);

    const compras = await leerCompras(evento.eventoId);
    const aprobada = compras.find((c) => c['estado'] === 'aprobada')!;
    expect(aprobada).toMatchObject({
      medioPago: 'bold',
      cantidad: 1,
      montoTotal: evento.precio,
      resueltoPor: 'sistema (pago Bold confirmado)',
    });

    const boletas = await leerBoletas(evento.eventoId);
    expect(boletas).toHaveLength(1);
    expect(boletas[0]).toMatchObject({ compraId: aprobada['compraId'], estado: 'valida' });

    const eventoActual = await leerEvento(evento.eventoId);
    expect(eventoActual).toMatchObject({ sillasDisponibles: evento.sillasTotales - 1, sillasReservadas: 0 });

    // Al volver a la tienda, la página consulta el estado real y confirma al cliente.
    await bold.volverALaTienda();
    await expect(page.getByRole('heading', { name: '¡Listo! Revisa tu correo' })).toBeVisible({ timeout: 30_000 });
  });

  /** Compra y paga con la tarjeta que Bold rechaza; termina con el checkout ya cerrado ("Volver a la tienda"). */
  async function pagarYSerRechazado(page: import('@playwright/test').Page) {
    const { compra, bold } = await comprarYAbrirCheckout(page);
    await bold.pagarConTarjeta(TARJETA_RECHAZADA);
    await bold.esperarPagoRechazado();
    await bold.volverALaTienda();
    return compra;
  }

  test('pago rechazado: Bold lo rechaza, Ágora no emite boletas y la compra no se aprueba', async ({ page }) => {
    const boletasAntes = (await leerBoletas(evento.eventoId)).length;

    await pagarYSerRechazado(page);

    // Bold no notifica a Ágora de un rechazo (verificado): la compra sigue esperando el pago.
    await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeVisible({ timeout: 30_000 });
    const compras = await leerCompras(evento.eventoId);
    const ultima = compras.sort((a, b) => String(a['creadaEn']).localeCompare(String(b['creadaEn']))).at(-1)!;
    expect(ultima['estado']).toBe('esperando_pago_bold');
    expect(await leerBoletas(evento.eventoId)).toHaveLength(boletasAntes);
  });

  // Regresión del bug que encontró esta suite (01/10/2026, roadmap #32): `GET /api/compras/:id/estado`
  // no devolvía la configuración de Bold y la pantalla quedaba sin ningún botón tras un rechazo.
  test('tras un rechazo, el cliente tiene una forma de seguir (pagar de nuevo, verificar o reintentar)', async ({ page }) => {
    const compra = await pagarYSerRechazado(page);

    const caminos = compra.botonPagarConBold.or(compra.botonVerificar).or(compra.botonReabrir).or(compra.botonIntentarDeNuevo);

    await expect(caminos.first()).toBeVisible({ timeout: 15_000 });
  });
});
