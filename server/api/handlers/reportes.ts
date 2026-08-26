import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as XLSX from 'xlsx';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';

// v2 (roadmap #24) — etiqueta de una compra/boleta de un evento sin etapas
// de boletería, distinta de 'Etapa eliminada' (que sí implica una etapa que
// existió y fue borrada).
const NOMBRE_SIN_ETAPA = 'Sin etapa (boletería sin cobro)';

interface EtapaEvento {
  etapaId: string;
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

interface ClienteCompra {
  nombre: string;
  telefono: string;
  correo: string;
}

interface CompraAprobada {
  compraId: string;
  eventoId: string;
  // v2 (roadmap #24) — ausente en una compra de un evento sin etapas.
  etapaId?: string;
  cantidad: number;
  montoTotal: number;
  cliente?: ClienteCompra;
  medioPago?: string;
  creadaEn: string;
  estado: string;
}

interface BoletaDelEvento {
  boletaId: string;
  compraId: string;
  etapaId?: string;
  valorUnitario: number;
  estado: string;
  ingresoEn?: string;
}

/**
 * `fechaIso` (UTC ISO 8601, formato de almacenamiento — `CLAUDE.md` §4) →
 * texto legible en hora de Bogotá para el `.xlsx` de `generarReporteEvento()`
 * (la única capa de presentación que corre en este archivo). Mismo offset
 * fijo `-05:00` que `src/app/shared/utilidades/fecha-bogota.ts`: Colombia no
 * observa horario de verano desde 1993. No se importa esa utilidad de
 * `src/app/` porque vive fuera del `rootDir` del bundle de las Lambdas
 * (`server/bundle-lambdas.mjs`) — mismo motivo que las interfaces copiadas
 * arriba en vez de importadas de `src/app/core/models`.
 */
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
function fechaLegibleBogota(fechaIso: string): string {
  const instante = new Date(Date.parse(fechaIso) - OFFSET_BOGOTA_MS);
  const año = instante.getUTCFullYear();
  const mes = String(instante.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(instante.getUTCDate()).padStart(2, '0');
  const horas = String(instante.getUTCHours()).padStart(2, '0');
  const minutos = String(instante.getUTCMinutes()).padStart(2, '0');
  return `${año}-${mes}-${dia} ${horas}:${minutos}`;
}

/**
 * Query pareada a `agora-boletas` (`eventoId-estado-index`) y
 * `agora-compras` (`eventoId-creadaEn-index`, filtro `estado = 'aprobada'`)
 * — compartida por `obtenerPanelEvento()` (métricas) y
 * `generarReporteEvento()` (exportación XLSX, `TODO.md` Tarea 2) para no
 * repetir el mismo par de `Query` dos veces en este archivo. Nunca `Scan`
 * (`CLAUDE.md` §5, A04/costos) — ambas consultas ya usan los GSIs
 * provisionados para este propósito.
 */
async function obtenerDatosCrudosDelEvento(
  eventoId: string,
): Promise<{ boletas: BoletaDelEvento[]; comprasAprobadas: CompraAprobada[] }> {
  const [resultadoBoletas, resultadoCompras] = await Promise.all([
    documentoDynamoDB.send(
      new QueryCommand({
        TableName: process.env['TABLA_BOLETAS'],
        IndexName: 'eventoId-estado-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        ExpressionAttributeValues: { ':eventoId': eventoId },
      }),
    ),
    documentoDynamoDB.send(
      new QueryCommand({
        TableName: process.env['TABLA_COMPRAS'],
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :aprobada',
        ExpressionAttributeValues: { ':eventoId': eventoId, ':aprobada': 'aprobada' },
      }),
    ),
  ]);

  return {
    boletas: (resultadoBoletas.Items ?? []) as BoletaDelEvento[],
    comprasAprobadas: (resultadoCompras.Items ?? []) as CompraAprobada[],
  };
}

/**
 * `GET /api/eventos/panel` (`exigirRol('portero')`) — selector genérico de
 * "mis eventos asignados" (Decisión 1, `TODO.md` Tarea 2; generalizado en
 * `TODO.md` Tarea 1, T8): originalmente exclusivo de `productor` para el
 * panel de control, ahora también lo consumen `SeleccionVentaEfectivoComponent`/
 * `SeleccionPuertaComponent` (`portero`) — `tieneAccesoAlEvento` ya resuelve
 * los tres roles (`administrador` ve todos, `productor` por `productores`,
 * `portero` por `porteros`), así que bajar el `rolMinimo` es el único cambio
 * necesario aquí; el filtrado real no se toca. `Scan` sobre `agora-eventos`
 * es aceptable acá: mismo precedente ya establecido por `listarPendientes()`
 * (`aprobaciones.ts`) y `listarEventos()` (`eventos.ts`) para esta misma
 * tabla pequeña — la prohibición de `Scan` de `TODO.md` Tarea 2 aplica solo
 * a `obtenerPanelEvento` (métricas), que sí tiene GSIs provisionados para
 * ese propósito.
 *
 * v2 (roadmap #25) — además excluye eventos con `administradoPorLeTiende:
 * false` (boletería externa): al no administrar Le Tiende su boletería, esos
 * eventos siempre tienen `sillasTotales: 0`, `etapas: []` y `mediosPago: []`
 * (neutralizados por `eventos.ts`), así que no hay aforo que mostrar en el
 * panel de métricas, nada que vender en efectivo, ni ninguna boleta que
 * validar en puerta — el filtro aplica a los tres selectores que comparten
 * este endpoint, no solo al panel. Mismo criterio de retrocompatibilidad que
 * `listarEventos()` (`eventos.ts`): `!== false` trata un evento sin ese
 * atributo (creado antes de esta tarea) como `true` por defecto.
 */
async function listarEventosPanel(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'portero');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  const resultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_EVENTOS'] }),
  );
  const eventosPropios = (resultado.Items ?? []).filter(
    (item) =>
      tieneAccesoAlEvento(item, autorizacion.permisos) &&
      item['administradoPorLeTiende'] !== false,
  );

  return respuestaJson(
    200,
    eventosPropios.map((item) => ({
      eventoId: item['eventoId'],
      slug: item['slug'],
      nombre: item['nombre'],
      fechaHora: item['fechaHora'],
      estado: item['estado'],
    })),
  );
}

/**
 * `GET /api/eventos/:eventoId/panel` (`exigirRol('productor')` + acceso al
 * evento puntual, `TODO.md` Tarea 2 — Panel de control básico) — pantalla
 * 100% de solo lectura: boletas vendidas/recaudado por etapa, aforo, lista
 * de clientes e ingresados/faltan por ingresar (el dato más urgente el día
 * del evento, `PRD.md` §5.6). Las métricas se calculan siempre con `Query`
 * sobre los GSIs ya provisionados (`eventoId-estado-index` de
 * `agora-boletas`, `eventoId-creadaEn-index` de `agora-compras`) — nunca
 * `Scan` (`CLAUDE.md` §5, A04/costos).
 */
async function obtenerPanelEvento(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'productor');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const resultadoEvento = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
  );
  const eventoItem = resultadoEvento.Item;
  if (!eventoItem) {
    return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
  }
  if (!tieneAccesoAlEvento(eventoItem, autorizacion.permisos)) {
    return respuestaJson(403, { mensaje: 'No autorizado para este evento' });
  }

  const { boletas, comprasAprobadas } = await obtenerDatosCrudosDelEvento(eventoId);
  const etapas = (Array.isArray(eventoItem['etapas']) ? eventoItem['etapas'] : []) as EtapaEvento[];

  // Se agrupa por el etapaId propio de cada compra, no por `evento.etapas`:
  // `normalizarEtapas()` (handlers/eventos.ts) ya preserva el etapaId real
  // en cada `PUT` que incluya `etapas` (TODO.md Tarea 2, 11/08/2026), pero
  // este agrupamiento se deja como defensa permanente para cualquier etapa
  // huérfana histórica (datos de antes del fix) o legado sin migrar — así
  // esas ventas nunca desaparecen de `porEtapa` sin ningún error visible.
  const nombresPorEtapaId = new Map(etapas.map((etapa) => [etapa.etapaId, etapa.nombre]));
  const idsEtapaEnCompras = new Set(comprasAprobadas.map((compra) => compra.etapaId));
  // Orden: primero las etapas conocidas en el orden declarado por el
  // evento, luego los etapaId huérfanos (sin coincidencia en `etapas`) en el
  // orden en que aparecen en las compras.
  const idsConocidosConVentas = etapas.map((etapa) => etapa.etapaId).filter((id) => idsEtapaEnCompras.has(id));
  // `id === undefined` (compra de un evento sin etapas, roadmap #24) cuenta
  // igual como "no es una etapa conocida" — se evalúa antes de `.has(id)`
  // para no llamarlo con `undefined`.
  const idsHuerfanos = Array.from(idsEtapaEnCompras).filter(
    (id) => id === undefined || !nombresPorEtapaId.has(id),
  );
  const porEtapa = [...idsConocidosConVentas, ...idsHuerfanos].map((etapaId) => {
    const comprasDeEtapa = comprasAprobadas.filter((compra) => compra.etapaId === etapaId);
    return {
      etapaId,
      // v2 (roadmap #24) — `etapaId === undefined` es una compra genuina de
      // un evento sin etapas (boletería sin cobro), no una etapa borrada:
      // se distingue de 'Etapa eliminada' (etapaId presente pero huérfano)
      // para no confundir al productor sobre qué pasó con esas ventas.
      nombre: etapaId === undefined ? NOMBRE_SIN_ETAPA : (nombresPorEtapaId.get(etapaId) ?? 'Etapa eliminada'),
      vendidas: comprasDeEtapa.reduce((total, compra) => total + compra.cantidad, 0),
      recaudado: comprasDeEtapa.reduce((total, compra) => total + compra.montoTotal, 0),
    };
  });

  // Totales calculados directamente sobre TODAS las compras aprobadas, sin
  // pasar por `etapas` en absoluto — nunca pueden desaparecer aunque
  // `porEtapa` tenga etapas huérfanas.
  const totalVendidas = comprasAprobadas.reduce((total, compra) => total + compra.cantidad, 0);
  const totalRecaudado = comprasAprobadas.reduce((total, compra) => total + compra.montoTotal, 0);

  const ingresados = boletas.filter((boleta) => boleta.estado === 'usada').length;
  const totalBoletas = boletas.length;

  const sillasTotales = eventoItem['sillasTotales'] as number;
  const sillasDisponibles = eventoItem['sillasDisponibles'] as number;
  const sillasReservadas = eventoItem['sillasReservadas'] as number;

  // Mismo criterio de exposición de datos personales que
  // `obtenerDetalleAprobacion()` en `aprobaciones.ts`: quien pide esto ya
  // está autenticado y autorizado para este evento puntual.
  const clientes = comprasAprobadas.map((compra) => ({
    compraId: compra.compraId,
    nombre: compra.cliente?.nombre,
    telefono: compra.cliente?.telefono,
    correo: compra.cliente?.correo,
    cantidad: compra.cantidad,
    montoTotal: compra.montoTotal,
    etapaId: compra.etapaId,
    medioPago: compra.medioPago,
    creadaEn: compra.creadaEn,
  }));

  return respuestaJson(200, {
    nombreEvento: eventoItem['nombre'],
    sillasTotales,
    sillasDisponibles,
    sillasReservadas,
    sillasVendidas: sillasTotales - sillasDisponibles - sillasReservadas,
    porEtapa,
    totalVendidas,
    totalRecaudado,
    ingresados,
    totalBoletas,
    faltanPorIngresar: totalBoletas - ingresados,
    clientes,
  });
}

/**
 * `GET /api/eventos/:eventoId/reportes?formato=xlsx|pdf` (`exigirRol('productor')`
 * + `tieneAccesoAlEvento`, `TODO.md` Tarea 2 — Exportación de reportes en
 * XLSX) — genera un `.xlsx` con **una fila por boleta** del evento (no por
 * compra), columnas exactas de `PRD.md` §5.6: ID (el `compraId`, para
 * agrupar boletas de una misma compra), cliente, fecha/hora de compra,
 * medio de pago, valor, etapa y fecha/hora de ingreso.
 *
 * `?formato=pdf` responde `501` explícito — mismo criterio que las boletas
 * gratuitas en `compras.ts`/`ventas-efectivo.ts`: nunca se decidió librería
 * ni diseño de PDF (`docs/tech-specs.md` §2, "PDF por definir"), mejor un
 * 501 claro que una implementación a medias.
 *
 * La descarga nunca va en el cuerpo de la respuesta ni por URL pública
 * (`CLAUDE.md` §5, A02: el archivo contiene datos personales de clientes) —
 * se sube en memoria a `BucketComprobantes` (ya privado, ya con Block
 * Public Access) bajo `reportes/{eventoId}/{uuid}.xlsx` y se devuelve una
 * URL prefirmada de `GetObject` de vida corta (`expiresIn: 900`, mismo
 * mecanismo ya usado tres veces en `comprobantes.ts`/`aprobaciones.ts`/
 * `eventos.ts`). El objeto sube a un bucket ya existente — nunca se crea
 * un bucket nuevo (`CLAUDE.md` §5-bis, costos); `serverless.yml` agrega un
 * `LifecycleConfiguration` corto sobre el prefijo `reportes/*` para no
 * acumular archivos huérfanos.
 */
async function generarReporteEvento(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'productor');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const formato = evento.queryStringParameters?.['formato'];
  if (formato === 'pdf') {
    return respuestaJson(501, { mensaje: 'La exportación de reportes en PDF todavía no está soportada' });
  }
  if (formato !== 'xlsx') {
    return respuestaJson(400, { mensaje: "formato debe ser 'xlsx' o 'pdf'" });
  }

  const resultadoEvento = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
  );
  const eventoItem = resultadoEvento.Item;
  if (!eventoItem) {
    return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
  }
  if (!tieneAccesoAlEvento(eventoItem, autorizacion.permisos)) {
    return respuestaJson(403, { mensaje: 'No autorizado para este evento' });
  }

  const { boletas, comprasAprobadas } = await obtenerDatosCrudosDelEvento(eventoId);
  const etapas = (Array.isArray(eventoItem['etapas']) ? eventoItem['etapas'] : []) as EtapaEvento[];
  const nombresPorEtapaId = new Map(etapas.map((etapa) => [etapa.etapaId, etapa.nombre]));
  const comprasPorId = new Map(comprasAprobadas.map((compra) => [compra.compraId, compra]));

  // Una fila por boleta, no por compra (PRD.md §5.6) — unidas por
  // `compraId`. Una boleta sin compra aprobada correspondiente (dato
  // inconsistente, no debería ocurrir en la práctica) NUNCA se descarta:
  // se emite igual, con las columnas que dependen de la compra marcadas
  // como 'N/D'. Así el número de filas del .xlsx siempre coincide con
  // `totalBoletas` (el mismo total que muestra el panel), y cualquier
  // inconsistencia de datos queda visible en el propio reporte en vez de
  // desaparecer en silencio. `ID` es la excepción: es `boleta.compraId`
  // directo (la llave foránea real de la boleta hacia su compra), nunca
  // 'N/D' aunque la compra no se encuentre — permite agrupar en el .xlsx
  // las boletas de una misma compra incluso en ese caso.
  const filas = boletas.map((boleta) => {
    const compra = comprasPorId.get(boleta.compraId);
    return {
      ID: boleta.compraId,
      Cliente: compra?.cliente?.nombre ?? 'N/D',
      Teléfono: compra?.cliente?.telefono ?? 'N/D',
      Correo: compra?.cliente?.correo ?? 'N/D',
      'Fecha y hora de compra': compra ? fechaLegibleBogota(compra.creadaEn) : 'N/D',
      'Medio de pago': compra?.medioPago ?? 'N/D',
      Valor: boleta.valorUnitario,
      'Etapa de boletería':
        boleta.etapaId === undefined
          ? NOMBRE_SIN_ETAPA
          : (nombresPorEtapaId.get(boleta.etapaId) ?? 'Etapa eliminada'),
      'Fecha y hora de ingreso': boleta.ingresoEn ? fechaLegibleBogota(boleta.ingresoEn) : '',
    };
  });

  // Mismo patrón exacto que Babel (server/api/handlers/ventas.ts):
  // book_new() + json_to_sheet() + book_append_sheet(). `type: 'buffer'`
  // en vez de 'base64' porque acá el resultado sube a S3 (PutObjectCommand
  // recibe un Buffer directo), no viaja en el cuerpo de la respuesta.
  const libro = XLSX.utils.book_new();
  const hoja = XLSX.utils.json_to_sheet(filas);
  XLSX.utils.book_append_sheet(libro, hoja, 'Boletas');
  const contenido = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const key = `reportes/${eventoId}/${randomUUID()}.xlsx`;
  await clienteS3.send(
    new PutObjectCommand({
      Bucket: process.env['BUCKET_COMPROBANTES'],
      Key: key,
      Body: contenido,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );

  // `ResponseContentDisposition` fuerza el nombre de archivo legible del
  // reporte descargado (`reporte-{slug}.xlsx`) en vez del UUID interno de
  // la `key` de S3 — el slug del evento ya es texto seguro para un nombre
  // de archivo (kebab-case, sin espacios ni tildes, `handlers/eventos.ts`),
  // así que no hace falta sanitizarlo aparte.
  const nombreArchivo = `reporte-${eventoItem['slug'] ?? eventoId}.xlsx`;
  const url = await getSignedUrl(
    clienteS3,
    new GetObjectCommand({
      Bucket: process.env['BUCKET_COMPROBANTES'],
      Key: key,
      ResponseContentDisposition: `attachment; filename="${nombreArchivo}"`,
    }),
    { expiresIn: 900 },
  );

  return respuestaJson(200, { url });
}

/**
 * `GET /api/eventos/panel` (`exigirRol('portero')`, generalizado en
 * `TODO.md` Tarea 1 T8), `GET /api/eventos/:eventoId/panel` (métricas de
 * solo lectura) y `GET /api/eventos/:eventoId/reportes?formato=xlsx|pdf`
 * (exportación, `TODO.md` Tarea 2) — estas dos últimas siguen exigiendo
 * `exigirRol('productor')`: son exclusivas del panel de control, no de
 * `portero`.
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const eventoId = evento.pathParameters?.['eventoId'];
  const metodo = evento.requestContext.http.method;
  const esReportes = (evento.rawPath ?? '').endsWith('/reportes');

  try {
    if (esReportes && metodo === 'GET') {
      return await generarReporteEvento(eventoId, evento);
    }
    if (metodo === 'GET' && !eventoId) {
      return await listarEventosPanel(evento);
    }
    if (metodo === 'GET' && eventoId) {
      return await obtenerPanelEvento(eventoId, evento);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
