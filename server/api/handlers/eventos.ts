import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { exigirRol } from '../lib/autorizacion';
import { respuestaJson } from '../lib/http';

export type EstadoEvento = 'borrador' | 'publicado' | 'agotado' | 'finalizado' | 'cancelado';
export type MedioPago = 'bold' | 'efectivo' | 'transferencia';

const ESTADOS_VALIDOS: readonly EstadoEvento[] = [
  'borrador',
  'publicado',
  'agotado',
  'finalizado',
  'cancelado',
];
const MEDIOS_PAGO_VALIDOS: readonly MedioPago[] = ['bold', 'efectivo', 'transferencia'];

// Comprobantes usan el mismo criterio (CLAUDE.md §5, A08): nunca SVG (vector
// de XSS), el tipo se restringe por magic bytes en la carga, no aquí — esta
// lista solo acota qué `Content-Type` puede pedir la URL prefirmada.
const TIPOS_MIME_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TAMANO_MAXIMO_IMAGEN_BYTES = 10 * 1024 * 1024;

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

function esTextoValido(valor: unknown, longitudMaxima: number): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= longitudMaxima;
}

function esSlugValido(valor: unknown): valor is string {
  return (
    typeof valor === 'string' && valor.length <= 120 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(valor)
  );
}

function esFechaIsoValida(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

function esEnteroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

function esEmailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

interface EtapaBoleteriaEntrada {
  etapaId: string;
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

/**
 * Valida el arreglo de etapas y genera `etapaId` en el backend para cada una
 * — mismo criterio que `eventoId` (A08): ningún identificador se acepta del
 * cliente. Devuelve `null` si el arreglo es inválido.
 */
function normalizarEtapas(valor: unknown): EtapaBoleteriaEntrada[] | null {
  if (!Array.isArray(valor) || valor.length === 0) {
    return null;
  }

  const etapas: EtapaBoleteriaEntrada[] = [];
  for (const item of valor) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }
    const registro = item as Record<string, unknown>;
    if (
      !esTextoValido(registro['nombre'], 100) ||
      !esEnteroNoNegativo(registro['precio']) ||
      !esFechaIsoValida(registro['cierraEn']) ||
      typeof registro['orden'] !== 'number'
    ) {
      return null;
    }
    etapas.push({
      etapaId: randomUUID(),
      nombre: registro['nombre'],
      precio: registro['precio'],
      cierraEn: registro['cierraEn'],
      orden: registro['orden'],
    });
  }
  return etapas;
}

function normalizarMediosPago(valor: unknown): MedioPago[] | null {
  if (!Array.isArray(valor) || valor.length === 0) {
    return null;
  }
  const medios = valor.filter(
    (item): item is MedioPago =>
      typeof item === 'string' && (MEDIOS_PAGO_VALIDOS as readonly string[]).includes(item),
  );
  return medios.length === valor.length ? medios : null;
}

function normalizarProductores(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) {
    return null;
  }
  const correos = valor.filter(esEmailValido);
  return correos.length === valor.length ? correos : null;
}

async function listarEventos(): Promise<APIGatewayProxyResultV2> {
  const resultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_EVENTOS'] }),
  );
  return respuestaJson(200, resultado.Items ?? []);
}

async function crearEvento(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (
    !esSlugValido(datos['slug']) ||
    !esTextoValido(datos['nombre'], 200) ||
    !esTextoValido(datos['descripcion'], 5000) ||
    !esFechaIsoValida(datos['fechaHora']) ||
    !esEnteroPositivo(datos['sillasTotales']) ||
    !esEnteroPositivo(datos['maxBoletasPorCompra'])
  ) {
    return respuestaJson(400, {
      mensaje: 'slug, nombre, descripcion, fechaHora, sillasTotales y maxBoletasPorCompra son obligatorios y deben ser válidos',
    });
  }

  const etapas = normalizarEtapas(datos['etapas']);
  if (!etapas) {
    return respuestaJson(400, { mensaje: 'etapas debe ser un arreglo con al menos una etapa válida' });
  }

  const mediosPago = normalizarMediosPago(datos['mediosPago']);
  if (!mediosPago) {
    return respuestaJson(400, { mensaje: 'mediosPago debe ser un arreglo con al menos un medio válido' });
  }

  const productores = normalizarProductores(datos['productores'] ?? []);
  if (!productores) {
    return respuestaJson(400, { mensaje: 'productores debe ser un arreglo de correos válidos' });
  }

  const plazoComprobanteMinutos = esEnteroPositivo(datos['plazoComprobanteMinutos'])
    ? datos['plazoComprobanteMinutos']
    : 10;

  const ahora = new Date().toISOString();
  const eventoId = randomUUID();
  const item = {
    eventoId,
    slug: datos['slug'],
    nombre: datos['nombre'],
    descripcion: datos['descripcion'],
    fechaHora: datos['fechaHora'],
    sillasTotales: datos['sillasTotales'],
    // Regla obligatoria (TODO.md Tarea 1, CLAUDE.md §5 A08): el aforo se
    // inicializa en la misma escritura, nunca se acepta del payload.
    sillasDisponibles: datos['sillasTotales'],
    sillasReservadas: 0,
    etapas,
    maxBoletasPorCompra: datos['maxBoletasPorCompra'],
    mediosPago,
    plazoComprobanteMinutos,
    productores,
    estado: 'borrador' as EstadoEvento,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };

  try {
    // Sin lectura previa: la condición evita colisionar con un eventoId ya
    // existente bajo concurrencia (mismo criterio que agora-usuarios).
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Item: item,
        ConditionExpression: 'attribute_not_exists(eventoId)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'Ya existe un evento con ese identificador, intenta de nuevo' });
    }
    throw error;
  }

  return respuestaJson(201, item);
}

/**
 * Campos editables por `PUT /api/eventos/:eventoId`. Deliberadamente
 * excluye `eventoId`, `slug`, `sillasTotales`, `sillasDisponibles` y
 * `sillasReservadas` — el aforo (incluida cualquier resta/reasignación de
 * `sillasTotales`) es responsabilidad exclusiva del motor de aforo
 * (roadmap #8, todavía no existe); hasta entonces esos campos solo se
 * editan internamente, nunca vía este endpoint (TODO.md Tarea 1).
 */
async function actualizarEvento(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const asignaciones: string[] = [];
  const nombresAtributos: Record<string, string> = {};
  const valoresExpresion: Record<string, unknown> = {};

  const agregar = (campo: string, marcador: string, valor: unknown): void => {
    asignaciones.push(`${marcador} = :${campo}`);
    nombresAtributos[marcador] = campo;
    valoresExpresion[`:${campo}`] = valor;
  };

  if (datos['nombre'] !== undefined) {
    if (!esTextoValido(datos['nombre'], 200)) {
      return respuestaJson(400, { mensaje: 'nombre inválido' });
    }
    agregar('nombre', '#nombre', datos['nombre']);
  }
  if (datos['descripcion'] !== undefined) {
    if (!esTextoValido(datos['descripcion'], 5000)) {
      return respuestaJson(400, { mensaje: 'descripcion inválida' });
    }
    agregar('descripcion', '#descripcion', datos['descripcion']);
  }
  if (datos['fechaHora'] !== undefined) {
    if (!esFechaIsoValida(datos['fechaHora'])) {
      return respuestaJson(400, { mensaje: 'fechaHora inválida' });
    }
    agregar('fechaHora', '#fechaHora', datos['fechaHora']);
  }
  if (datos['maxBoletasPorCompra'] !== undefined) {
    if (!esEnteroPositivo(datos['maxBoletasPorCompra'])) {
      return respuestaJson(400, { mensaje: 'maxBoletasPorCompra inválido' });
    }
    agregar('maxBoletasPorCompra', '#maxBoletasPorCompra', datos['maxBoletasPorCompra']);
  }
  if (datos['plazoComprobanteMinutos'] !== undefined) {
    if (!esEnteroPositivo(datos['plazoComprobanteMinutos'])) {
      return respuestaJson(400, { mensaje: 'plazoComprobanteMinutos inválido' });
    }
    agregar('plazoComprobanteMinutos', '#plazoComprobanteMinutos', datos['plazoComprobanteMinutos']);
  }
  if (datos['etapas'] !== undefined) {
    const etapas = normalizarEtapas(datos['etapas']);
    if (!etapas) {
      return respuestaJson(400, { mensaje: 'etapas inválidas' });
    }
    agregar('etapas', '#etapas', etapas);
  }
  if (datos['mediosPago'] !== undefined) {
    const mediosPago = normalizarMediosPago(datos['mediosPago']);
    if (!mediosPago) {
      return respuestaJson(400, { mensaje: 'mediosPago inválido' });
    }
    agregar('mediosPago', '#mediosPago', mediosPago);
  }
  if (datos['productores'] !== undefined) {
    const productores = normalizarProductores(datos['productores']);
    if (!productores) {
      return respuestaJson(400, { mensaje: 'productores inválido' });
    }
    agregar('productores', '#productores', productores);
  }
  if (datos['estado'] !== undefined) {
    if (
      typeof datos['estado'] !== 'string' ||
      !(ESTADOS_VALIDOS as readonly string[]).includes(datos['estado'])
    ) {
      return respuestaJson(400, { mensaje: 'estado inválido' });
    }
    agregar('estado', '#estado', datos['estado']);
  }
  if (datos['imagenKey'] !== undefined) {
    if (typeof datos['imagenKey'] !== 'string' || !datos['imagenKey'].startsWith(`eventos/${eventoId}/`)) {
      return respuestaJson(400, { mensaje: 'imagenKey inválida' });
    }
    agregar('imagenKey', '#imagenKey', datos['imagenKey']);
  }
  if (datos['logotipoKey'] !== undefined) {
    if (typeof datos['logotipoKey'] !== 'string' || !datos['logotipoKey'].startsWith(`eventos/${eventoId}/`)) {
      return respuestaJson(400, { mensaje: 'logotipoKey inválida' });
    }
    agregar('logotipoKey', '#logotipoKey', datos['logotipoKey']);
  }

  if (asignaciones.length === 0) {
    return respuestaJson(400, { mensaje: 'No hay campos para actualizar' });
  }

  agregar('actualizadoEn', '#actualizadoEn', new Date().toISOString());

  try {
    const resultado = await documentoDynamoDB.send(
      new UpdateCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        UpdateExpression: `SET ${asignaciones.join(', ')}`,
        ExpressionAttributeNames: nombresAtributos,
        ExpressionAttributeValues: valoresExpresion,
        ConditionExpression: 'attribute_exists(eventoId)',
        ReturnValues: 'ALL_NEW',
      }),
    );
    return respuestaJson(200, resultado.Attributes);
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }
    throw error;
  }
}

/**
 * `POST /api/eventos/:eventoId/activos/url-carga` — URL prefirmada de S3
 * para subir imagen/logotipo del evento. El cliente sube directo a S3 con
 * esta URL; el backend nunca descarga una URL arbitraria (CLAUDE.md §5,
 * A10/SSRF).
 */
async function generarUrlCargaActivo(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  const tipo = datos['tipo'];
  if (tipo !== 'imagen' && tipo !== 'logotipo') {
    return respuestaJson(400, { mensaje: "tipo debe ser 'imagen' o 'logotipo'" });
  }

  const tipoMime = datos['tipoMime'];
  if (typeof tipoMime !== 'string' || !TIPOS_MIME_IMAGEN_VALIDOS.has(tipoMime)) {
    return respuestaJson(400, {
      mensaje: 'tipoMime debe ser image/jpeg, image/png o image/webp — SVG no está permitido',
    });
  }

  const tamano = datos['tamano'];
  if (!esEnteroPositivo(tamano) || tamano > TAMANO_MAXIMO_IMAGEN_BYTES) {
    return respuestaJson(400, { mensaje: `tamano debe ser un entero positivo de máximo ${TAMANO_MAXIMO_IMAGEN_BYTES} bytes` });
  }

  const extension = tipoMime.split('/')[1];
  const key = `eventos/${eventoId}/${tipo}-${randomUUID()}.${extension}`;

  const url = await getSignedUrl(
    clienteS3,
    new PutObjectCommand({
      Bucket: process.env['BUCKET_ACTIVOS'],
      Key: key,
      ContentType: tipoMime,
      ContentLength: tamano,
    }),
    { expiresIn: 900 },
  );

  return respuestaJson(200, { url, key });
}

/**
 * Borra todos los objetos de S3 bajo `eventos/{eventoId}/` (imagen y
 * logotipo). Best-effort: el evento ya se eliminó de DynamoDB en ese punto
 * (lo que importa funcionalmente); si S3 falla, un objeto huérfano de unos
 * KB no justifica que la eliminación completa del evento falle.
 */
async function eliminarActivosDelEvento(eventoId: string): Promise<void> {
  try {
    const listado = await clienteS3.send(
      new ListObjectsV2Command({
        Bucket: process.env['BUCKET_ACTIVOS'],
        Prefix: `eventos/${eventoId}/`,
      }),
    );
    const objetos = listado.Contents ?? [];
    if (objetos.length === 0) {
      return;
    }

    await clienteS3.send(
      new DeleteObjectsCommand({
        Bucket: process.env['BUCKET_ACTIVOS'],
        Delete: { Objects: objetos.flatMap((o) => (o.Key ? [{ Key: o.Key }] : [])) },
      }),
    );
  } catch {
    // Best-effort — ver docstring de la función.
  }
}

/**
 * `DELETE /api/eventos/:eventoId` — elimina el evento y, mejor esfuerzo, sus
 * activos en S3 (imagen/logotipo). Sin lectura previa del ítem de DynamoDB:
 * la `ConditionExpression` distingue 404 (no existe) de 204 (eliminado),
 * mismo criterio que `usuarios.ts`.
 */
async function eliminarEvento(eventoId: string | undefined): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  try {
    await documentoDynamoDB.send(
      new DeleteCommand({
        TableName: process.env['TABLA_EVENTOS'],
        Key: { eventoId },
        ConditionExpression: 'attribute_exists(eventoId)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }
    throw error;
  }

  await eliminarActivosDelEvento(eventoId);

  return { statusCode: 204 };
}

/**
 * `GET/POST /api/eventos`, `PUT/DELETE /api/eventos/:eventoId`,
 * `POST /api/eventos/:eventoId/activos/url-carga` — CRUD de `agora-eventos`,
 * exclusivo de `administrador` (tech-specs.md §5.1, TODO.md Tarea 1).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const autorizacion = await exigirRol(evento, 'administrador');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }

  const eventoId = evento.pathParameters?.['eventoId'];
  const esCargaDeActivo = (evento.rawPath ?? '').endsWith('/activos/url-carga');

  try {
    if (esCargaDeActivo && evento.requestContext.http.method === 'POST') {
      return await generarUrlCargaActivo(eventoId, evento);
    }

    switch (evento.requestContext.http.method) {
      case 'GET':
        return await listarEventos();
      case 'POST':
        return await crearEvento(evento);
      case 'PUT':
        return await actualizarEvento(eventoId, evento);
      case 'DELETE':
        return await eliminarEvento(eventoId);
      default:
        return respuestaJson(405, { mensaje: 'Método no soportado' });
    }
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
