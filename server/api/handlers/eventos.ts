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
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { documentoDynamoDB } from '../services/dynamodb';
import { clienteS3 } from '../services/s3';
import { generarQrPng, generarQrSvg } from '../services/qr';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { haFinalizadoPorVigencia } from '../lib/vigencia-evento';
import type { PermisosUsuario } from '../lib/resolver-permisos';
import { respuestaJson } from '../lib/http';
import {
  actualizarEventoCalendar,
  crearEventoCalendar,
  credencialCalendarConfigurada,
  resolverProductores,
  type EventoParaCalendar,
} from '../services/google-calendar';

// URL de producción fija (no por stage): el QR es un activo de marketing
// impreso, pensado para el dominio final del evento (tech-specs.md §11
// ítem 15), no para la URL de staging vigente en el momento de generarlo.
const URL_BASE_PRODUCCION = 'https://agora.letiende.co';

export type EstadoEvento = 'borrador' | 'publicado' | 'agotado' | 'finalizado' | 'cancelado';
export type MedioPago = 'bold' | 'efectivo' | 'transferencia';
export type TipoVinculo = 'whatsapp' | 'instagram' | 'web';

const ESTADOS_VALIDOS: readonly EstadoEvento[] = [
  'borrador',
  'publicado',
  'agotado',
  'finalizado',
  'cancelado',
];
const MEDIOS_PAGO_VALIDOS: readonly MedioPago[] = ['bold', 'efectivo', 'transferencia'];
const TIPOS_VINCULO_VALIDOS: readonly TipoVinculo[] = ['whatsapp', 'instagram', 'web'];

// v2 (roadmap #25) — boletería externa: valores neutros que se fuerzan en la
// escritura cuando administradoPorLeTiende es false, sin importar lo que
// mande el cliente para estos campos (CLAUDE.md §5, A04/A08). sillasTotales/
// sillasDisponibles en 0 basta para que aforo.ts rechace cualquier reserva
// de forma natural — no hace falta bloquear compras.ts a mano.
const SILLAS_TOTALES_NEUTRO = 0;
const MAX_BOLETAS_POR_COMPRA_NEUTRO = 1;
const PLAZO_COMPROBANTE_MINUTOS_NEUTRO = 10;

// Comprobantes usan el mismo criterio (CLAUDE.md §5, A08): nunca SVG (vector
// de XSS), el tipo se restringe por magic bytes en la carga, no aquí — esta
// lista solo acota qué `Content-Type` puede pedir la URL prefirmada.
const TIPOS_MIME_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const TAMANO_MAXIMO_IMAGEN_BYTES = 10 * 1024 * 1024;

// v2 (roadmap #25, hallazgo de code review) — mismo criterio que
// `ESTADOS_QUE_RETIENEN_AFORO` en `liberar-reservas.ts:17-21`: estos son los
// únicos estados de compra que todavía retienen aforo del evento. Se usa
// para bloquear la desactivación de `administradoPorLeTiende` mientras haya
// compras en curso — de lo contrario quedarían huérfanas (`aprobarCompra`
// en `aprobaciones.ts` traga `ErrorAforo` y de todas formas emite boletas).
const ESTADOS_QUE_RETIENEN_AFORO = ['iniciada', 'esperando_comprobante', 'en_revision'] as const;

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
 *
 * v2 (roadmap #24) — un arreglo vacío es válido: un evento sin etapas no
 * cobra nada, solo controla aforo. `[]` ya es el valor por defecto de un
 * evento nuevo (`EditarEventoComponent`); el cobro se activa solo cuando el
 * administrador agrega la primera etapa.
 */
function normalizarEtapas(
  valor: unknown,
  idsExistentes?: ReadonlySet<string>,
): EtapaBoleteriaEntrada[] | null {
  if (!Array.isArray(valor)) {
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

/**
 * v2 (roadmap #24) — 'bold' exige que el evento ya tenga al menos una etapa
 * de boletería: sin etapas no hay cobro, y Bold no tiene sentido sin un
 * precio real que cobrar. Se valida por separado de `normalizarMediosPago`
 * (que solo verifica que cada valor sea un `MedioPago` conocido) para poder
 * responder un mensaje específico en vez de un "mediosPago inválido"
 * genérico que no explicaría la causa real.
 */
function bloqueaBoldSinEtapas(mediosPago: MedioPago[], hayEtapas: boolean): boolean {
  return !hayEtapas && mediosPago.includes('bold');
}

/**
 * Validador compartido de `productores`/`porteros` (`TODO.md` Tarea 1, T7)
 * — mismo criterio en ambos: arreglo de correos válidos, sin duplicar la
 * comprobación elemento por elemento. `longitudMinima` es lo único que
 * distingue los dos campos: el documento de negocio exige al menos un
 * productor para guardar el evento, mientras que `porteros` puede quedar
 * vacío (se agregan luego, al editar).
 */
function normalizarCorreos(valor: unknown, longitudMinima: number): string[] | null {
  if (!Array.isArray(valor) || valor.length < longitudMinima) {
    return null;
  }
  const correos = valor.filter(esEmailValido);
  return correos.length === valor.length ? correos : null;
}

/** Al menos un productor es obligatorio (documento de negocio, TODO.md Tarea 1, T7) — aplica tanto al crear como al editar, para que el evento nunca quede sin ninguno. */
function normalizarProductores(valor: unknown): string[] | null {
  return normalizarCorreos(valor, 1);
}

/** Análogo a `normalizarProductores`, pero opcional: puede quedar vacío tanto al crear como al editar (TODO.md Tarea 1, T7). */
function normalizarPorteros(valor: unknown): string[] | null {
  return normalizarCorreos(valor, 0);
}

interface VinculoExternoEntrada {
  tipo: TipoVinculo;
  valor: string;
}

const PATRON_VINCULO_WHATSAPP = /^\d{10}$/;
const PATRON_VINCULO_INSTAGRAM = /^[A-Za-z0-9._]{1,30}$/;

/**
 * v2 (roadmap #25) — valida el vínculo externo de un evento con boletería
 * externa (`administradoPorLeTiende === false`), nunca confiando en la
 * validación ya hecha del lado de Angular (CLAUDE.md §5, A04/A08). `valor`
 * guarda solo la parte variable, sin el prefijo fijo de cada tipo
 * (tech-specs.md §4.3): whatsapp exige exactamente 10 dígitos (prefijo fijo
 * `https://wa.me/57`), instagram hasta 30 caracteres `[A-Za-z0-9._]`
 * (prefijo fijo `https://www.instagram.com/`), y web hasta 256 caracteres
 * que formen una URL https válida al anteponerle el prefijo fijo `https://`
 * (nunca debe incluir ese prefijo ya en `valor`).
 */
function normalizarVinculoExterno(valor: unknown): VinculoExternoEntrada | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }
  const registro = valor as Record<string, unknown>;
  const tipo = registro['tipo'];
  const dato = registro['valor'];
  if (typeof tipo !== 'string' || !(TIPOS_VINCULO_VALIDOS as readonly string[]).includes(tipo)) {
    return null;
  }
  if (typeof dato !== 'string' || dato.length === 0) {
    return null;
  }
  const tipoValido = tipo as TipoVinculo;

  if (tipoValido === 'whatsapp') {
    return PATRON_VINCULO_WHATSAPP.test(dato) ? { tipo: tipoValido, valor: dato } : null;
  }
  if (tipoValido === 'instagram') {
    return PATRON_VINCULO_INSTAGRAM.test(dato) ? { tipo: tipoValido, valor: dato } : null;
  }

  // 'web' — nunca incluye ya el prefijo (se antepone al mostrarlo), y debe
  // formar una URL https válida una vez antepuesto.
  if (dato.length > 256 || /^https:\/\//i.test(dato)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(`https://${dato}`);
    if (url.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }
  // Se persiste la forma canónica ya re-parseada (`url.href`), no `dato` tal
  // cual (hallazgo de code review): el parser WHATWG de `URL` descarta
  // silenciosamente tabs/saltos de línea al construir `url` arriba, así que
  // un `dato` con caracteres de control pasaría esta validación pero se
  // guardaría en DynamoDB todavía con esos caracteres dentro si se
  // persistiera el original en vez de `url.href`.
  return { tipo: tipoValido, valor: url.href.slice('https://'.length) };
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
  const visibles = items
    .filter((item) => tieneAccesoAlEvento(item as Record<string, unknown>, permisos))
    // v2 (roadmap #25) — retrocompatibilidad: un evento creado antes de esta
    // tarea no tiene el atributo en DynamoDB. Se normaliza aquí a `true` (el
    // valor por defecto) para que la respuesta siempre cumpla el contrato de
    // `Evento.administradoPorLeTiende: boolean` (no opcional).
    .map((item) => ({ ...item, administradoPorLeTiende: item['administradoPorLeTiende'] !== false }));
  return respuestaJson(200, visibles);
}

/**
 * Sincronización *best-effort* con Google Calendar (roadmap #22,
 * `.omc/plans/google-calendar-sync.md` §4) — se llama tras el
 * `PutCommand`/`UpdateCommand` exitoso de `crearEvento()`/`actualizarEvento()`,
 * nunca antes: no afecta el código de respuesta HTTP ni revierte nada si
 * Calendar falla, mismo patrón que `emitirBoletas()` en
 * `compras.ts`/`aprobaciones.ts`. Se salta por completo (sin ningún
 * `GetItem` de productores) cuando la credencial de Calendar en SSM Parameter
 * Store no está configurada, para que el entorno local/tests siga
 * funcionando sin la credencial real. `item` es el ítem completo ya
 * persistido (`ALL_NEW` en edición): si ya trae `googleCalendarEventId`, se edita (reemplazo
 * completo); si no (evento nuevo o legado nunca sincronizado), se crea.
 */
async function sincronizarConGoogleCalendar(item: Record<string, unknown>): Promise<void> {
  if (!(await credencialCalendarConfigurada())) {
    return;
  }

  const eventoId = item['eventoId'];
  if (typeof eventoId !== 'string') {
    return;
  }

  try {
    const administradoPorLeTiende = item['administradoPorLeTiende'] !== false;
    const correosProductores =
      administradoPorLeTiende && Array.isArray(item['productores'])
        ? (item['productores'] as unknown[]).filter((p): p is string => typeof p === 'string')
        : [];
    const productoresResueltos =
      correosProductores.length > 0 ? await resolverProductores(correosProductores) : [];

    const eventoParaCalendar: EventoParaCalendar = {
      nombre: String(item['nombre']),
      slug: String(item['slug']),
      fechaHora: String(item['fechaHora']),
      administradoPorLeTiende,
      vinculoExterno:
        typeof item['vinculoExterno'] === 'object' && item['vinculoExterno'] !== null
          ? (item['vinculoExterno'] as EventoParaCalendar['vinculoExterno'])
          : undefined,
      etapas: Array.isArray(item['etapas']) ? (item['etapas'] as EventoParaCalendar['etapas']) : [],
    };

    const googleCalendarEventIdExistente =
      typeof item['googleCalendarEventId'] === 'string' ? item['googleCalendarEventId'] : undefined;

    const resultado = googleCalendarEventIdExistente
      ? await actualizarEventoCalendar(googleCalendarEventIdExistente, eventoParaCalendar, productoresResueltos)
      : await crearEventoCalendar(eventoParaCalendar, productoresResueltos);

    if (resultado.exito) {
      try {
        await documentoDynamoDB.send(
          new UpdateCommand({
            TableName: process.env['TABLA_EVENTOS'],
            Key: { eventoId },
            UpdateExpression: 'SET googleCalendarEventId = :googleCalendarEventId',
            ExpressionAttributeValues: { ':googleCalendarEventId': resultado.googleCalendarEventId },
            // Hallazgo de code review (roadmap #22) — solo al CREAR
            // (`googleCalendarEventIdExistente` es `undefined`): guarda condicional
            // que serializa la decisión "crear vs editar en Calendar" entre dos
            // ediciones concurrentes del mismo eventoId. Sin esto, dos PUT/POST
            // casi simultáneos sobre un evento sin googleCalendarEventId (legado
            // nunca sincronizado, o creado con Calendar caído) leen ambos
            // `undefined`, ambos llaman `crearEventoCalendar()` y crean DOS
            // eventos distintos en Calendar — el segundo `UpdateCommand`
            // sobreescribiría en silencio el id del primero. Cuando SÍ había un
            // id previo (reemplazo completo vía `actualizarEventoCalendar`), no
            // hay condición: ese caso no decide entre crear o no crear, no tiene
            // el race.
            ...(googleCalendarEventIdExistente
              ? {}
              : { ConditionExpression: 'attribute_not_exists(googleCalendarEventId)' }),
          }),
        );
      } catch (errorEscritura) {
        if (!googleCalendarEventIdExistente && esErrorCondicionFallida(errorEscritura)) {
          // Otra request concurrente ganó la carrera y ya persistió su propio
          // googleCalendarEventId primero. El evento recién creado en Calendar
          // por ESTA request queda huérfano allí (sin id guardado en Ágora) —
          // efecto secundario cosmético aceptado, no se borra de Calendar.
          // Best-effort, igual que el resto de esta integración: no propaga.
          console.error('Carrera detectada al persistir googleCalendarEventId: se descarta el id duplicado de esta request', {
            eventoId,
          });
          return;
        }
        throw errorEscritura;
      }
    }
  } catch (error) {
    console.error('La sincronización con Google Calendar falló', {
      eventoId,
      nombreError: error instanceof Error ? error.name : 'error desconocido',
    });
  }
}

async function crearEvento(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (
    datos['administradoPorLeTiende'] !== undefined &&
    typeof datos['administradoPorLeTiende'] !== 'boolean'
  ) {
    return respuestaJson(400, { mensaje: 'administradoPorLeTiende debe ser booleano' });
  }
  // v2 (roadmap #25) — true por defecto, retrocompatible.
  const administradoPorLeTiende = datos['administradoPorLeTiende'] !== false;

  if (
    !esSlugValido(datos['slug']) ||
    !esTextoValido(datos['nombre'], 200) ||
    !esTextoValido(datos['descripcion'], 5000) ||
    !esFechaIsoValida(datos['fechaHora'])
  ) {
    return respuestaJson(400, {
      mensaje: 'slug, nombre, descripcion y fechaHora son obligatorios y deben ser válidos',
    });
  }

  let sillasTotales: number = SILLAS_TOTALES_NEUTRO;
  let maxBoletasPorCompra: number = MAX_BOLETAS_POR_COMPRA_NEUTRO;
  let etapas: EtapaBoleteriaEntrada[] = [];
  let mediosPago: MedioPago[] = [];
  let productores: string[] = [];
  let porteros: string[] = [];
  let plazoComprobanteMinutos: number = PLAZO_COMPROBANTE_MINUTOS_NEUTRO;
  let vinculoExterno: VinculoExternoEntrada | undefined;

  if (administradoPorLeTiende) {
    if (!esEnteroPositivo(datos['sillasTotales']) || !esEnteroPositivo(datos['maxBoletasPorCompra'])) {
      return respuestaJson(400, {
        mensaje: 'sillasTotales y maxBoletasPorCompra son obligatorios y deben ser válidos',
      });
    }
    sillasTotales = datos['sillasTotales'];
    maxBoletasPorCompra = datos['maxBoletasPorCompra'];

    const etapasNormalizadas = normalizarEtapas(datos['etapas']);
    if (!etapasNormalizadas) {
      return respuestaJson(400, { mensaje: 'etapas debe ser un arreglo de etapas válidas (puede estar vacío)' });
    }
    etapas = etapasNormalizadas;

    const mediosPagoNormalizados = normalizarMediosPago(datos['mediosPago']);
    if (!mediosPagoNormalizados) {
      return respuestaJson(400, { mensaje: 'mediosPago debe ser un arreglo con al menos un medio válido' });
    }
    mediosPago = mediosPagoNormalizados;
    if (bloqueaBoldSinEtapas(mediosPago, etapas.length > 0)) {
      return respuestaJson(400, {
        mensaje: 'Bold no se puede habilitar en un evento sin etapas de boletería',
      });
    }

    const productoresNormalizados = normalizarProductores(datos['productores'] ?? []);
    if (!productoresNormalizados) {
      return respuestaJson(400, {
        mensaje: 'productores debe ser un arreglo de al menos un correo válido',
      });
    }
    productores = productoresNormalizados;

    const porterosNormalizados = normalizarPorteros(datos['porteros'] ?? []);
    if (!porterosNormalizados) {
      return respuestaJson(400, { mensaje: 'porteros debe ser un arreglo de correos válidos' });
    }
    porteros = porterosNormalizados;

    plazoComprobanteMinutos = esEnteroPositivo(datos['plazoComprobanteMinutos'])
      ? datos['plazoComprobanteMinutos']
      : 10;
  } else {
    // v2 (roadmap #25) — evento con boletería externa: Ágora no vende ni
    // controla el aforo. sillasTotales/maxBoletasPorCompra/etapas/mediosPago/
    // productores/porteros/plazoComprobanteMinutos quedan en su valor
    // neutro sin importar lo que el cliente haya enviado para ellos
    // (CLAUDE.md §5, A04/A08) — en su lugar, vinculoExterno es obligatorio.
    const vinculo = normalizarVinculoExterno(datos['vinculoExterno']);
    if (!vinculo) {
      return respuestaJson(400, {
        mensaje: 'vinculoExterno es obligatorio y debe ser válido cuando administradoPorLeTiende es false',
      });
    }
    vinculoExterno = vinculo;
  }

  const ahora = new Date().toISOString();
  const eventoId = randomUUID();
  const item: Record<string, unknown> = {
    eventoId,
    slug: datos['slug'],
    nombre: datos['nombre'],
    descripcion: datos['descripcion'],
    fechaHora: datos['fechaHora'],
    administradoPorLeTiende,
    sillasTotales,
    // Regla obligatoria (TODO.md Tarea 1, CLAUDE.md §5 A08): el aforo se
    // inicializa en la misma escritura, nunca se acepta del payload.
    sillasDisponibles: sillasTotales,
    sillasReservadas: 0,
    etapas,
    maxBoletasPorCompra,
    mediosPago,
    plazoComprobanteMinutos,
    productores,
    porteros,
    estado: 'borrador' as EstadoEvento,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  if (vinculoExterno) {
    item['vinculoExterno'] = vinculoExterno;
  }

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

  await sincronizarConGoogleCalendar(item);

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
 * excluye `eventoId`, `slug`, `sillasDisponibles` y `sillasReservadas` — el
 * aforo consumido (vendidas/reservadas) sigue siendo responsabilidad
 * exclusiva de `aforo.ts` (reservar/confirmar/liberar). `sillasTotales` SÍ
 * es editable por `administrador` (hotfixes pre-producción: "el
 * administrador debe poder editar el número de sillas totales de un evento,
 * en todo momento") — ver el bloque dedicado más abajo, que ajusta
 * `sillasDisponibles` por la diferencia en vez de tocarlo directamente. Un
 * `administrador` puede editar cualquiera de los campos de abajo; un
 * `productor` asignado al evento solo los de `CAMPOS_EDITABLES_PRODUCTOR`
 * (TODO.md Tarea 1, T6) — `sillasTotales` deliberadamente no está en esa
 * lista.
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

  // Lectura del evento actual, compartida entre los bloques de abajo que la
  // necesitan (`etapas`, `sillasTotales`) — como mucho una sola vez por
  // petición, aunque ambos campos vengan juntos en el mismo payload (solo
  // un `administrador` puede enviar `sillasTotales`, y `etapas` está fuera
  // del alcance de un `productor`, así que nunca compite con la lectura de
  // más arriba, exclusiva de esa rama).
  let eventoActualCache: Record<string, unknown> | null | undefined;
  const leerEventoActual = async (): Promise<Record<string, unknown> | null> => {
    if (eventoActualCache === undefined) {
      const resultado = await documentoDynamoDB.send(
        new GetCommand({ TableName: process.env['TABLA_EVENTOS'], Key: { eventoId } }),
      );
      eventoActualCache = resultado.Item ?? null;
    }
    return eventoActualCache;
  };

  // v2 (roadmap #24) — capturado por el bloque de `etapas` de abajo cuando el
  // payload la incluye, para que el bloque de `mediosPago` (que se procesa
  // después) valide 'bold' contra el número de etapas EFECTIVO de este mismo
  // PUT, no contra el valor ya obsoleto de `eventoActual`.
  let etapasDeEstePut: EtapaBoleteriaEntrada[] | undefined;

  const asignaciones: string[] = [];
  const nombresAtributos: Record<string, string> = {};
  const valoresExpresion: Record<string, unknown> = {};
  // Cláusulas adicionales de `ConditionExpression`, más allá del
  // `attribute_exists(eventoId)` de siempre — hoy solo las agrega el bloque
  // de `sillasTotales` (guarda optimista + aforo nunca negativo).
  const condicionesExtra: string[] = [];

  const agregar = (campo: string, marcador: string, valor: unknown): void => {
    asignaciones.push(`${marcador} = :${campo}`);
    nombresAtributos[marcador] = campo;
    valoresExpresion[`:${campo}`] = valor;
  };

  // v2 (roadmap #25) — al desactivar la boletería administrada por Le Tiende
  // en este mismo PUT, los campos de boletería (sillasTotales/etapas/
  // mediosPago/productores/porteros/plazoComprobanteMinutos/
  // maxBoletasPorCompra) se normalizan a valores neutros más abajo, sin
  // importar lo que el cliente haya enviado para ellos en el mismo payload
  // (CLAUDE.md §5, A04/A08) — por eso los bloques de esos campos, debajo,
  // se saltan por completo cuando esto es `true`.
  if (
    datos['administradoPorLeTiende'] !== undefined &&
    typeof datos['administradoPorLeTiende'] !== 'boolean'
  ) {
    return respuestaJson(400, { mensaje: 'administradoPorLeTiende debe ser booleano' });
  }
  const desactivaBoleteria = datos['administradoPorLeTiende'] === false;

  // A diferencia de `crearEvento` (que solo persiste `vinculoExterno` dentro
  // de la rama `administradoPorLeTiende === false`), aquí se procesa
  // siempre que venga en el payload, sin importar el valor resultante de
  // `administradoPorLeTiende` (hallazgo de code review: asimetría entre los
  // dos code paths). Es intencional: permite editar `vinculoExterno` de
  // forma aislada sin tener que reenviar el toggle completo en el mismo
  // PUT, y es inerte mientras `administradoPorLeTiende` sea `true` — tanto
  // el frontend como la vista pública lo ignoran en ese caso. No se agrega
  // una lectura extra del evento actual solo para este chequeo.
  if (datos['vinculoExterno'] !== undefined) {
    const vinculo = normalizarVinculoExterno(datos['vinculoExterno']);
    if (!vinculo) {
      return respuestaJson(400, { mensaje: 'vinculoExterno inválido' });
    }
    agregar('vinculoExterno', '#vinculoExterno', vinculo);
  } else if (desactivaBoleteria) {
    return respuestaJson(400, {
      mensaje: 'vinculoExterno es obligatorio en el mismo PUT que desactiva administradoPorLeTiende',
    });
  }

  if (datos['administradoPorLeTiende'] !== undefined) {
    agregar('administradoPorLeTiende', '#administradoPorLeTiende', datos['administradoPorLeTiende']);
  }

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
  if (!desactivaBoleteria && datos['maxBoletasPorCompra'] !== undefined) {
    if (!esEnteroPositivo(datos['maxBoletasPorCompra'])) {
      return respuestaJson(400, { mensaje: 'maxBoletasPorCompra inválido' });
    }
    agregar('maxBoletasPorCompra', '#maxBoletasPorCompra', datos['maxBoletasPorCompra']);
  }
  if (!desactivaBoleteria && datos['plazoComprobanteMinutos'] !== undefined) {
    if (!esEnteroPositivo(datos['plazoComprobanteMinutos'])) {
      return respuestaJson(400, { mensaje: 'plazoComprobanteMinutos inválido' });
    }
    agregar('plazoComprobanteMinutos', '#plazoComprobanteMinutos', datos['plazoComprobanteMinutos']);
  }
  if (!desactivaBoleteria && datos['sillasTotales'] !== undefined) {
    // Hotfixes pre-producción: "el administrador debe poder editar el
    // número de sillas totales de un evento, en todo momento" — nunca un
    // productor (no está en CAMPOS_EDITABLES_PRODUCTOR, así que ya se
    // rechazó arriba si intentó enviarlo).
    if (!esEnteroPositivo(datos['sillasTotales'])) {
      return respuestaJson(400, { mensaje: 'sillasTotales inválido' });
    }

    const eventoActual = await leerEventoActual();
    if (!eventoActual) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }

    const totalActual =
      typeof eventoActual['sillasTotales'] === 'number' ? eventoActual['sillasTotales'] : 0;
    const disponiblesActual =
      typeof eventoActual['sillasDisponibles'] === 'number' ? eventoActual['sillasDisponibles'] : 0;
    const nuevoTotal = datos['sillasTotales'];
    // vendidas + reservadas, sin necesitar separarlas: es lo único que este
    // nuevo total nunca puede pisar.
    const comprometidas = totalActual - disponiblesActual;

    if (nuevoTotal < comprometidas) {
      return respuestaJson(400, {
        mensaje: `No puedes bajar el aforo a ${nuevoTotal}: ya hay ${comprometidas} sillas vendidas o reservadas`,
      });
    }

    const delta = nuevoTotal - totalActual;

    // Aritmética relativa sobre `sillasDisponibles` (`= sillasDisponibles +
    // :delta`), nunca un valor absoluto calculado a partir de la lectura de
    // arriba — el valor real en el momento de esta escritura puede ser
    // distinto (una compra concurrente pudo descontarlo entre medio), y
    // esta forma lo respeta sin necesidad de releer (CLAUDE.md §5, A04: el
    // aforo nunca se descuenta con lectura-luego-escritura).
    asignaciones.push('sillasTotales = :nuevoSillasTotales');
    valoresExpresion[':nuevoSillasTotales'] = nuevoTotal;
    asignaciones.push('sillasDisponibles = sillasDisponibles + :deltaSillas');
    valoresExpresion[':deltaSillas'] = delta;

    // Dos guardas en la propia escritura condicional, sobre el estado REAL
    // al momento de escribir, no el leído: (1) `sillasTotales` no cambió
    // desde la lectura de arriba (si otra edición concurrente ya lo cambió,
    // el `delta` calculado aquí ya no es válido — falla y se responde 409,
    // nunca se aplica un delta calculado sobre un total obsoleto); (2)
    // `sillasDisponibles` nunca queda negativo, pase lo que pase entre la
    // lectura y la escritura.
    //
    // Bug real encontrado en staging (sesión de diagnóstico 14/08/2026): a
    // diferencia de `UpdateExpression` (donde `SET x = x + :n` sí es
    // aritmética válida, ya usada en `aforo.ts`), `ConditionExpression` de
    // DynamoDB NO admite operadores aritméticos — solo compara un `path`
    // contra un `value` (`attribute = value`, `attribute >= value`, etc.).
    // La condición original `sillasDisponibles + :deltaSillas >= :cero`
    // nunca lanza contra el mock de las pruebas (que no valida sintaxis),
    // pero DynamoDB real la rechaza con `ValidationException` — de ahí el
    // 500 genérico sin pista en CloudWatch que encontró el usuario. La
    // guarda equivalente sin aritmética: el umbral se calcula en JS antes
    // de construir la petición (`delta` ya se conoce en ese momento), y la
    // condición solo compara el valor real de `sillasDisponibles` contra
    // ese umbral — mismo patrón ya usado en `aforo.ts` (`reservarSillas`,
    // `ConditionExpression: 'sillasDisponibles >= :n AND ...'`).
    condicionesExtra.push('sillasTotales = :totalLeido');
    valoresExpresion[':totalLeido'] = totalActual;
    condicionesExtra.push('sillasDisponibles >= :minimoSillasDisponibles');
    valoresExpresion[':minimoSillasDisponibles'] = Math.max(0, -delta);

    // Reactivación automática: si el evento estaba `agotado` solo por falta
    // de aforo y este cambio le devuelve sillas disponibles, vuelve a
    // `publicado` — mismo criterio que la transición automática opuesta que
    // ya hace `confirmarSillas()` en `aforo.ts`. No se aplica si el propio
    // payload ya trae un `estado` explícito (el administrador manda sobre
    // la automatización, se procesa en el bloque de abajo) ni si el evento
    // ya venció por vigencia (hotfixes pre-producción) — reactivarlo
    // anunciaría de nuevo un evento que ya pasó.
    if (
      datos['estado'] === undefined &&
      eventoActual['estado'] === 'agotado' &&
      disponiblesActual + delta > 0 &&
      !haFinalizadoPorVigencia(
        {
          fechaHora: String(eventoActual['fechaHora']),
          etapas: Array.isArray(eventoActual['etapas'])
            ? (eventoActual['etapas'] as { cierraEn: string }[])
            : [],
        },
        new Date(),
      )
    ) {
      agregar('estado', '#estado', 'publicado');
    }
  }
  if (!desactivaBoleteria && datos['etapas'] !== undefined) {
    // Lee el evento actual solo en este caso (no incondicional al inicio de
    // la función: sería una lectura extra innecesaria para un PUT que no
    // toca etapas) para poder validar a cuáles etapaId ya existentes puede
    // aferrarse el payload del cliente — ver normalizarEtapas() (TODO.md
    // Tarea 2). Mismo patrón que obtenerPanelEvento()/generarReporteEvento()
    // en reportes.ts. Comparte la lectura con el bloque de `sillasTotales`
    // de arriba vía `leerEventoActual()` si ambos vienen en el mismo payload.
    const eventoActual = await leerEventoActual();
    if (!eventoActual) {
      return respuestaJson(404, { mensaje: 'No existe un evento con ese eventoId' });
    }
    const etapasActuales = Array.isArray(eventoActual['etapas'])
      ? (eventoActual['etapas'] as unknown[])
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
    etapasDeEstePut = etapas;

    // v2 (roadmap #24) — invariante "Bold exige al menos una etapa"
    // reforzada también cuando este PUT vacía las etapas sin tocar
    // `mediosPago` a la vez: retira 'bold' automáticamente en vez de dejar
    // un evento sin etapas con Bold habilitado hasta la próxima edición de
    // medios de pago.
    if (etapas.length === 0 && datos['mediosPago'] === undefined) {
      const mediosPagoActual = Array.isArray(eventoActual['mediosPago'])
        ? (eventoActual['mediosPago'] as MedioPago[])
        : [];
      if (mediosPagoActual.includes('bold')) {
        agregar('mediosPago', '#mediosPago', mediosPagoActual.filter((medio) => medio !== 'bold'));
      }
    }
  }
  if (!desactivaBoleteria && datos['mediosPago'] !== undefined) {
    const mediosPago = normalizarMediosPago(datos['mediosPago']);
    if (!mediosPago) {
      return respuestaJson(400, { mensaje: 'mediosPago inválido' });
    }

    // v2 (roadmap #24) — la cantidad de etapas EFECTIVA tras este PUT: si el
    // propio payload también trae `etapas`, usa ese resultado ya normalizado
    // (`etapasDeEstePut`); si no, la del evento persistido — un PUT que solo
    // cambia `mediosPago` no puede habilitar Bold en un evento que hoy no
    // tiene ninguna etapa.
    if (mediosPago.includes('bold')) {
      let etapasEfectivas = etapasDeEstePut;
      if (etapasEfectivas === undefined) {
        const eventoActual = await leerEventoActual();
        etapasEfectivas =
          eventoActual && Array.isArray(eventoActual['etapas'])
            ? (eventoActual['etapas'] as EtapaBoleteriaEntrada[])
            : [];
      }
      if (bloqueaBoldSinEtapas(mediosPago, etapasEfectivas.length > 0)) {
        return respuestaJson(400, {
          mensaje: 'Bold no se puede habilitar en un evento sin etapas de boletería',
        });
      }
    }
    agregar('mediosPago', '#mediosPago', mediosPago);
  }
  if (!desactivaBoleteria && datos['productores'] !== undefined) {
    const productores = normalizarProductores(datos['productores']);
    if (!productores) {
      return respuestaJson(400, {
        mensaje: 'productores debe ser un arreglo de al menos un correo válido',
      });
    }
    agregar('productores', '#productores', productores);
  }
  if (!desactivaBoleteria && datos['porteros'] !== undefined) {
    const porteros = normalizarPorteros(datos['porteros']);
    if (!porteros) {
      return respuestaJson(400, { mensaje: 'porteros inválido' });
    }
    agregar('porteros', '#porteros', porteros);
  }

  if (desactivaBoleteria) {
    // v2 (roadmap #25, hallazgo de code review) — antes de neutralizar el
    // aforo, verifica que no haya compras de este evento todavía reteniendo
    // aforo (mismo criterio que `ESTADOS_QUE_RETIENEN_AFORO`). Sin esta
    // guarda, esas compras quedarían huérfanas: `aprobarCompra()` en
    // aprobaciones.ts traga `ErrorAforo` en un try/catch y de todas formas
    // emite boletas, dejando el evento con su aforo permanentemente en 0/0
    // sin reflejar la realidad. Solo se consulta en esta rama — no le
    // agrega costo al camino feliz de un PUT que no toca
    // `administradoPorLeTiende`.
    const comprasEnCurso = await documentoDynamoDB.send(
      new QueryCommand({
        TableName: process.env['TABLA_COMPRAS'],
        IndexName: 'eventoId-creadaEn-index',
        KeyConditionExpression: 'eventoId = :eventoId',
        FilterExpression: 'estado = :iniciada OR estado = :esperandoComprobante OR estado = :enRevision',
        ExpressionAttributeValues: {
          ':eventoId': eventoId,
          ':iniciada': ESTADOS_QUE_RETIENEN_AFORO[0],
          ':esperandoComprobante': ESTADOS_QUE_RETIENEN_AFORO[1],
          ':enRevision': ESTADOS_QUE_RETIENEN_AFORO[2],
        },
      }),
    );
    const cantidadEnCurso = (comprasEnCurso.Items ?? []).length;
    if (cantidadEnCurso > 0) {
      return respuestaJson(409, {
        mensaje:
          `No se puede desactivar la boletería administrada: hay ${cantidadEnCurso} compra(s) en curso ` +
          'para este evento (iniciada/esperando comprobante/en revisión). Resuélvelas o espera a que ' +
          'expiren antes de desactivar.',
      });
    }

    // Fuerza el valor neutro de cada campo de boletería en esta misma
    // escritura (ver el comentario junto a `desactivaBoleteria` más arriba)
    // — `sillasTotales`/`sillasDisponibles`/`sillasReservadas` se fuerzan en
    // 0 directamente (no con la aritmética relativa del bloque de
    // `sillasTotales` de arriba, que se salta por completo en este caso).
    agregar('sillasTotales', '#sillasTotales', SILLAS_TOTALES_NEUTRO);
    agregar('sillasDisponibles', '#sillasDisponibles', SILLAS_TOTALES_NEUTRO);
    agregar('sillasReservadas', '#sillasReservadas', 0);
    agregar('etapas', '#etapas', []);
    agregar('mediosPago', '#mediosPago', []);
    agregar('productores', '#productores', []);
    agregar('porteros', '#porteros', []);
    agregar('plazoComprobanteMinutos', '#plazoComprobanteMinutos', PLAZO_COMPROBANTE_MINUTOS_NEUTRO);
    agregar('maxBoletasPorCompra', '#maxBoletasPorCompra', MAX_BOLETAS_POR_COMPRA_NEUTRO);
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
        ConditionExpression: ['attribute_exists(eventoId)', ...condicionesExtra].join(' AND '),
        ReturnValues: 'ALL_NEW',
      }),
    );
    if (resultado.Attributes) {
      await sincronizarConGoogleCalendar(resultado.Attributes);
    }
    return respuestaJson(200, resultado.Attributes);
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      // Con condiciones extra en juego (bloque de `sillasTotales` de arriba
      // — nunca se llega aquí si `desactivaBoleteria` las saltó), una
      // condición fallida no significa "el evento no existe" (ya se
      // comprobó arriba con la lectura previa) sino que el aforo cambió
      // entre la lectura y esta escritura (otra edición concurrente, o el
      // delta dejaría `sillasDisponibles` en negativo) — 409, no 404, para
      // que el administrador sepa que debe reintentar, no que el evento
      // desapareció.
      if (condicionesExtra.length > 0) {
        return respuestaJson(409, {
          mensaje: 'El aforo del evento cambió mientras editabas — intenta de nuevo',
        });
      }
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
  } catch (error) {
    // Se registra el error real (sin datos personales del cliente, CLAUDE.md
    // §5 A09) porque el 500 genérico de más abajo, sin esto, deja cualquier
    // fallo del backend indistinguible en CloudWatch — solo aparecen las
    // líneas START/END/REPORT de Lambda, sin pista de la causa.
    console.error('actualizarEvento/crearEvento/eliminarEvento falló', {
      metodo: evento.requestContext.http.method,
      eventoId,
      nombreError: error instanceof Error ? error.name : 'error desconocido',
      mensajeError: error instanceof Error ? error.message : undefined,
    });
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
