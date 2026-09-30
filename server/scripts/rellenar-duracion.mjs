#!/usr/bin/env node
/**
 * Relleno único de `duracionMinutos = 180` (3 h) en los eventos que todavía no
 * lo tienen (roadmap #26, `docs/plan-ajustes-eventos.md` Tarea 1).
 *
 * Uso (simulacro por defecto; no escribe nada sin `--aplicar`):
 *   TABLA_EVENTOS=agora-eventos-staging AWS_REGION=us-east-1 \
 *     node server/scripts/rellenar-duracion.mjs [--aplicar]
 *
 * Seguro de re-ejecutar: cada escritura lleva
 * `ConditionExpression: attribute_not_exists(duracionMinutos)`, así que nunca
 * sobrescribe un evento que ya tenga el campo (ni uno que se edite mientras
 * corre el script). No toca `actualizadoEn`: no es una edición del evento.
 * Las entradas de Google Calendar existentes ya duran 3 h, no hay que
 * resincronizarlas.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const DURACION_POR_DEFECTO_MINUTOS = 180;
const tabla = process.env.TABLA_EVENTOS;
const aplicar = process.argv.includes('--aplicar');

if (!tabla) {
  console.error('Falta TABLA_EVENTOS (p. ej. agora-eventos-staging).');
  process.exit(1);
}

const cliente = DynamoDBDocumentClient.from(new DynamoDBClient({}));
let pendientes = 0;
let rellenados = 0;
let yaTenian = 0;
let llave;

do {
  const pagina = await cliente.send(
    new ScanCommand({
      TableName: tabla,
      ProjectionExpression: 'eventoId, duracionMinutos',
      ExclusiveStartKey: llave,
    }),
  );
  for (const item of pagina.Items ?? []) {
    if (item.duracionMinutos !== undefined) {
      yaTenian++;
      continue;
    }
    pendientes++;
    if (!aplicar) continue;
    try {
      await cliente.send(
        new UpdateCommand({
          TableName: tabla,
          Key: { eventoId: item.eventoId },
          UpdateExpression: 'SET duracionMinutos = :d',
          ConditionExpression: 'attribute_not_exists(duracionMinutos)',
          ExpressionAttributeValues: { ':d': DURACION_POR_DEFECTO_MINUTOS },
        }),
      );
      rellenados++;
    } catch (error) {
      if (error?.name !== 'ConditionalCheckFailedException') throw error;
      yaTenian++;
      pendientes--;
    }
  }
  llave = pagina.LastEvaluatedKey;
} while (llave);

console.log(
  `${tabla}: ${yaTenian} ya tenían duración, ${pendientes} sin duración` +
    (aplicar ? `, ${rellenados} rellenados con ${DURACION_POR_DEFECTO_MINUTOS} min.` : ' (simulacro: use --aplicar para escribir).'),
);
