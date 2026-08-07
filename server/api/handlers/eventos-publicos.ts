import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { respuestaJson } from '../lib/http';

/**
 * Estados de `agora-eventos` visibles públicamente. Un evento en `borrador`,
 * `finalizado` o `cancelado` nunca aparece en la cartelera ni resuelve por
 * slug (TODO.md Tarea 1, DoD).
 */
const ESTADOS_VISIBLES = ['publicado', 'agotado'] as const;

const BASE_URL_PUBLICA = 'https://agora.letiende.co';

/** Construye la URL pública de un objeto bajo `eventos/*` de `BucketActivos` (política pública, no prefirmada). */
function urlPublicaActivo(key: string): string {
  const bucket = process.env['BUCKET_ACTIVOS'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Proyecta un ítem crudo de `agora-eventos` a la vista pública: nunca
 * incluye `productores` (correos de personal interno, CLAUDE.md §5 A01) y
 * agrega `imagenUrl`/`logotipoUrl` calculadas en el backend a partir de
 * `imagenKey`/`logotipoKey` cuando existen. Reutilizada por las 3 rutas de
 * este handler.
 */
function aVistaPublica(evento: Record<string, unknown>): Record<string, unknown> {
  const { productores: _productores, ...vista } = evento;

  if (typeof vista['imagenKey'] === 'string') {
    vista['imagenUrl'] = urlPublicaActivo(vista['imagenKey']);
  }
  if (typeof vista['logotipoKey'] === 'string') {
    vista['logotipoUrl'] = urlPublicaActivo(vista['logotipoKey']);
  }

  return vista;
}

function esEstadoVisible(estado: unknown): boolean {
  return (
    typeof estado === 'string' && (ESTADOS_VISIBLES as readonly string[]).includes(estado)
  );
}

/**
 * `GET /api/eventos-publicos` — cartelera pública. Un `Query` por cada
 * estado visible sobre `estado-fechaHora-index` (nunca `Scan`), combinados
 * y ordenados por `fechaHora`.
 */
async function listarEventosPublicos(): Promise<APIGatewayProxyResultV2> {
  const resultados = await Promise.all(
    ESTADOS_VISIBLES.map((estado) =>
      documentoDynamoDB.send(
        new QueryCommand({
          TableName: process.env['TABLA_EVENTOS'],
          IndexName: 'estado-fechaHora-index',
          KeyConditionExpression: '#estado = :estado',
          ExpressionAttributeNames: { '#estado': 'estado' },
          ExpressionAttributeValues: { ':estado': estado },
        }),
      ),
    ),
  );

  const eventos = resultados
    .flatMap((resultado) => resultado.Items ?? [])
    .sort((a, b) => String(a['fechaHora']).localeCompare(String(b['fechaHora'])))
    .map(aVistaPublica);

  return respuestaJson(200, eventos);
}

/**
 * `GET /api/eventos-publicos/{slug}` — detalle público de un evento. `Query`
 * sobre `slug-index` (nunca `Scan`); 404 si no existe o su `estado` no está
 * en `ESTADOS_VISIBLES`.
 */
async function obtenerEventoPorSlug(slug: string | undefined): Promise<APIGatewayProxyResultV2> {
  if (!slug) {
    return respuestaJson(400, { mensaje: 'Falta el slug en la ruta' });
  }

  const resultado = await documentoDynamoDB.send(
    new QueryCommand({
      TableName: process.env['TABLA_EVENTOS'],
      IndexName: 'slug-index',
      KeyConditionExpression: '#slug = :slug',
      ExpressionAttributeNames: { '#slug': 'slug' },
      ExpressionAttributeValues: { ':slug': slug },
      Limit: 1,
    }),
  );

  const evento = resultado.Items?.[0];
  if (!evento || !esEstadoVisible(evento['estado'])) {
    return respuestaJson(404, { mensaje: 'Evento no encontrado' });
  }

  return respuestaJson(200, aVistaPublica(evento));
}

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * `GET /sitemap.xml` — ruta a nivel raíz del dominio (no bajo `/api`, ver
 * `serverless.yml`). `Query` sobre `estado-fechaHora-index` solo para
 * `estado = 'publicado'` (los `agotado` siguen siendo eventos reales pero no
 * aceptan más compras; se mantienen fuera del sitemap a propósito, tal como
 * pide TODO.md Tarea 1).
 */
async function generarSitemap(): Promise<APIGatewayProxyResultV2> {
  const resultado = await documentoDynamoDB.send(
    new QueryCommand({
      TableName: process.env['TABLA_EVENTOS'],
      IndexName: 'estado-fechaHora-index',
      KeyConditionExpression: '#estado = :estado',
      ExpressionAttributeNames: { '#estado': 'estado' },
      ExpressionAttributeValues: { ':estado': 'publicado' },
    }),
  );

  const eventos = resultado.Items ?? [];
  const urls = eventos
    .map(
      (evento) =>
        `  <url><loc>${BASE_URL_PUBLICA}/evento/${escaparXml(String(evento['slug']))}</loc></url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml' },
    body: xml,
  };
}

/**
 * `GET /api/eventos-publicos`, `GET /api/eventos-publicos/{slug}`,
 * `GET /sitemap.xml` — todas públicas, de solo lectura, mismo IAM (decisión
 * de arquitectura: una sola Lambda evita una tercera innecesaria).
 * **Sin autenticación**: nunca usa `exigirRol` ni toca `agora-usuarios`
 * (tech-specs.md §5.1, TODO.md Tarea 1).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (evento.requestContext.http.method !== 'GET') {
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  }

  try {
    if ((evento.rawPath ?? '') === '/sitemap.xml') {
      return await generarSitemap();
    }

    const slug = evento.pathParameters?.['slug'];
    if (slug) {
      return await obtenerEventoPorSlug(slug);
    }

    return await listarEventosPublicos();
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
