import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { AforoInsuficienteError, ErrorAforo, EventoNoPublicadoError, reservarSillas } from '../services/aforo';
import { generarTokenEnlace } from '../lib/enlaces-magicos';
import { finalizarSiVencido, haFinalizadoPorVigencia } from '../lib/vigencia-evento';
import { CanalCorreoSes } from '../services/notificaciones';
import {
  esEmailValido,
  esEnteroPositivo,
  esNombreClienteValido,
  esTelefonoValido,
  esTextoValido,
} from '../lib/validaciones';
import { respuestaJson } from '../lib/http';

const canalNotificacion = new CanalCorreoSes();

// Texto de aceptación de datos personales — placeholder honesto basado en lo
// ya documentado en CLAUDE.md (Habeas Data), NO es texto legal revisado por
// un humano. Debe reemplazarse antes de vender boletas reales (TODO.md
// Tarea 2). La versión se persiste en cada compra para poder demostrar qué
// texto exacto aceptó cada cliente si cambia más adelante. Exportada porque
// `ventas-efectivo.ts` (venta presencial, también un flujo de compra) la
// reutiliza sin duplicar el texto.
export const VERSION_TERMINOS_ACTUAL = '2026-08-07';

export type EstadoCompra = 'esperando_comprobante' | 'en_revision' | 'aprobada' | 'rechazada' | 'expirada';

// tech-specs.md §4.3 — única copia del lado del backend, mismo criterio que
// el `MedioPago` del modelo de frontend (`src/app/core/models/evento.model.ts`).
export type MedioPago = 'bold' | 'efectivo' | 'transferencia';

export interface EtapaBoleteria {
  etapaId: string;
  nombre: string;
  precio: number;
  cierraEn: string;
  orden: number;
}

export interface EventoParaCompra {
  eventoId: string;
  slug: string;
  nombre: string;
  estado: string;
  // Presente en el ítem real desde siempre (nunca la escribe compras.ts),
  // declarada recién ahora porque `haFinalizadoPorVigencia()` (hotfixes
  // pre-producción) la necesita — mismo motivo que `productores`/`porteros`
  // abajo, mismo criterio de "tipar solo lo que se lee, cuando algo empieza
  // a leerlo".
  fechaHora: string;
  etapas: EtapaBoleteria[];
  maxBoletasPorCompra: number;
  mediosPago: MedioPago[];
  plazoComprobanteMinutos: number;
  // Presentes en el ítem real de DynamoDB desde siempre (nunca los escribe
  // compras.ts), pero solo se necesitan a partir de `ventas-efectivo.ts`
  // (`TODO.md` Tarea 1, T8: `tieneAccesoAlEvento(eventoEncontrado, permisos)`
  // exige que este tipo declare `productores`/`porteros`, no solo que el
  // dato exista en tiempo de ejecución).
  productores: string[];
  porteros: string[];
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
 * Reutilizada por `ventas-efectivo.ts` (`TODO.md` Tarea 2) — único punto que
 * resuelve un evento publicado por slug, nunca se reimplementa.
 */
export async function buscarEventoPublicadoPorSlug(slug: string): Promise<EventoParaCompra | null> {
  const resultado = await documentoDynamoDB.send(
    new QueryCommand({
      TableName: process.env['TABLA_EVENTOS'],
      IndexName: 'slug-index',
      KeyConditionExpression: 'slug = :slug',
      ExpressionAttributeValues: { ':slug': slug },
      Limit: 1,
    }),
  );
  const item = resultado.Items?.[0];
  return item ? (item as EventoParaCompra) : null;
}

/**
 * La etapa vigente es, entre las etapas ordenadas cronológicamente por
 * `cierraEn`, la primera cuyo `cierraEn` todavía no pasó (`TODO.md` Tarea 2)
 * — el precio nunca se acepta desde el cliente, se calcula siempre acá
 * (`CLAUDE.md` §5, A08). `orden` es solo la posición manual que el
 * administrador le da a la etapa en el formulario y no necesariamente
 * coincide con el orden real de cierre (una etapa agregada después puede
 * cerrar antes que una ya existente): usarlo para este cálculo produce una
 * etapa vigente incorrecta y, con ella, un precio cobrado incorrecto.
 * Exportada: `ventas-efectivo.ts` la reutiliza, nunca reimplementa el
 * cálculo de precio.
 */
export function etapaVigente(etapas: EtapaBoleteria[], ahora: Date): EtapaBoleteria | null {
  const ordenadas = [...etapas].sort((a, b) => new Date(a.cierraEn).getTime() - new Date(b.cierraEn).getTime());
  return ordenadas.find((etapa) => new Date(etapa.cierraEn).getTime() > ahora.getTime()) ?? null;
}

/**
 * `POST /api/compras` — inicia una compra, reserva el aforo con `aforo.ts`
 * y envía por correo el enlace para cargar el comprobante. Público, con el
 * mismo criterio de `tech-specs.md` §8.3: el precio y la etapa vigente se
 * calculan siempre en el servidor, nunca se aceptan del payload.
 */
async function crearCompra(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const cuerpo = leerCuerpo(evento);
  if (cuerpo === undefined) {
    return respuestaJson(400, { mensaje: 'Cuerpo inválido' });
  }
  const datos = (cuerpo ?? {}) as Record<string, unknown>;

  if (!esTextoValido(datos['slug'], 120)) {
    return respuestaJson(400, { mensaje: 'slug inválido' });
  }
  if (!esEnteroPositivo(datos['cantidad'])) {
    return respuestaJson(400, { mensaje: 'cantidad debe ser un entero positivo' });
  }
  if (datos['autorizacionDatos'] !== true) {
    return respuestaJson(400, {
      mensaje: 'Debes aceptar los términos y el tratamiento de tus datos personales',
    });
  }

  const cliente = datos['cliente'];
  if (typeof cliente !== 'object' || cliente === null) {
    return respuestaJson(400, { mensaje: 'cliente inválido' });
  }
  const clienteDatos = cliente as Record<string, unknown>;
  if (
    !esNombreClienteValido(clienteDatos['nombre']) ||
    !esTelefonoValido(clienteDatos['telefono']) ||
    !esEmailValido(clienteDatos['correo'])
  ) {
    return respuestaJson(400, {
      mensaje: 'nombre, telefono y correo del cliente son obligatorios y deben ser válidos',
    });
  }

  const eventoEncontrado = await buscarEventoPublicadoPorSlug(datos['slug']);
  if (!eventoEncontrado || eventoEncontrado.estado !== 'publicado') {
    return respuestaJson(404, { mensaje: 'No existe un evento publicado con ese slug' });
  }

  const ahora = new Date();

  // Vigencia real (hotfixes pre-producción), no solo el `estado` persistido
  // — mismo criterio que `eventos-publicos.ts`: un evento cuya fecha Y el
  // cierre de su última etapa ya pasaron se trata como finalizado aunque el
  // campo `estado` todavía diga `publicado`, con la misma actualización
  // best-effort. Se chequea ANTES que `etapaVigente()` de abajo para que un
  // evento realmente terminado responda el mismo 404 "no existe" en vez del
  // 409 "no hay etapa vigente" (ese 409 es para el caso más común y distinto
  // de un evento vigente cuyas etapas configuradas ya cerraron todas).
  if (haFinalizadoPorVigencia(eventoEncontrado, ahora)) {
    await finalizarSiVencido(process.env['TABLA_EVENTOS'], eventoEncontrado.eventoId, eventoEncontrado.estado);
    return respuestaJson(404, { mensaje: 'No existe un evento publicado con ese slug' });
  }

  if (datos['cantidad'] > eventoEncontrado.maxBoletasPorCompra) {
    return respuestaJson(400, {
      mensaje: `El máximo de boletas por compra es ${eventoEncontrado.maxBoletasPorCompra}`,
    });
  }

  const etapa = etapaVigente(eventoEncontrado.etapas, ahora);
  if (!etapa) {
    return respuestaJson(409, { mensaje: 'No hay una etapa de boletería vigente para este evento' });
  }

  // Alcance explícito de TODO.md Tarea 2: las boletas gratuitas (roadmap
  // #12, emisión) todavía no existen — mejor un 501 claro que una compra
  // "confirmada" que nunca emite nada.
  if (etapa.precio === 0) {
    return respuestaJson(501, {
      mensaje: 'Las boletas gratuitas todavía no están soportadas',
    });
  }

  try {
    await reservarSillas(eventoEncontrado.eventoId, datos['cantidad']);
  } catch (error) {
    if (error instanceof AforoInsuficienteError) {
      return respuestaJson(409, { mensaje: error.message, sillasDisponibles: error.sillasDisponibles });
    }
    if (error instanceof ErrorAforo) {
      return respuestaJson(409, { mensaje: error.message });
    }
    throw error;
  }

  const montoTotal = etapa.precio * datos['cantidad'];
  const { token, hash } = generarTokenEnlace();
  const compraId = randomUUID();
  const expiraEnFecha = new Date(ahora.getTime() + eventoEncontrado.plazoComprobanteMinutos * 60_000);
  // TTL de DynamoDB exige epoch-segundos (Number), nunca ISO 8601 — excepción
  // explícita a la regla general de fechas de CLAUDE.md §4 (ver MEMORY.md
  // §7): `expiraEn` es el atributo de TTL de agora-compras.
  const expiraEnEpoch = Math.floor(expiraEnFecha.getTime() / 1000);

  const compra = {
    compraId,
    eventoId: eventoEncontrado.eventoId,
    etapaId: etapa.etapaId,
    cantidad: datos['cantidad'],
    cliente: {
      nombre: clienteDatos['nombre'],
      telefono: clienteDatos['telefono'],
      correo: clienteDatos['correo'],
    },
    montoTotal,
    // Único medio realmente alcanzable por este flujo hoy: Bold (fase 2,
    // ADR-003 en MEMORY.md) todavía no existe, y 'efectivo' es exclusivo de
    // ventas-efectivo.ts (venta presencial, sin comprobante). Fijo en vez de
    // aceptado del payload — mismo criterio de A08 que el precio: nunca se
    // confía en lo que el cliente afirme haber pagado. Gap de modelo
    // cerrado en esta tarea (TODO.md Tarea 2): antes de este cambio,
    // ninguna compra persistía medioPago pese a que tech-specs.md §4.3 ya
    // lo define en la interfaz Compra.
    medioPago: 'transferencia' as MedioPago,
    estado: 'esperando_comprobante' as EstadoCompra,
    tokenComprobanteHash: hash,
    autorizacionDatosAceptadaEn: ahora.toISOString(),
    versionTerminos: VERSION_TERMINOS_ACTUAL,
    expiraEn: expiraEnEpoch,
    creadaEn: ahora.toISOString(),
  };

  try {
    // Sin lectura previa: la condición evita colisionar con un compraId ya
    // existente bajo concurrencia (mismo criterio que crearEvento en
    // eventos.ts) — astronómicamente improbable con UUID v4, pero la
    // escritura condicional es gratis y elimina la duda.
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Item: compra,
        ConditionExpression: 'attribute_not_exists(compraId)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'No se pudo crear la compra, intenta de nuevo' });
    }
    throw error;
  }

  const urlComprobante = `${process.env['URL_BASE_APP'] ?? ''}/comprobante/${token}`;
  try {
    await canalNotificacion.enviar(
      { correo: clienteDatos['correo'], nombre: clienteDatos['nombre'] },
      'enlace_comprobante',
      {
        nombreEvento: eventoEncontrado.nombre,
        cantidad: datos['cantidad'],
        montoTotal,
        urlComprobante,
        plazoComprobanteMinutos: eventoEncontrado.plazoComprobanteMinutos,
      },
    );
  } catch (error) {
    // Best-effort (mismo criterio que eliminarActivosDelEvento en
    // eventos.ts): la reserva y la compra ya son válidas aunque el correo
    // falle. Se registra el compraId y el nombre del error para poder
    // diagnosticar (bug real: este catch tragaba el fallo en silencio, sin
    // ningún rastro en CloudWatch — MEMORY.md §7) — nunca el mensaje
    // completo del error ni el objeto original, porque un error de SES
    // sobre una dirección inválida puede incluir esa misma dirección en su
    // texto, y nunca se registra el correo ni el teléfono del cliente
    // (CLAUDE.md §5, A09).
    const nombreError = error instanceof Error ? error.name : 'error desconocido';
    console.error('No se pudo enviar el enlace de comprobante', { compraId, nombreError });
  }

  return respuestaJson(201, {
    compraId,
    estado: compra.estado,
    cantidad: compra.cantidad,
    montoTotal,
    expiraEn: expiraEnFecha.toISOString(),
  });
}

/**
 * `GET /api/compras/:compraId/estado` — público, nunca expone `cliente` ni
 * ningún dato personal. El TTL de DynamoDB "típicamente" borra en 48 horas,
 * no al segundo (`tech-specs.md` §5.4 punto 4): si `expiraEn` ya pasó pero
 * el ítem todavía existe, igual se reporta `expirada`.
 */
async function consultarEstadoCompra(
  compraId: string | undefined,
): Promise<APIGatewayProxyResultV2> {
  if (!compraId) {
    return respuestaJson(400, { mensaje: 'Falta el compraId en la ruta' });
  }

  const resultado = await documentoDynamoDB.send(
    new GetCommand({ TableName: process.env['TABLA_COMPRAS'], Key: { compraId } }),
  );
  const item = resultado.Item;
  if (!item) {
    return respuestaJson(404, { mensaje: 'No existe una compra con ese identificador' });
  }

  const expiraEnEpoch = typeof item['expiraEn'] === 'number' ? item['expiraEn'] : undefined;
  const yaVencio = expiraEnEpoch !== undefined && expiraEnEpoch <= Math.floor(Date.now() / 1000);
  const estado = item['estado'] === 'esperando_comprobante' && yaVencio ? 'expirada' : item['estado'];

  return respuestaJson(200, {
    compraId: item['compraId'],
    estado,
    cantidad: item['cantidad'],
    montoTotal: item['montoTotal'],
    expiraEn: expiraEnEpoch !== undefined ? new Date(expiraEnEpoch * 1000).toISOString() : undefined,
  });
}

/**
 * `POST /api/compras`, `GET /api/compras/:compraId/estado` — sin
 * `exigirRol`: superficie pública que muta estado en Ágora
 * (`tech-specs.md` §8.3), protegida solo con validación exhaustiva de
 * payload, nunca con autenticación de equipo. **Sin límite de tasa por IP
 * todavía** — gap documentado a propósito en `TODO.md`/`MEMORY.md` §7
 * (Serverless Framework no soporta throttle nativo por ruta para HTTP
 * API, verificado).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const compraId = evento.pathParameters?.['compraId'];
  const esEstado = (evento.rawPath ?? '').endsWith('/estado');

  try {
    if (esEstado && evento.requestContext.http.method === 'GET') {
      return await consultarEstadoCompra(compraId);
    }
    if (evento.requestContext.http.method === 'POST') {
      return await crearCompra(evento);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
