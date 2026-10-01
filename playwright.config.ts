import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas E2E con Playwright (roadmap #30, ADR-015, `docs/plan-ajustes-eventos.md`
 * Tarea 5). Dos suites que NO se mezclan:
 *
 * - `e2e/simulado/` (`npm run e2e`): API y Bold simulados; hermética, corre en CI en
 *   cada PR, en tres perfiles (escritorio, Android, iOS) contra `ng serve`.
 * - `e2e/staging/` (`npm run e2e:staging`, variable `E2E_STAGING=1`): flujo real contra
 *   staging, con el checkout sandbox de Bold, un evento temporal sembrado y borrado
 *   en DynamoDB y el webhook real. A demanda; nunca bloquea un PR. Solo Chromium de
 *   escritorio: el iframe de Bold es ajeno y frágil, no hay que multiplicarlo.
 *
 * Los archivos de prueba terminan en `.e2e.ts` (no `.spec.ts`) para que ni `ng test`
 * ni `npm run test:api` los recojan por error.
 */
const enCI = !!process.env['CI'];
const contraStaging = process.env['E2E_STAGING'] === '1';
const puerto = 4200;
// Staging cuelga la aplicación de "/cartelera/" (baseHref): la barra final es obligatoria.
const URL_STAGING =
  process.env['E2E_URL_BASE'] ?? 'https://ttukw9i82m.execute-api.us-east-1.amazonaws.com/cartelera/';

export default defineConfig({
  testDir: './e2e',
  testMatch: contraStaging ? '**/staging/**/*.e2e.ts' : '**/simulado/**/*.e2e.ts',
  fullyParallel: !contraStaging,
  forbidOnly: enCI,
  retries: enCI && !contraStaging ? 1 : 0,
  workers: contraStaging ? 1 : enCI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: contraStaging ? URL_STAGING : `http://localhost:${puerto}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: contraStaging
    ? [{ name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'escritorio-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
        { name: 'ios-webkit', use: { ...devices['iPhone 14'] } },
      ],
  globalSetup: contraStaging ? './e2e/staging/global-setup.ts' : undefined,
  globalTeardown: contraStaging ? './e2e/staging/global-teardown.ts' : undefined,
  // `ng serve` (configuración de desarrollo, baseHref "/"): la ruta de compra se
  // renderiza solo en el cliente, así que no hace falta el build SSR de producción.
  // La suite de staging prueba el despliegue real: no levanta nada local.
  webServer: contraStaging
    ? undefined
    : {
        command: `npx ng serve --port ${puerto}`,
        url: `http://localhost:${puerto}`,
        reuseExistingServer: !enCI,
        timeout: 240_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
