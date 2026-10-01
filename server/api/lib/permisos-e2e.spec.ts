import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La suite E2E real (`e2e/staging/`, roadmap #30) corre en CI con un usuario IAM de
 * permisos mínimos (`agora-e2e-staging`, `docs/tareas-a-realizar.md`): solo PutItem,
 * GetItem, UpdateItem, DeleteItem y Query sobre las tablas `-staging`. El 01/10/2026 la
 * limpieza usaba `BatchWriteItem`, que esa política no concede, y el evento de prueba
 * quedó sin borrar en staging. Esta prueba falla si el código de `e2e/` empieza a usar un
 * comando de DynamoDB fuera de esa lista, antes de que lo descubra el CI.
 */
const COMANDOS_PERMITIDOS = new Set(['PutCommand', 'GetCommand', 'UpdateCommand', 'DeleteCommand', 'QueryCommand']);

function archivosTs(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    return statSync(ruta).isDirectory() ? archivosTs(ruta) : ruta.endsWith('.ts') ? [ruta] : [];
  });
}

describe('permisos IAM de la suite E2E real', () => {
  it('solo usa comandos de DynamoDB que la política mínima de CI concede', () => {
    const usados = new Set<string>();
    for (const archivo of archivosTs(join(process.cwd(), 'e2e'))) {
      for (const coincidencia of readFileSync(archivo, 'utf8').matchAll(/new (\w+Command)\(/g)) {
        usados.add(coincidencia[1]);
      }
    }

    const noPermitidos = [...usados].filter((comando) => !COMANDOS_PERMITIDOS.has(comando));

    expect(noPermitidos).toEqual([]);
    expect(usados.size).toBeGreaterThan(0); // la prueba no es vacía si la búsqueda se rompe
  });
});
