import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

/**
 * Empaqueta con esbuild las Lambdas que dependen de **cualquier** paquete
 * npm real en tiempo de ejecución (`firebase-admin`, pero también algo tan
 * básico como `@aws-sdk/lib-dynamodb` vía `documentoDynamoDB`) en un único
 * archivo autocontenido, en vez de copiar un subconjunto de
 * `node_modules/**` a mano en `serverless.yml`.
 *
 * Motivo (verificado en vivo en staging dos veces, MEMORY.md §7):
 * `package.patterns` con `'!**'` (o cualquier exclusión manual de
 * `node_modules/**`) deja fuera del paquete algo que el código necesita en
 * tiempo de ejecución — la Lambda falla en el arranque (antes de que corra
 * el handler, sin importar el payload) con el 500 genérico de API Gateway
 * (`{"message":"Internal Server Error"}`, en inglés, formato de API
 * Gateway — no el `{"mensaje": ...}` en español que produce el propio
 * handler). Primera vez: `usuariosMe` sin `firebase-admin`. Segunda vez:
 * `eventosPublicos`, que ni siquiera usa `firebase-admin` — solo
 * `documentoDynamoDB` (`@aws-sdk/client-dynamodb`/`@aws-sdk/lib-dynamodb`)
 * ya es suficiente para reproducir el mismo fallo, porque el runtime
 * gestionado de Lambda (`nodejs24.x`) no garantiza traer el SDK v3
 * modular preinstalado. **Regla general: toda Lambda que importe
 * `documentoDynamoDB` o cualquier otro paquete de `node_modules` (no solo
 * `firebase-admin`) debe agregarse aquí, no empaquetarse "simple" como
 * `salud`** — `salud.ts` es la única función sin ninguna dependencia real,
 * no un patrón por defecto seguro para copiar. Un bundle de esbuild
 * resuelve el árbol de dependencias real igual que Node, así que no puede
 * faltar nada que el propio código importe.
 */
const OUT_DIR = 'dist-server-bundle';
mkdirSync(OUT_DIR, { recursive: true });

const entradas = [
  { entrada: 'dist-server/api/handlers/usuarios-me.js', salida: `${OUT_DIR}/usuarios-me.js` },
  // usuarios.ts depende de firebase-admin transitivamente (vía
  // lib/autorizacion.ts -> lib/verificar-token.ts), mismo motivo de bundle.
  { entrada: 'dist-server/api/handlers/usuarios.js', salida: `${OUT_DIR}/usuarios.js` },
  // eventos.ts también depende de firebase-admin transitivamente (vía
  // lib/autorizacion.ts), mismo motivo de bundle.
  { entrada: 'dist-server/api/handlers/eventos.js', salida: `${OUT_DIR}/eventos.js` },
  // eventos-publicos.ts NO depende de firebase-admin (endpoint público,
  // nunca usa exigirRol) — pero sí de documentoDynamoDB
  // (@aws-sdk/lib-dynamodb), suficiente para el mismo fallo de arranque.
  // Bug real encontrado en staging por el usuario (docs/MEMORY.md §7).
  { entrada: 'dist-server/api/handlers/eventos-publicos.js', salida: `${OUT_DIR}/eventos-publicos.js` },
  // liberar-reservas.ts (consumidor de Streams, TODO.md Tarea 2) depende de
  // documentoDynamoDB y de @aws-sdk/util-dynamodb (unmarshall) — mismo
  // motivo de bundle que eventos-publicos.ts.
  { entrada: 'dist-server/api/handlers/liberar-reservas.js', salida: `${OUT_DIR}/liberar-reservas.js` },
  // compras.ts (TODO.md Tarea 2) depende de documentoDynamoDB y de
  // @aws-sdk/client-ses — mismo motivo de bundle que el resto.
  { entrada: 'dist-server/api/handlers/compras.js', salida: `${OUT_DIR}/compras.js` },
  // comprobantes.ts (TODO.md Tarea 2) depende de documentoDynamoDB y de
  // @aws-sdk/client-ses — mismo motivo de bundle que compras.ts.
  { entrada: 'dist-server/api/handlers/comprobantes.js', salida: `${OUT_DIR}/comprobantes.js` },
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
