import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';

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
  etapaId: string;
  cantidad: number;
  montoTotal: number;
  cliente?: ClienteCompra;
  medioPago?: string;
  creadaEn: string;
  estado: string;
}

interface BoletaDelEvento {
  boletaId: string;
  estado: string;
}

/**
 * `GET /api/eventos/panel` (`exigirRol('productor')`) — selector del panel
 * (Decisión 1, `TODO.md` Tarea 2): a diferencia de `/puerta`/`/efectivo`
 * (listan todos los eventos publicados, sin filtrar), acá cada productor
 * solo debe ver los eventos donde está asignado — un `administrador` los ve
 * todos, sin filtrar (`tieneAccesoAlEvento`, `lib/autorizacion.ts`). `Scan`
 * sobre `agora-eventos` es aceptable acá: mismo precedente ya establecido
 * por `listarPendientes()` (`aprobaciones.ts`) y `listarEventos()`
 * (`eventos.ts`) para esta misma tabla pequeña — la prohibición de `Scan` de
 * esta tarea aplica solo a `obtenerPanelEvento` (métricas), que sí tiene
 * GSIs provisionados para ese propósito.
 */
async function listarEventosPanel(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'productor');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  const resultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_EVENTOS'] }),
  );
  const eventosPropios = (resultado.Items ?? []).filter((item) =>
    tieneAccesoAlEvento(item, autorizacion.permisos),
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

  const boletas = (resultadoBoletas.Items ?? []) as BoletaDelEvento[];
  const comprasAprobadas = (resultadoCompras.Items ?? []) as CompraAprobada[];
  const etapas = (Array.isArray(eventoItem['etapas']) ? eventoItem['etapas'] : []) as EtapaEvento[];

  const porEtapa = etapas.map((etapa) => {
    const comprasDeEtapa = comprasAprobadas.filter((compra) => compra.etapaId === etapa.etapaId);
    return {
      etapaId: etapa.etapaId,
      nombre: etapa.nombre,
      vendidas: comprasDeEtapa.reduce((total, compra) => total + compra.cantidad, 0),
      recaudado: comprasDeEtapa.reduce((total, compra) => total + compra.montoTotal, 0),
    };
  });

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
    sillasVendidas: sillasTotales - sillasDisponibles - sillasReservadas,
    porEtapa,
    ingresados,
    totalBoletas,
    faltanPorIngresar: totalBoletas - ingresados,
    clientes,
  });
}

/**
 * `GET /api/eventos/panel` y `GET /api/eventos/:eventoId/panel` — ambas
 * `exigirRol('productor')`, solo lectura (`TODO.md` Tarea 2, Panel de
 * control básico). No implementa `GET /api/eventos/:eventoId/reportes`
 * (exportación XLSX/PDF) — v2, fuera de alcance (`docs/tech-specs.md` §11
 * roadmap #21).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const eventoId = evento.pathParameters?.['eventoId'];
  const metodo = evento.requestContext.http.method;

  try {
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
