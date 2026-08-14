import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { verificarFirmaBoleta } from '../lib/firma-boletas';
import { generarQrPng } from '../services/qr';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';

// Placeholder honesto: mismo texto ya usado en el JSON-LD de
// DetalleEventoComponent, no una dirección real verificada (TODO.md
// Tarea 2 no incluye levantar/confirmar la dirección exacta de Le Tiende).
const DIRECCION_LE_TIENDE = 'Bogotá, Colombia';

// Mensaje único para "firma inválida" y "boleta inexistente" — nunca
// distinguir los dos casos, o la respuesta se vuelve un oráculo que permite
// enumerar boletaId reales probando firmas (CLAUDE.md §5, A02).
const MENSAJE_BOLETA_INVALIDA = 'Boleta inválida o inexistente';

interface BoletaAlmacenada {
  boletaId: string;
  eventoId: string;
  compraId: string;
  numeroEnCompra: number;
  etapaId: string;
  valorUnitario: number;
  estado: string;
  ingresoEn?: string;
  ingresoPor?: string;
  emitidaEn: string;
}

/** Construye la URL pública de un objeto bajo `eventos/*` de `BucketActivos` — mismo criterio que `eventos-publicos.ts`. */
function urlPublicaActivo(key: string): string {
  const bucket = process.env['BUCKET_ACTIVOS'];
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Separa `{boletaId}.{firma}` por el último punto — el UUID no contiene puntos, la firma tampoco. */
function separarCodigo(codigo: string): { boletaId: string; firma: string } | null {
  const indice = codigo.lastIndexOf('.');
  if (indice <= 0 || indice === codigo.length - 1) {
    return null;
  }
  return { boletaId: codigo.slice(0, indice), firma: codigo.slice(indice + 1) };
}

function esErrorCondicionFallida(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

function leerCuerpo(evento: APIGatewayProxyEventV2): unknown {
  if (!evento.body) {
    return null;
  }
  try {
    return JSON.parse(evento.body);
  } catch {
    return undefined;
  }
}

/**
 * `GET /api/boletas/:codigo` — público, firma HMAC obligatoria (`tech-specs.md`
 * §5.5, `TODO.md` Tarea 2). La firma se verifica **antes** de cualquier
 * lectura a DynamoDB (rechazo barato), y la respuesta es idéntica tanto si
 * la firma es inválida como si el `boletaId` no existe — nunca se distingue,
 * para no dar pie a enumerar boletas reales probando firmas.
 *
 * Deliberadamente no valida el ingreso — eso es `POST /api/boletas/:codigo/validar`
 * (roadmap #13, Validación en puerta), todavía sin implementar.
 */
async function obtenerBoletaDigital(codigo: string | undefined): Promise<APIGatewayProxyResultV2> {
  if (!codigo) {
    return respuestaJson(400, { mensaje: 'Falta el código de la boleta en la ruta' });
  }

  const separado = separarCodigo(codigo);
  if (!separado || !verificarFirmaBoleta(separado.boletaId, separado.firma)) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }
  const { boletaId } = separado;

  const resultadoBoleta = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_BOLETAS'], Key: { boletaId } }),
  );
  const boleta = resultadoBoleta.Item as BoletaAlmacenada | undefined;
  if (!boleta) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }

  const [resultadoEvento, resultadoCompra] = await Promise.all([
    documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: boleta.eventoId } }),
    ),
    documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_COMPRAS'], Key: { compraId: boleta.compraId } }),
    ),
  ]);
  const evento = resultadoEvento.Item;
  const compra = resultadoCompra.Item;
  if (!evento) {
    return respuestaJson(404, { mensaje: MENSAJE_BOLETA_INVALIDA });
  }

  const etapas = Array.isArray(evento['etapas']) ? evento['etapas'] : [];
  const etapa = etapas.find((e: Record<string, unknown>) => e['etapaId'] === boleta.etapaId) as
    | Record<string, unknown>
    | undefined;

  const urlBase = process.env['URL_BASE_APP'] ?? '';
  const urlBoleta = `${urlBase}/boleta/${codigo}`;
  const qrPng = (await generarQrPng(urlBoleta)).toString('base64');

  return respuestaJson(200, {
    boletaId: boleta.boletaId,
    numeroEnCompra: boleta.numeroEnCompra,
    estado: boleta.estado,
    nombreEvento: evento['nombre'],
    descripcionEvento: evento['descripcion'],
    fechaHora: evento['fechaHora'],
    direccion: DIRECCION_LE_TIENDE,
    logotipoUrl: typeof evento['logotipoKey'] === 'string' ? urlPublicaActivo(evento['logotipoKey']) : undefined,
    etapaNombre: etapa?.['nombre'],
    nombreCliente: compra?.['cliente']?.['nombre'],
    qrPng,
  });
}

/**
 * Tras un fallo de la condición combinada de `validarBoletaEnPuerta`,
 * clasifica el motivo con una lectura **posterior** al intento de
 * escritura — nunca antes, mismo criterio que `clasificarFalloReserva` de
 * `aforo.ts`. Distingue explícitamente `OTRO_EVENTO` de `YA_USADA` (con la
 * hora del primer ingreso) — nunca un veredicto genérico, el portero
 * necesita decidir de pie con una fila esperando (`PRD.md` §5.5).
 */
async function clasificarFalloValidacion(
  boletaId: string,
  eventoIdEsperado: string,
): Promise<Record<string, unknown>> {
  const resultado = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_BOLETAS'], Key: { boletaId } }),
  );
  const boleta = resultado.Item as BoletaAlmacenada | undefined;
  if (!boleta) {
    return { veredicto: 'NO_EXISTE' };
  }
  if (boleta.eventoId !== eventoIdEsperado) {
    return { veredicto: 'OTRO_EVENTO' };
  }
  return { veredicto: 'YA_USADA', ingresoEn: boleta.ingresoEn };
}

/**
 * `POST /api/boletas/:codigo/validar` (`exigirRol('portero')`, `{ eventoId }`)
 * — escritura condicional única (`estado = 'valida' AND eventoId = :eventoId`,
 * `CLAUDE.md` §5 A04 Regla 3): nunca lectura seguida de escritura. Siempre
 * responde `200` con un `veredicto` — un resultado de negocio esperado
 * (boleta ya usada, de otro evento) no es un error HTTP, mismo criterio que
 * otros endpoints de este proyecto que devuelven distintos `estado` en `200`.
 *
 * A diferencia de `GET /api/boletas/:codigo` (público, que nunca distingue
 * "firma inválida" de "no existe" para no dar pie a enumerar boletas), acá
 * el llamador ya es personal autenticado escaneando una boleta real —
 * distinguir los cuatro veredictos es un requisito de UX explícito, no una
 * filtración (`tech-specs.md` §5.5).
 */
async function validarBoletaEnPuerta(
  codigo: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'portero');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  if (!codigo) {
    return respuestaJson(400, { mensaje: 'Falta el código de la boleta en la ruta' });
  }
  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;
  const eventoIdEsperado = datos['eventoId'];
  if (typeof eventoIdEsperado !== 'string' || eventoIdEsperado.length === 0) {
    return respuestaJson(400, { mensaje: 'Falta eventoId' });
  }

  const separado = separarCodigo(codigo);
  if (!separado || !verificarFirmaBoleta(separado.boletaId, separado.firma)) {
    return respuestaJson(200, { veredicto: 'NO_EXISTE' });
  }
  const { boletaId } = separado;

  // Autorización real por evento (`TODO.md` Tarea 1, T8) — **decisión de
  // rendimiento explícita, no dejada implícita**: hasta esta tarea, esta
  // ruta hacía una única escritura condicional sin ninguna lectura previa en
  // el camino feliz, la más sensible a latencia de todo el sistema (`PRD.md`
  // §8, veredicto en ≤5s durante un escaneo en ráfaga). Agregar este chequeo
  // exige un `GetItem` extra por clave primaria — la operación más barata
  // posible en DynamoDB, de un solo dígito de milisegundos — que se acepta
  // frente al riesgo de dejar sin verificar que un portero valide ingresos
  // de un evento donde no está asignado (`docs/plan-pre-produccion.md` T8).
  // Un `eventoId` que no existe en absoluto (payload manipulado) se trata
  // igual que "no asignado": nunca se distingue, mismo criterio que
  // `MENSAJE_BOLETA_INVALIDA` arriba (no dar pistas de qué existe y qué no).
  const resultadoEvento = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId: eventoIdEsperado } }),
  );
  if (!resultadoEvento.Item || !tieneAccesoAlEvento(resultadoEvento.Item, autorizacion.permisos)) {
    return respuestaJson(403, { mensaje: 'No estás asignado a este evento' });
  }

  try {
    const resultado = await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_BOLETAS'],
        Key: { boletaId },
        UpdateExpression: 'SET estado = :usada, ingresoEn = :ahora, ingresoPor = :correo',
        ConditionExpression: 'estado = :valida AND eventoId = :eventoId',
        ExpressionAttributeValues: {
          ':usada': 'usada',
          ':valida': 'valida',
          ':eventoId': eventoIdEsperado,
          ':ahora': new Date().toISOString(),
          ':correo': autorizacion.permisos.email,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const boletaActualizada = resultado.Attributes as BoletaAlmacenada | undefined;
    return respuestaJson(200, {
      veredicto: 'VALIDA',
      boletaId,
      numeroEnCompra: boletaActualizada?.numeroEnCompra,
    });
  } catch (error) {
    if (!esErrorCondicionFallida(error)) {
      throw error;
    }
    return respuestaJson(200, await clasificarFalloValidacion(boletaId, eventoIdEsperado));
  }
}

/**
 * `GET /api/boletas/:codigo` (público) y `POST /api/boletas/:codigo/validar`
 * (`exigirRol('portero')`) — `TODO.md` Tarea 2 (Emisión de boletas) y
 * Tarea 2 (Validación en puerta).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const codigo = evento.pathParameters?.['codigo'];
  const metodo = evento.requestContext.http.method;
  const rawPath = evento.rawPath ?? '';

  try {
    if (metodo === 'GET') {
      return await obtenerBoletaDigital(codigo);
    }
    if (metodo === 'POST' && rawPath.endsWith('/validar')) {
      return await validarBoletaEnPuerta(codigo, evento);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
