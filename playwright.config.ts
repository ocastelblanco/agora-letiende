import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas E2E con Playwright (roadmap #30, ADR-015, `docs/plan-ajustes-eventos.md`
 * Tarea 5). Hoy solo existe la suite `simulado/` (API y Bold simulados, corre en
 * CI en cada PR); la suite `staging/` contra el checkout sandbox real de Bold
 * llega en un PR posterior.
 *
 * Los archivos de prueba terminan en `.e2e.ts` (no `.spec.ts`) para que ni
 * `ng test` ni `npm run test:api` los recojan por error.
 *
 * Se prueba en tres perfiles porque Ágora es *mobile-first*: la compra ocurre
 * en el celular del cliente. Android (Chromium) e iOS (WebKit, el motor de
 * Safari) cubren los dos motores móviles reales.
 */
const enCI = !!process.env['CI'];
const puerto = 4200;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: enCI,
  retries: enCI ? 1 : 0,
  workers: enCI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${puerto}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'ios-webkit', use: { ...devices['iPhone 14'] } },
  ],
  // `ng serve` (configuración de desarrollo, baseHref "/"): la ruta de compra se
  // renderiza solo en el cliente, así que no hace falta el build SSR de producción.
  webServer: {
    command: `npx ng serve --port ${puerto}`,
    url: `http://localhost:${puerto}`,
    reuseExistingServer: !enCI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
