import { sembrarEventoBold } from './apoyos/aws-staging';

/**
 * Siembra UN evento temporal para toda la corrida y lo comparte con los workers
 * por variable de entorno. La limpieza está en `global-teardown.ts`, que
 * Playwright ejecuta aunque alguna prueba falle.
 */
export default async function globalSetup(): Promise<void> {
  const evento = await sembrarEventoBold();
  process.env['E2E_EVENTO'] = JSON.stringify(evento);
  console.log(`[e2e/staging] evento sembrado: ${evento.slug} (${evento.eventoId})`);
}
