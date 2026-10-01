import { limpiarEvento } from './apoyos/aws-staging';

/** Borra el evento sembrado y todo lo que el backend creó a partir de él. */
export default async function globalTeardown(): Promise<void> {
  const crudo = process.env['E2E_EVENTO'];
  if (!crudo) {
    return;
  }
  const { eventoId, slug } = JSON.parse(crudo) as { eventoId: string; slug: string };
  const borrado = await limpiarEvento(eventoId);
  console.log(
    `[e2e/staging] limpieza de ${slug}: evento, ${borrado.compras} compra(s) y ${borrado.boletas} boleta(s) borrados`,
  );
}
