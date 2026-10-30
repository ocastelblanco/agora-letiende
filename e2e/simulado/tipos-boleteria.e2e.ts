import { expect, test } from '@playwright/test';
import { simularApi } from '../apoyos/api-simulada';
import { simularLibreriaBold } from '../apoyos/bold-simulado';
import { CLIENTE_PRUEBA, PRECIO_PAREJA, SLUG_EVENTO, crearEventoBold, crearEventoConTipos } from '../apoyos/datos';
import { PaginaCompra } from '../apoyos/pagina-compra';

/**
 * Tipos de boletería (roadmap #33, ADR-020) en el navegador: la tabla y los
 * botones por tipo de la página del evento, y la compra de una pareja. Suite
 * simulada: el backend real ya valida el precio y las sillas (pruebas
 * unitarias y verificación en staging); aquí se prueba que la interfaz envía
 * solo el `tipoId` y muestra lo que el servidor calcula.
 */
test.describe('Tipos de boletería (simulada)', () => {
  test('la página del evento muestra un botón por tipo y lleva a comprar el tipo elegido', async ({ page }) => {
    await simularApi(page, crearEventoConTipos());
    await simularLibreriaBold(page);

    await page.goto(`evento/${SLUG_EVENTO}`);

    await expect(page.getByRole('link', { name: 'Comprar Individual $30.000' })).toBeVisible();
    await page.getByRole('link', { name: 'Comprar Pareja $40.000' }).click();

    await expect(page).toHaveURL(/\/comprar\?tipo=tipo-pareja$/);
    await expect(page.getByText('Tipo de boleta:')).toBeVisible();
  });

  test('compra de pareja: envía el tipoId, nunca un precio, y muestra el total que cobra el backend', async ({ page }) => {
    const api = await simularApi(page, crearEventoConTipos());
    await simularLibreriaBold(page);
    const compra = new PaginaCompra(page);
    await compra.abrir(SLUG_EVENTO, 'tipo-pareja');

    await compra.comprarConBold(2);

    expect(api.comprasRecibidas).toHaveLength(1);
    expect(api.comprasRecibidas[0]).toEqual({
      slug: SLUG_EVENTO,
      cantidad: 2,
      tipoId: 'tipo-pareja',
      cliente: CLIENTE_PRUEBA,
      autorizacionDatos: true,
      medioPago: 'bold',
    });
    await expect(page.getByText(`$${(PRECIO_PAREJA * 2).toLocaleString('es-CO')}`)).toBeVisible();
  });

  test('con varios tipos y sin ?tipo= no deja comprar y ofrece volver al evento', async ({ page }) => {
    const api = await simularApi(page, crearEventoConTipos());
    await simularLibreriaBold(page);
    const compra = new PaginaCompra(page);

    await compra.abrir();

    await expect(page.getByRole('link', { name: 'Volver al evento' })).toBeVisible();
    await expect(compra.botonComprar).toBeHidden();
    expect(api.comprasRecibidas).toHaveLength(0);
  });

  test('un evento sin tipos propios se ve y se compra como siempre', async ({ page }) => {
    const api = await simularApi(page, crearEventoBold());
    await simularLibreriaBold(page);

    await page.goto(`evento/${SLUG_EVENTO}`);
    await expect(page.getByRole('link', { name: 'Comprar boletas' })).toBeVisible();
    await expect(page.getByText('Por defecto')).toBeHidden();

    const compra = new PaginaCompra(page);
    await compra.abrir();
    await compra.comprarConBold(1);

    expect(api.comprasRecibidas[0]).not.toHaveProperty('tipoId');
  });
});
