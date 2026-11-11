import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { CLIENTE_PRUEBA } from '../apoyos/datos';
import { PaginaCompra } from '../apoyos/pagina-compra';
import { leerBoletas, leerCompras, leerEvento, type EventoSembrado } from './apoyos/aws-staging';
import {
  CheckoutBold,
  TARJETA_APROBADA,
  TARJETA_RECHAZADA,
  URL_WEBHOOK_STAGING,
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

    // El SANDBOX de Bold no notifica a Ágora un rechazo (verificado); producción sí
    // (ADR-021). En ambos casos la compra sigue esperando el pago.
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

  /**
   * Envía a la Lambda real de staging un aviso firmado como lo hace el sandbox de Bold
   * (HMAC-SHA256 con llave vacía sobre el cuerpo en Base64, `services/bold.ts`). Se usa
   * para reproducir lo que Bold hace en producción y el sandbox no: avisar cada intento
   * rechazado (ADR-021).
   */
  async function enviarAvisoDeBold(tipo: 'SALE_REJECTED' | 'SALE_APPROVED', compraId: string, paymentId: string) {
    const cuerpo = JSON.stringify({
      id: `e2e-${paymentId}`,
      type: tipo,
      subject: compraId,
      source: '/e2e',
      spec_version: '1.0',
      time: Date.now() * 1_000_000,
      datacontenttype: 'application/json',
      data: {
        payment_id: paymentId,
        merchant_id: 'E2E',
        metadata: { reference: compraId },
        // El sandbox informa total 0 (ADR-018); en modo pruebas no se compara.
        amount: { total: 0, currency: 'COP', taxes: [], tip: 0 },
        payment_method: 'CREDIT_CARD',
      },
    });
    const firma = createHmac('sha256', '').update(Buffer.from(cuerpo, 'utf8').toString('base64')).digest('hex');
    const respuesta = await fetch(URL_WEBHOOK_STAGING, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bold-signature': firma },
      body: cuerpo,
    });
    return respuesta.status;
  }

  // Incidente del 10/11/2026 (ADR-021): un intento rechazado seguido de uno aprobado sobre la
  // misma compra. Antes, el rechazo cerraba la compra y la aprobación se descartaba con un 200.
  test('un intento rechazado y luego uno aprobado: la compra sigue abierta, se aprueba y se emiten las boletas', async ({ page }) => {
    const antes = await leerEvento(evento.eventoId);
    const boletasAntes = (await leerBoletas(evento.eventoId)).length;
    const idsAntes = new Set((await leerCompras(evento.eventoId)).map((c) => c['compraId']));

    // Solo se llega a «Confirma tu pago»: no se paga en el sandbox, los avisos los envía la prueba.
    await permitirInspeccionarCheckoutBold(page);
    const compra = new PaginaCompra(page);
    await compra.abrir(evento.slug);
    await compra.llenarDatos(1, { ...CLIENTE_PRUEBA, correo: 'success@simulator.amazonses.com' });
    await compra.botonComprar.click();
    await expect(page.getByRole('heading', { name: 'Confirma tu pago' })).toBeVisible({ timeout: 60_000 });

    const nueva = (await leerCompras(evento.eventoId)).find((c) => !idsAntes.has(c['compraId']))!;
    const compraId = String(nueva['compraId']);
    expect(nueva['estado']).toBe('esperando_pago_bold');

    expect(await enviarAvisoDeBold('SALE_REJECTED', compraId, 'E2ERECHAZADO1')).toBe(200);

    // El rechazo de un intento NO cierra la compra ni libera las sillas: solo se anota.
    const trasRechazo = (await leerCompras(evento.eventoId)).find((c) => c['compraId'] === compraId)!;
    expect(trasRechazo['estado']).toBe('esperando_pago_bold');
    expect(trasRechazo['ultimoRechazoEn']).toBeTruthy();
    expect(trasRechazo['avisosBold']).toEqual([expect.objectContaining({ tipo: 'rechazado', paymentId: 'E2ERECHAZADO1' })]);
    const eventoTrasRechazo = await leerEvento(evento.eventoId);
    expect(eventoTrasRechazo!['sillasReservadas']).toBe((antes!['sillasReservadas'] as number) + 1);

    expect(await enviarAvisoDeBold('SALE_APPROVED', compraId, 'E2EAPROBADO1')).toBe(200);

    await expect
      .poll(async () => (await leerCompras(evento.eventoId)).find((c) => c['compraId'] === compraId)?.['estado'], {
        timeout: 60_000,
        intervals: [1000, 2000, 3000],
        message: 'la aprobación posterior al rechazo debería aprobar la compra',
      })
      .toBe('aprobada');

    const aprobada = (await leerCompras(evento.eventoId)).find((c) => c['compraId'] === compraId)!;
    expect(aprobada['avisosBold']).toEqual([
      expect.objectContaining({ tipo: 'rechazado', paymentId: 'E2ERECHAZADO1' }),
      expect.objectContaining({ tipo: 'aprobado', paymentId: 'E2EAPROBADO1' }),
    ]);
    const boletas = await leerBoletas(evento.eventoId);
    expect(boletas).toHaveLength(boletasAntes + 1);
    expect(boletas.filter((b) => b['compraId'] === compraId)).toHaveLength(1);
    const despues = await leerEvento(evento.eventoId);
    expect(despues!['sillasReservadas']).toBe(antes!['sillasReservadas']);
    expect(despues!['sillasDisponibles']).toBe((antes!['sillasDisponibles'] as number) - 1);
  });
});
