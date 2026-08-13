import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { generarQrPng, generarQrSvg } from '../services/qr';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import type { PermisosUsuario } from '../lib/resolver-permisos';
import { respuestaJson } from '../lib/http';

// URL de producción fija (no por stage): el QR es un activo de marketing
// impreso, pensado para el dominio final del evento (tech-specs.md §11
// ítem 15), no para la URL de staging vigente en el momento de generarlo.
const URL_BASE_PRODUCCION = 'https://agora.letiende.co';

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
 * Valida el arreglo de etapas. El `etapaId` de cada etapa se decide así
 * (TODO.md Tarea 2 — antes generaba `randomUUID()` siempre, huerfanizando
 * `compras`/`boletas` en cada `PUT` que incluyera `etapas`): si `idsExistentes`
 * fue provisto (solo ocurre en `actualizarEvento()`, nunca en `crearEvento()`)
 * y la etapa trae un `etapaId` de tipo `string` no vacío que además pertenece
 * a ese conjunto, se reutiliza tal cual — es una llave foránea estable, no un
 * identificador de autorización, así que preservar el que ya trae el cliente
 * es seguro siempre que se valide su pertenencia al evento. En cualquier otro
 * caso (sin `idsExistentes`, sin `etapaId` en el payload, o un `etapaId` que
 * no coincide con ninguno de los actuales del evento — dato inventado u
 * obsoleto) se genera uno nuevo con `randomUUID()`. Devuelve `null` si el
 * arreglo es inválido.
 *
 * Un `etapaId` recibido solo se reutiliza si además no fue ya asignado a
 * una etapa ANTERIOR de este mismo payload (`idsYaAsignados`) — sin este
 * control, dos filas del payload con el mismo `etapaId` (bug del cliente o
 * payload manipulado a mano) duplicarían la identidad de dos etapas
 * distintas, rompiendo cualquier agregación que agrupe por `etapaId`
 * (`reportes.ts`, `porEtapa`).
 */
function normalizarEtapas(
  valor: unknown,
  idsExistentes?: ReadonlySet<string>,
): EtapaBoleteriaEntrada[] | null {
  if (!Array.isArray(valor) || valor.length === 0) {
    return null;
  }

  const etapas: EtapaBoleteriaEntrada[] = [];
  const idsYaAsignados = new Set<string>();
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
    const etapaIdRecibido = registro['etapaId'];
    const etapaId =
      idsExistentes &&
      typeof etapaIdRecibido === 'string' &&
      etapaIdRecibido.length > 0 &&
      idsExistentes.has(etapaIdRecibido) &&
      !idsYaAsignados.has(etapaIdRecibido)
        ? etapaIdRecibido
        : randomUUID();
    idsYaAsignados.add(etapaId);
    etapas.push({
      etapaId,
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

/**
 * `GET /api/eventos` — un `administrador` ve todos los eventos; un
 * `productor` solo los que tiene asignados en `productores`
 * (`tieneAccesoAlEvento`, que ya incluye el bypass de `administrador` — no
 * se duplica esa rama aquí, TODO.md Tarea 1).
 */
async function listarEventos(permisos: PermisosUsuario): Promise<APIGatewayProxyResultV2> {
  const resultado = await documentoDynamoDB.send(
    new ScanCommand({ TableName: process.env['TABLA_EVENTOS'] }),
  );
  const items = resultado.Items ?? [];
  const visibles = items.filter((item) => tieneAccesoAlEvento(item as Record<string, unknown>, permisos));
  return respuestaJson(200, visibles);
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
 * Campos que un `productor` puede editar de un evento donde está asignado
 * (TODO.md Tarea 1, T6) — cualquier otro campo en el payload de un
 * productor se rechaza con 403 antes de tocar DynamoDB. Un `administrador`
 * no tiene esta restricción.
 */
const CAMPOS_EDITABLES_PRODUCTOR = new Set([
  'maxBoletasPorCompra',
  'plazoComprobanteMinutos',
  'imagenKey',
  'logotipoKey',
]);

/**
 * Campos editables por `PUT /api/eventos/:eventoId`. Deliberadamente
 * excluye `eventoId`, `slug`, `sillasTotales`, `sillasDisponibles` y
 * `sillasReservadas` — el aforo (incluida cualquier resta/reasignación de
 * `sillasTotales`) es responsabilidad exclusiva del motor de aforo
 * (roadmap #8, todavía no existe); hasta entonces esos campos solo se
 * editan internamente, nunca vía este endpoint (TODO.md Tarea 1). Un
 * `administrador` puede editar cualquiera de los campos de abajo; un
 * `productor` asignado al evento solo los de `CAMPOS_EDITABLES_PRODUCTOR`
 * (TODO.md Tarea 1, T6).
 */
async function actualizarEvento(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
  permisos: PermisosUsuario,
): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  // Un productor solo puede editar 4 campos puntuales, y solo en un evento
  // donde está asignado (TODO.md Tarea 1, T6) — se verifica ANTES de
  // procesar el resto del payload para no hacer ningún trabajo de validación
  // sobre campos que de todas formas se van a rechazar.
  if (permisos.rol !== 'administrador') {
    const campoNoPermitido = Object.keys(datos).find(
      (campo) => !CAMPOS_EDITABLES_PRODUCTOR.has(campo),
    );
    if (campoNoPermitido) {
      return respuestaJson(403, { mensaje: `No autorizado para editar el campo "${campoNoPermitido}"` });
    }

    const eventoActual = await documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
    );
    if (!eventoActual.Item) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }
    if (!tieneAccesoAlEvento(eventoActual.Item, permisos)) {
      return respuestaJson(403, { mensaje: 'No estás asignado a este evento' });
    }
  }

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
    // Lee el evento actual solo en este caso (no incondicional al inicio de
    // la función: sería una lectura extra innecesaria para un PUT que no
    // toca etapas) para poder validar a cuáles etapaId ya existentes puede
    // aferrarse el payload del cliente — ver normalizarEtapas() (TODO.md
    // Tarea 2). Mismo patrón que obtenerPanelEvento()/generarReporteEvento()
    // en reportes.ts.
    const eventoActual = await documentoDynamoDB.send(
      new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
    );
    if (!eventoActual.Item) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }
    const etapasActuales = Array.isArray(eventoActual.Item['etapas'])
      ? (eventoActual.Item['etapas'] as unknown[])
      : [];
    const idsExistentes = new Set<string>(
      etapasActuales.flatMap((etapa) => {
        const id = (etapa as Record<string, unknown> | null)?.['etapaId'];
        return typeof id === 'string' ? [id] : [];
      }),
    );

    const etapas = normalizarEtapas(datos['etapas'], idsExistentes);
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
  permisos: PermisosUsuario,
): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const eventoActual = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
  );
  if (!eventoActual.Item) {
    return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
  }
  if (!tieneAccesoAlEvento(eventoActual.Item, permisos)) {
    return respuestaJson(403, { mensaje: 'No autorizado' });
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
 * `GET /api/eventos/:eventoId/qr?formato=svg|png` — QR de marketing con la
 * URL pública del evento, para imprimir en afiches (TODO.md Tarea 1,
 * `PRD.md` línea 104). Bajo demanda, sin almacenarse en DynamoDB ni S3. El
 * `slug` codificado se lee siempre de la base de datos — nunca de la ruta
 * ni de un payload (`CLAUDE.md` §5, A08). No confundir con el QR firmado de
 * la boleta digital (roadmap #12, todavía no existe).
 */
async function generarQrEvento(
  eventoId: string | undefined,
  evento: APIGatewayProxyEventV2,
  permisos: PermisosUsuario,
): Promise<APIGatewayProxyResultV2> {
  if (!eventoId) {
    return respuestaJson(400, { mensaje: 'Falta el eventoId en la ruta' });
  }

  const formatoParam = evento.queryStringParameters?.['formato'];
  if (formatoParam !== undefined && formatoParam !== 'svg' && formatoParam !== 'png') {
    return respuestaJson(400, { mensaje: "formato debe ser 'svg' o 'png'" });
  }
  const formato = formatoParam === 'png' ? 'png' : 'svg';

  const resultado = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
  );
  const slug = resultado.Item?.['slug'];
  if (typeof slug !== 'string') {
    return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
  }
  if (!tieneAccesoAlEvento(resultado.Item as Record<string, unknown>, permisos)) {
    return respuestaJson(403, { mensaje: 'No autorizado' });
  }

  const url = `${URL_BASE_PRODUCCION}/evento/${slug}`;

  if (formato === 'png') {
    const png = await generarQrPng(url);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="qr-${slug}.png"`,
      },
      body: png.toString('base64'),
      isBase64Encoded: true,
    };
  }

  const svg = await generarQrSvg(url);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `attachment; filename="qr-${slug}.svg"`,
    },
    body: svg,
  };
}

/**
 * `GET/POST /api/eventos`, `PUT/DELETE /api/eventos/:eventoId`,
 * `POST /api/eventos/:eventoId/activos/url-carga`,
 * `GET /api/eventos/:eventoId/qr` — CRUD de `agora-eventos` (tech-specs.md
 * §5.1, TODO.md Tarea 1). `administrador` y `productor` pasan el gate del
 * rol; `portero` sigue completamente bloqueado. Crear y eliminar eventos
 * siguen siendo exclusivos de `administrador`; el resto de operaciones se
 * acota por evento — ver `actualizarEvento`, `generarUrlCargaActivo` y
 * `generarQrEvento` (T6).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const autorizacion = await exigirRol(evento, 'productor');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }
  const { permisos } = autorizacion;

  const eventoId = evento.pathParameters?.['eventoId'];
  const esCargaDeActivo = (evento.rawPath ?? '').endsWith('/activos/url-carga');
  const esQr = (evento.rawPath ?? '').endsWith('/qr');

  try {
    if (esCargaDeActivo && evento.requestContext.http.method === 'POST') {
      return await generarUrlCargaActivo(eventoId, evento, permisos);
    }
    if (esQr && evento.requestContext.http.method === 'GET') {
      return await generarQrEvento(eventoId, evento, permisos);
    }

    // Crear y eliminar eventos son exclusivos de administrador — el chequeo
    // vive aquí, antes de despachar, para que crearEvento()/eliminarEvento()
    // nunca se invoquen para un productor (TODO.md Tarea 1, T6).
    if (
      (evento.requestContext.http.method === 'POST' ||
        evento.requestContext.http.method === 'DELETE') &&
      permisos.rol !== 'administrador'
    ) {
      return respuestaJson(403, { mensaje: 'No autorizado' });
    }

    switch (evento.requestContext.http.method) {
      case 'GET':
        return await listarEventos(permisos);
      case 'POST':
        return await crearEvento(evento);
      case 'PUT':
        return await actualizarEvento(eventoId, evento, permisos);
      case 'DELETE':
        return await eliminarEvento(eventoId);
      default:
        return respuestaJson(405, { mensaje: 'Método no soportado' });
    }
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
