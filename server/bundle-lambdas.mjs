import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

/**
 * Empaqueta con esbuild las Lambdas que dependen de paquetes npm pesados
 * (`firebase-admin`, con su árbol de dependencias transitivas profundo y
 * cambiante) en un único archivo autocontenido, en vez de copiar un
 * subconjunto de `node_modules/**` a mano en `serverless.yml`.
 *
 * Motivo (verificado en vivo en staging, MEMORY.md §7): `package.patterns`
 * con exclusiones manuales de `node_modules/**` dejó fuera del paquete algo
 * que `firebase-admin` necesita en tiempo de ejecución — la Lambda
 * `usuariosMe` fallaba en el arranque (antes de que corriera el handler,
 * ni siquiera con el header `Authorization` ausente) con el 500 genérico
 * de API Gateway. Un bundle de esbuild resuelve el árbol de dependencias
 * real igual que Node, así que no puede faltar nada que el propio código
 * importe.
 */
const OUT_DIR = 'dist-server-bundle';
mkdirSync(OUT_DIR, { recursive: true });

const entradas = [
  { entrada: 'dist-server/api/handlers/usuarios-me.js', salida: `${OUT_DIR}/usuarios-me.js` },
];

for (const { entrada, salida } of entradas) {
  await build({
    entryPoints: [entrada],
    outfile: salida,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    logLevel: 'warning',
  });
  console.log(`esbuild: ${entrada} -> ${salida}`);
}
