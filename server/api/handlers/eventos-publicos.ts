import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { estadoEfectivo, finalizarSiVencido, type EventoParaVigencia } from '../lib/vigencia-evento';
import { respuestaJson } from '../lib/http';

/**
 * Estados de `agora-eventos` que se consultan por el GSI y, tras calcular
 * `estadoEfectivo()` (hotfixes pre-producción), pueden seguir siendo
 * visibles: `publicado`/`agotado` mientras estén vigentes, y `cancelado`
 * mientras esté vigente (con el banner correspondiente — se muestra para
 * que un cliente que ya compró sepa que se canceló, no para vender). Un
 * evento en `borrador` o ya `finalizado` (persistido o por vigencia
 * vencida) nunca aparece en la cartelera ni resuelve por slug.
 */
const ESTADOS_QUE_PUEDEN_SER_VISIBLES = ['publicado', 'agotado', 'cancelado'] as const;
const ESTADOS_VISIBLES = new Set<string>(ESTADOS_QUE_PUEDEN_SER_VISIBLES);

const BASE_URL_PUBLICA = 'https://agora.letiende.co';

// v2 (roadmap #25) — prefijo fijo de cada tipo de vínculo externo; `valor`
// (guardado en `agora-eventos`) solo tiene la parte variable, sin este
// prefijo (tech-specs.md §4.3, mismo criterio de validación que
// `normalizarVinculoExterno` en `eventos.ts`).
const PREFIJOS_VINCULO_EXTERNO: Record<string, string> = {
  whatsapp: 'https://wa.me/57',
  instagram: 'https://www.instagram.com/',
  web: 'https://',
};

/** Construye la URL pública de un objeto bajo `eventos/*` de `BucketActivos` (política pública, no prefirmada). */
function urlPublicaActivo(key: string): string {
  const bucket = process.env['BUCKET_ACTIVOS'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Antepone el prefijo fijo del tipo de vínculo externo a su `valor` variable (ver `PREFIJOS_VINCULO_EXTERNO`). */
function urlVinculoExterno(vinculo: Record<string, unknown>): string | undefined {
  const tipo = vinculo['tipo'];
  const valor = vinculo['valor'];
  if (typeof tipo !== 'string' || typeof valor !== 'string') {
    return undefined;
  }
  const prefijo = PREFIJOS_VINCULO_EXTERNO[tipo];
  return prefijo ? `${prefijo}${valor}` : undefined;
}

/**
 * Proyecta un ítem crudo de `agora-eventos` a la vista pública: nunca
 * incluye `productores` (correos de personal interno, CLAUDE.md §5 A01) y
 * agrega `imagenUrl`/`logotipoUrl` calculadas en el backend a partir de
 * `imagenKey`/`logotipoKey` cuando existen. Reutilizada por las 3 rutas de
 * este handler.
 *
 * v2 (roadmap #25) — `administradoPorLeTiende` se normaliza a `true` cuando
 * el ítem no tiene el atributo (retrocompatibilidad con eventos creados
 * antes de esta tarea), y si trae `vinculoExterno` se agrega
 * `vinculoExternoUrl` con la URL completa ya construida, mismo criterio que
 * `imagenUrl`/`logotipoUrl`.
 */
function aVistaPublica(evento: Record<string, unknown>): Record<string, unknown> {
  const { productores: _productores, ...vista } = evento;

  if (typeof vista['imagenKey'] === 'string') {
    vista['imagenUrl'] = urlPublicaActivo(vista['imagenKey']);
  }
  if (typeof vista['logotipoKey'] === 'string') {
    vista['logotipoUrl'] = urlPublicaActivo(vista['logotipoKey']);
  }

  vista['administradoPorLeTiende'] = vista['administradoPorLeTiende'] !== false;
  if (typeof vista['vinculoExterno'] === 'object' && vista['vinculoExterno'] !== null) {
    vista['vinculoExternoUrl'] = urlVinculoExterno(vista['vinculoExterno'] as Record<string, unknown>);
  }

  return vista;
}

/** Extrae de un ítem crudo de DynamoDB solo los campos que la vigencia necesita. */
function aEventoParaVigencia(evento: Record<string, unknown>): EventoParaVigencia {
  const etapas = Array.isArray(evento['etapas'])
    ? (evento['etapas'] as { cierraEn: string }[])
    : [];
  return { fechaHora: String(evento['fechaHora']), etapas };
}

/**
 * `GET /api/eventos-publicos` — cartelera pública. Un `Query` por cada
 * estado que puede ser visible sobre `estado-fechaHora-index` (nunca
 * `Scan`), combinados y ordenados por `fechaHora`. La visibilidad final la
 * decide `estadoEfectivo()` (vigencia real, no el `estado` persistido) —
 * mientras filtra, esta función también aprovecha para poner al día en la
 * base de datos cualquier evento que ya venció (best-effort, sin bloquear
 * la respuesta al cliente por eso).
 */
async function listarEventosPublicos(): Promise<APIGatewayProxyResultV2> {
  const resultados = await Promise.all(
    ESTADOS_QUE_PUEDEN_SER_VISIBLES.map((estado) =>
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

  const ahora = new Date();
  const finalizacionesPendientes: Promise<void>[] = [];
  const visibles = (resultados.flatMap((resultado) => resultado.Items ?? [])).filter((item) => {
    const estadoPersistido = String(item['estado']);
    const efectivo = estadoEfectivo({ ...aEventoParaVigencia(item), estado: estadoPersistido }, ahora);
    if (efectivo !== estadoPersistido) {
      finalizacionesPendientes.push(
        finalizarSiVencido(process.env['TABLA_EVENTOS'], String(item['eventoId']), estadoPersistido),
      );
    }
    return ESTADOS_VISIBLES.has(efectivo);
  });
  await Promise.all(finalizacionesPendientes);

  const eventos = visibles
    .sort((a, b) => String(a['fechaHora']).localeCompare(String(b['fechaHora'])))
    .map(aVistaPublica);

  return respuestaJson(200, eventos);
}

/**
 * `GET /api/eventos-publicos/{slug}` — detalle público de un evento. `Query`
 * sobre `slug-index` (nunca `Scan`); 404 si no existe o su `estadoEfectivo()`
 * no está en `ESTADOS_VISIBLES` (vigencia real, mismo criterio que
 * `listarEventosPublicos()`, incluida la actualización best-effort).
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
  if (!evento) {
    return respuestaJson(404, { mensaje: 'Evento no encontrado' });
  }

  const estadoPersistido = String(evento['estado']);
  const efectivo = estadoEfectivo({ ...aEventoParaVigencia(evento), estado: estadoPersistido }, new Date());
  if (efectivo !== estadoPersistido) {
    await finalizarSiVencido(process.env['TABLA_EVENTOS'], String(evento['eventoId']), estadoPersistido);
  }
  if (!ESTADOS_VISIBLES.has(efectivo)) {
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
 * pide TODO.md Tarea 1) — descartando además, por vigencia real, cualquiera
 * cuyo `estadoEfectivo()` ya sea `finalizado` aunque el campo persistido
 * todavía diga `publicado` (sin la actualización best-effort acá: el
 * tráfico de rastreo no es el lugar para mantener la base de datos al día,
 * `listarEventosPublicos()` ya lo hace).
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

  const ahora = new Date();
  const eventos = (resultado.Items ?? []).filter(
    (item) => estadoEfectivo({ ...aEventoParaVigencia(item), estado: 'publicado' }, ahora) === 'publicado',
  );
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
