import { JWT } from 'google-auth-library';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from './dynamodb';

/**
 * Sincronización con Google Calendar (roadmap #22, `.omc/plans/google-calendar-sync.md`
 * §3-4) — cuenta de servicio (Opción A, ya decidida) con el calendario
 * principal de `letiende.co@gmail.com` compartido directamente con ella
 * (`docs/tareas-a-realizar.md` §10). Se usa `google-auth-library` (solo el
 * `JWT` para firmar la autenticación) en vez del paquete `googleapis`
 * completo, mucho más pesado y con impacto en el cold start (gotcha ya
 * documentado en `CLAUDE.md` §7) — las llamadas REST se hacen directo con
 * `cliente.request()`, que ya maneja el token de acceso.
 *
 * Interfaces locales, no importadas de `src/app/core/models/evento.model.ts`
 * — vive fuera del `rootDir` del bundle de las Lambdas (mismo motivo
 * documentado en `server/api/handlers/reportes.ts`).
 */

export interface EtapaParaCalendar {
  nombre: string;
  precio: number;
  cierraEn: string;
}

export type TipoVinculoParaCalendar = 'whatsapp' | 'instagram' | 'web';

export interface VinculoExternoParaCalendar {
  tipo: TipoVinculoParaCalendar;
  valor: string;
}

/** Subconjunto de `Evento` que este servicio necesita para armar el payload de Calendar. */
export interface EventoParaCalendar {
  nombre: string;
  slug: string;
  fechaHora: string;
  administradoPorLeTiende: boolean;
  vinculoExterno?: VinculoExternoParaCalendar;
  etapas: EtapaParaCalendar[];
}

export interface ProductorResuelto {
  correo: string;
  nombre: string;
}

export type ResultadoSincronizacionCalendar =
  | { exito: true; googleCalendarEventId: string }
  | { exito: false };

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const UBICACION_FIJA = 'Cra. 24 #37-44, Teusaquillo, Bogotá, Cundinamarca, Colombia';
const DURACION_EVENTO_MS = 3 * 60 * 60 * 1000;
const ESCOPO_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';

// v2 (roadmap #25) — mismo criterio de prefijos que
// `eventos-publicos.ts`/`eventos.ts` (`PREFIJOS_VINCULO_EXTERNO`,
// `normalizarVinculoExterno`): `valor` solo trae la parte variable, sin el
// prefijo fijo de cada tipo. Se duplica aquí (3 líneas) en vez de
// extraerlo a un helper compartido — mismo criterio de duplicación ya
// usado en este backend para las interfaces de `Evento` (`compras.ts`,
// `reportes.ts`): cada Lambda se empaqueta y evalúa por separado.
const PREFIJOS_VINCULO_EXTERNO: Record<TipoVinculoParaCalendar, string> = {
  whatsapp: 'https://wa.me/57',
  instagram: 'https://www.instagram.com/',
  web: 'https://',
};

function urlVinculoExterno(vinculo: VinculoExternoParaCalendar): string {
  return `${PREFIJOS_VINCULO_EXTERNO[vinculo.tipo]}${vinculo.valor}`;
}

/**
 * `fechaIso` (UTC ISO 8601) → texto legible en hora de Bogotá, para la
 * descripción del evento de Calendar. Mismo offset fijo `-05:00` que
 * `fechaLegibleBogota()` en `handlers/reportes.ts` (Colombia no observa
 * horario de verano desde 1993) — duplicada aquí por el mismo motivo que
 * esa: no se puede importar `src/app/shared/utilidades/fecha-bogota.ts`
 * desde una Lambda empaquetada con esbuild.
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

function formatoCop(valor: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor);
}

/**
 * Descripción del evento de Calendar, en el orden decidido (§4 del plan):
 * (1) productor(es), solo si `administradoPorLeTiende` y hay al menos uno
 * resuelto; (2) el enlace (a `/evento/:slug` o al `vinculoExterno`); (3)
 * una línea por etapa de boletería, si el evento tiene alguna.
 */
function construirDescripcion(
  evento: EventoParaCalendar,
  productoresResueltos: ProductorResuelto[],
): string {
  const lineas: string[] = [];

  if (evento.administradoPorLeTiende && productoresResueltos.length > 0) {
    for (const productor of productoresResueltos) {
      lineas.push(`Productor: ${productor.nombre} (${productor.correo})`);
    }
  }

  if (evento.administradoPorLeTiende) {
    const urlBase = process.env['URL_BASE_APP'] ?? '';
    lineas.push(`Más información: ${urlBase}/evento/${evento.slug}`);
  } else if (evento.vinculoExterno) {
    lineas.push(`Más información: ${urlVinculoExterno(evento.vinculoExterno)}`);
  }

  if (evento.etapas.length > 0) {
    for (const etapa of evento.etapas) {
      lineas.push(
        `${etapa.nombre}: cierra ${fechaLegibleBogota(etapa.cierraEn)} (hora Bogotá) — $${formatoCop(etapa.precio)}`,
      );
    }
  }

  return lineas.join('\n');
}

function construirPayload(
  evento: EventoParaCalendar,
  productoresResueltos: ProductorResuelto[],
): Record<string, unknown> {
  const fin = new Date(Date.parse(evento.fechaHora) + DURACION_EVENTO_MS).toISOString();

  return {
    summary: evento.nombre,
    location: UBICACION_FIJA,
    description: construirDescripcion(evento, productoresResueltos),
    start: { dateTime: evento.fechaHora, timeZone: 'America/Bogota' },
    end: { dateTime: fin, timeZone: 'America/Bogota' },
    reminders: { useDefault: true },
  };
}

interface CredencialCuentaServicio {
  client_email: string;
  private_key: string;
}

/** `true` si `GOOGLE_CALENDAR_SERVICE_ACCOUNT` está presente — permite a `eventos.ts` saltarse por completo la resolución de productores (GetItem por cada uno) cuando la sincronización ni siquiera va a intentarse. */
export function credencialCalendarConfigurada(): boolean {
  return Boolean(process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT']);
}

function obtenerCredencial(): CredencialCuentaServicio | null {
  const credencialJson = process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT'];
  if (!credencialJson) {
    return null;
  }
  try {
    const credencial = JSON.parse(credencialJson) as Record<string, unknown>;
    if (
      typeof credencial['client_email'] !== 'string' ||
      typeof credencial['private_key'] !== 'string'
    ) {
      return null;
    }
    return { client_email: credencial['client_email'], private_key: credencial['private_key'] };
  } catch {
    return null;
  }
}

/**
 * Resuelve nombre + correo de cada productor asignado, consultando
 * `agora-usuarios` por `GetItem` (reutiliza el permiso IAM ya existente de
 * `EventosLambdaRole`, sin ampliarlo — `resolver-permisos.ts` usa el mismo
 * patrón). Si un correo no existe en `agora-usuarios` (dato inconsistente),
 * se usa el correo solo como `nombre`, en vez de fallar.
 */
export async function resolverProductores(correos: string[]): Promise<ProductorResuelto[]> {
  return Promise.all(
    correos.map(async (correo) => {
      const resultado = await documentoDynamoDB.send(
        new GetCommand({ TableName: process.env['TABLA_USUARIOS'], Key: { email: correo } }),
      );
      const nombre = resultado.Item?.['nombre'];
      return { correo, nombre: typeof nombre === 'string' ? nombre : correo };
    }),
  );
}

/**
 * Llama a Calendar API v3 (`events.insert`/`events.update`) y nunca lanza
 * una excepción no controlada hacia quien la invoca — mismo patrón
 * *best-effort* que `emitirBoletas()` en `boleteria.ts`. Si la credencial
 * no está configurada, devuelve `{ exito: false }` de inmediato sin
 * intentar nada (ni construir el payload, ni tocar la red) — así el
 * entorno local/tests sigue funcionando sin la credencial real.
 */
async function sincronizarEventoCalendar(
  metodo: 'POST' | 'PUT',
  url: string,
  evento: EventoParaCalendar,
  productoresResueltos: ProductorResuelto[],
): Promise<ResultadoSincronizacionCalendar> {
  const credencial = obtenerCredencial();
  if (!credencial) {
    return { exito: false };
  }

  try {
    const payload = construirPayload(evento, productoresResueltos);
    const cliente = new JWT({
      email: credencial.client_email,
      key: credencial.private_key,
      scopes: [ESCOPO_CALENDAR],
    });

    const respuesta = await cliente.request<{ id?: unknown }>({ method: metodo, url, data: payload });

    const id = respuesta.data?.id;
    if (typeof id !== 'string' || id.length === 0) {
      return { exito: false };
    }
    return { exito: true, googleCalendarEventId: id };
  } catch (error) {
    // Best-effort: nunca se propaga. Se registra el nombre del error para
    // diagnóstico (CLAUDE.md §5, A09), nunca datos personales.
    console.error('La sincronización con Google Calendar falló', {
      metodo,
      nombreError: error instanceof Error ? error.name : 'error desconocido',
    });
    return { exito: false };
  }
}

/** `POST /calendars/primary/events` — crea el evento espejo en Calendar. */
export async function crearEventoCalendar(
  evento: EventoParaCalendar,
  productoresResueltos: ProductorResuelto[],
): Promise<ResultadoSincronizacionCalendar> {
  return sincronizarEventoCalendar(
    'POST',
    `${CALENDAR_API_BASE}/calendars/primary/events`,
    evento,
    productoresResueltos,
  );
}

/**
 * `PUT /calendars/primary/events/{googleCalendarEventId}` (`events.update`,
 * nunca `events.patch`) — reemplaza el evento de Calendar por completo con
 * el estado actual del evento en Ágora, tal como pidió el usuario (§1 del
 * plan: "se reemplaza por completo, no un patch incremental").
 */
export async function actualizarEventoCalendar(
  googleCalendarEventId: string,
  evento: EventoParaCalendar,
  productoresResueltos: ProductorResuelto[],
): Promise<ResultadoSincronizacionCalendar> {
  return sincronizarEventoCalendar(
    'PUT',
    `${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(googleCalendarEventId)}`,
    evento,
    productoresResueltos,
  );
}
