import { randomUUID } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from '../services/dynamodb';
import { AforoInsuficienteError, ErrorAforo, EventoNoPublicadoError, confirmarSillas, reservarSillas } from '../services/aforo';
import { emitirBoletas } from '../services/boleteria';
import { firmarCodigoBoleta } from '../lib/firma-boletas';
import { CanalCorreoSes } from '../services/notificaciones';
import { exigirRol, tieneAccesoAlEvento } from '../lib/autorizacion';
import { finalizarSiVencido, haFinalizadoPorVigencia } from '../lib/vigencia-evento';
import { esEmailValido, esEnteroPositivo, esNombreClienteValido, esTelefonoValido, esTextoValido } from '../lib/validaciones';
import {
  EstadoCompra,
  MedioPago,
  VERSION_TERMINOS_ACTUAL,
  buscarEventoPublicadoPorSlug,
  etapaVigente,
} from './compras';
import { respuestaJson } from '../lib/http';

const canalNotificacion = new CanalCorreoSes();

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
 * `POST /api/ventas-efectivo` (`exigirRol('portero')`) — venta presencial en
 * la puerta (`tech-specs.md` §5.1, `TODO.md` Tarea 2, `PRD.md` CU-11): a
 * diferencia de `crearCompra` (`handlers/compras.ts`), reserva, confirma
 * *y* emite boletas en la misma operación, sin comprobante ni aprobación —
 * no hay plazo, no hay TTL, no hay token de enlace mágico. Reutiliza
 * `buscarEventoPublicadoPorSlug`/`etapaVigente`/`VERSION_TERMINOS_ACTUAL` de
 * `compras.ts` y `reservarSillas`/`confirmarSillas` de `aforo.ts`/
 * `emitirBoletas` de `boleteria.ts` — ninguna se reimplementa (`CLAUDE.md`
 * §5, A08).
 */
async function crearVentaEfectivo(evento: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const autorizacion = await exigirRol(evento, 'portero');
  if (!autorizacion.autorizado) {
    return autorizacion.respuesta;
  }
  const emailVendedor = autorizacion.permisos.email;

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
  // Mismo requisito legal que crearCompra (CLAUDE.md §5, Habeas Data): que la
  // venta sea presencial no exime la autorización explícita de tratamiento
  // de datos del cliente — solo cambia quién la registra (el equipo, tras
  // confirmarla con el cliente en persona, no el propio cliente en un
  // checkbox). Desviación deliberada del payload literal de tech-specs.md
  // §5.1 (`{ slug, cantidad, cliente }`, sin este campo) — CLAUDE.md es la
  // fuente de verdad en materia de seguridad y datos personales.
  if (datos['autorizacionDatos'] !== true) {
    return respuestaJson(400, {
      mensaje: 'Debes confirmar que el cliente autorizó el tratamiento de sus datos personales',
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

  // Vigencia real (hotfixes pre-producción), no solo el `estado`
  // persistido — mismo criterio que `crearCompra()`/`eventos-publicos.ts`:
  // un evento cuya fecha Y el cierre de su última etapa ya pasaron se trata
  // como finalizado aunque el campo `estado` todavía diga `publicado`, con
  // la misma actualización best-effort.
  if (haFinalizadoPorVigencia(eventoEncontrado, ahora)) {
    await finalizarSiVencido(process.env['TABLA_EVENTOS'], eventoEncontrado.eventoId, eventoEncontrado.estado);
    return respuestaJson(404, { mensaje: 'No existe un evento publicado con ese slug' });
  }

  // Autorización real por evento (`TODO.md` Tarea 1, T8): un portero solo
  // puede vender en efectivo para los eventos donde está en `porteros` — un
  // administrador o productor asignado también pasan (`tieneAccesoAlEvento`,
  // que ya incluye esos dos casos). Sin lectura extra: `eventoEncontrado` ya
  // trae `porteros`/`productores` completos desde la Query de arriba.
  if (!tieneAccesoAlEvento(eventoEncontrado, autorizacion.permisos)) {
    return respuestaJson(403, { mensaje: 'No estás asignado a este evento' });
  }

  // El administrador decide por evento qué medios de pago acepta
  // (`evento.mediosPago`, tech-specs.md §4.3) — una venta en efectivo no
  // procede si 'efectivo' no está entre ellos, sin importar el rol de quien
  // la registre.
  if (!eventoEncontrado.mediosPago.includes('efectivo')) {
    return respuestaJson(409, { mensaje: 'Este evento no acepta pagos en efectivo' });
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

  // Mismo alcance explícito que crearCompra: las boletas gratuitas todavía
  // no están soportadas (roadmap #12).
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
  const compraId = randomUUID();

  // Sin tokenComprobanteHash/tokenAprobacionHash/expiraEn: los GSIs de
  // agora-compras que indexan esos atributos son dispersos (sparse) — un
  // ítem que nunca los incluye simplemente no aparece en ellos, sin que
  // haga falta ningún cambio de esquema. Esta venta nace y muere `aprobada`
  // en la misma operación, nunca pasa por `esperando_comprobante`/
  // `en_revision`, así que ninguno de esos tres campos aplica.
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
    medioPago: 'efectivo' as MedioPago,
    estado: 'aprobada' as EstadoCompra,
    autorizacionDatosAceptadaEn: ahora.toISOString(),
    versionTerminos: VERSION_TERMINOS_ACTUAL,
    // Actor responsable de la venta (CLAUDE.md §5, A09) — a diferencia de
    // aprobaciones.ts (enlace compartido entre productores, sin identidad
    // verificable), acá sí hay un correo real: el de quien inició sesión y
    // pasó exigirRol('portero').
    resueltoPor: emailVendedor,
    resueltoEn: ahora.toISOString(),
    creadaEn: ahora.toISOString(),
  };

  try {
    // Sin lectura previa, mismo criterio que crearCompra: astronómicamente
    // improbable que colisione un UUID v4, pero la condición es gratis.
    await documentoDynamoDB.send(
      new PutCommand({
        TableName: process.env['TABLA_COMPRAS'],
        Item: compra,
        ConditionExpression: 'attribute_not_exists(compraId)',
      }),
    );
  } catch (error) {
    if (esErrorCondicionFallida(error)) {
      return respuestaJson(409, { mensaje: 'No se pudo registrar la venta, intenta de nuevo' });
    }
    throw error;
  }

  try {
    await confirmarSillas(eventoEncontrado.eventoId, datos['cantidad']);
  } catch (error) {
    if (!(error instanceof ErrorAforo)) {
      throw error;
    }
    // No debería ocurrir en el camino feliz (el aforo ya estaba reservado
    // desde el paso anterior), mismo criterio de diagnóstico best-effort
    // que aprobarCompra() en aprobaciones.ts.
    console.error('confirmarSillas falló tras registrar la venta en efectivo', { compraId });
  }

  let boletasEmitidas = 0;
  try {
    const boletas = await emitirBoletas({
      compraId,
      eventoId: eventoEncontrado.eventoId,
      etapaId: etapa.etapaId,
      montoTotal,
      cantidad: datos['cantidad'],
    });
    boletasEmitidas = boletas.length;

    const urlBase = process.env['URL_BASE_APP'] ?? '';
    const urlsBoletas = boletas.map(
      (boleta) => `${urlBase}/boleta/${boleta.boletaId}.${firmarCodigoBoleta(boleta.boletaId)}`,
    );
    await canalNotificacion.enviar(
      { correo: clienteDatos['correo'], nombre: clienteDatos['nombre'] },
      'boletas_emitidas',
      { nombreEvento: eventoEncontrado.nombre, urlsBoletas },
    );
  } catch (error) {
    // Best-effort, mismo criterio que aprobarCompra(): la venta ya es
    // válida y las boletas (si llegaron a crearse) también, aunque la
    // emisión o el aviso al cliente fallen — nunca se revierte por esto.
    const nombreError = error instanceof Error ? error.name : 'error desconocido';
    console.error('La emisión de boletas o su notificación falló tras la venta en efectivo', {
      compraId,
      nombreError,
    });
  }

  return respuestaJson(201, {
    compraId,
    estado: compra.estado,
    cantidad: compra.cantidad,
    montoTotal,
    boletas: boletasEmitidas,
  });
}

/**
 * `POST /api/ventas-efectivo` — único método soportado (`TODO.md` Tarea 2).
 */
export const handler: APIGatewayProxyHandlerV2 = async (
  evento: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (evento.requestContext.http.method === 'POST') {
      return await crearVentaEfectivo(evento);
    }
    return respuestaJson(405, { mensaje: 'Método no soportado' });
  } catch {
    return respuestaJson(500, { mensaje: 'Error interno' });
  }
};
