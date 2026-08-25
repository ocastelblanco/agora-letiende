import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock, sendMock, ssmSendMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  sendMock: vi.fn(),
  ssmSendMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  JWT: vi.fn().mockImplementation(function (this: { request: typeof requestMock }) {
    this.request = requestMock;
  }),
}));
vi.mock('./dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(function (this: { send: typeof ssmSendMock }) {
    this.send = ssmSendMock;
  }),
  GetParameterCommand: vi.fn().mockImplementation(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

const CREDENCIAL_VALIDA = JSON.stringify({
  client_email: 'agora-calendario@proyecto.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
});

const eventoAdministrado = {
  nombre: 'Concierto de jazz',
  slug: 'concierto-jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
  etapas: [],
};

// El módulo cachea la credencial resuelta de SSM en una variable de módulo
// (reutilización de contexto de ejecución de Lambda, igual que
// `obtenerAppFirebase()` en `lib/verificar-token.ts`) — así que hace falta
// `vi.resetModules()` + reimportar en cada test para que ese caché no
// arrastre estado entre pruebas (un test que resolvió la credencial no debe
// "contaminar" al siguiente, que espera que SSM no esté configurado).
let crearEventoCalendar: typeof import('./google-calendar').crearEventoCalendar;
let actualizarEventoCalendar: typeof import('./google-calendar').actualizarEventoCalendar;
let resolverProductores: typeof import('./google-calendar').resolverProductores;
let credencialCalendarConfigurada: typeof import('./google-calendar').credencialCalendarConfigurada;

beforeEach(async () => {
  vi.clearAllMocks();
  requestMock.mockReset();
  sendMock.mockReset();
  ssmSendMock.mockReset();
  process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT_SSM_PARAM'] = '/agora/test/google-calendar-service-account';
  process.env['URL_BASE_APP'] = 'https://agora.letiende.co';
  process.env['TABLA_USUARIOS'] = 'agora-usuarios-test';
  // Por defecto, la credencial válida — los tests que necesitan "sin
  // configurar" sobrescriben este mock explícitamente antes de importar.
  ssmSendMock.mockResolvedValue({ Parameter: { Value: CREDENCIAL_VALIDA } });

  vi.resetModules();
  const modulo = await import('./google-calendar');
  crearEventoCalendar = modulo.crearEventoCalendar;
  actualizarEventoCalendar = modulo.actualizarEventoCalendar;
  resolverProductores = modulo.resolverProductores;
  credencialCalendarConfigurada = modulo.credencialCalendarConfigurada;
});

describe('credencialCalendarConfigurada', () => {
  it('true cuando SSM devuelve una credencial válida', async () => {
    await expect(credencialCalendarConfigurada()).resolves.toBe(true);
  });

  it('false cuando GOOGLE_CALENDAR_SERVICE_ACCOUNT_SSM_PARAM no está configurado', async () => {
    delete process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT_SSM_PARAM'];
    vi.resetModules();
    ({ credencialCalendarConfigurada } = await import('./google-calendar'));

    await expect(credencialCalendarConfigurada()).resolves.toBe(false);
    expect(ssmSendMock).not.toHaveBeenCalled();
  });

  it("false cuando SSM devuelve el valor de relleno 'sin-configurar' del serverless.yml", async () => {
    ssmSendMock.mockResolvedValue({ Parameter: { Value: 'sin-configurar' } });
    vi.resetModules();
    ({ credencialCalendarConfigurada } = await import('./google-calendar'));

    await expect(credencialCalendarConfigurada()).resolves.toBe(false);
  });

  it('false cuando SSM falla (parámetro inexistente, sin permiso, etc.)', async () => {
    ssmSendMock.mockRejectedValue(new Error('ParameterNotFound'));
    vi.resetModules();
    ({ credencialCalendarConfigurada } = await import('./google-calendar'));

    await expect(credencialCalendarConfigurada()).resolves.toBe(false);
  });

  it('solo consulta SSM una vez por contenedor (caché de módulo)', async () => {
    await credencialCalendarConfigurada();
    await credencialCalendarConfigurada();
    await credencialCalendarConfigurada();

    expect(ssmSendMock).toHaveBeenCalledTimes(1);
  });
});

describe('crearEventoCalendar', () => {
  it('devuelve { exito: false } de inmediato si SSM no tiene una credencial válida, sin llamar a Calendar', async () => {
    ssmSendMock.mockResolvedValue({ Parameter: { Value: 'sin-configurar' } });
    vi.resetModules();
    ({ crearEventoCalendar } = await import('./google-calendar'));

    const resultado = await crearEventoCalendar(eventoAdministrado, []);

    expect(resultado).toEqual({ exito: false });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('hace POST a calendars/primary/events con el payload correcto', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    const resultado = await crearEventoCalendar(eventoAdministrado, []);

    expect(resultado).toEqual({ exito: true, googleCalendarEventId: 'gcal-123' });
    expect(requestMock).toHaveBeenCalledTimes(1);
    const llamada = requestMock.mock.calls[0]?.[0];
    expect(llamada.method).toBe('POST');
    expect(llamada.url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(llamada.data).toMatchObject({
      summary: 'Concierto de jazz',
      location: 'Cra. 24 #37-44, Teusaquillo, Bogotá, Cundinamarca, Colombia',
      start: { dateTime: '2026-09-15T01:00:00.000Z', timeZone: 'America/Bogota' },
      end: { dateTime: '2026-09-15T04:00:00.000Z', timeZone: 'America/Bogota' },
      reminders: { useDefault: true },
    });
  });

  it('devuelve { exito: false } sin lanzar cuando la llamada HTTP falla', async () => {
    requestMock.mockRejectedValueOnce(new Error('Calendar API no disponible'));

    const resultado = await crearEventoCalendar(eventoAdministrado, []);

    expect(resultado).toEqual({ exito: false });
  });

  it('incluye "Productor: nombre (correo)" por cada productor resuelto', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(eventoAdministrado, [
      { correo: 'maria@correo.com', nombre: 'María Gómez' },
      { correo: 'juan@correo.com', nombre: 'Juan Pérez' },
    ]);

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).toContain('Productor: María Gómez (maria@correo.com)');
    expect(descripcion).toContain('Productor: Juan Pérez (juan@correo.com)');
  });

  it('con evento administrado incluye el enlace a /evento/:slug', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(eventoAdministrado, []);

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).toContain('https://agora.letiende.co/evento/concierto-jazz');
  });

  it('con boletería externa incluye la URL de vinculoExterno, no el enlace a /evento/:slug', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(
      {
        ...eventoAdministrado,
        administradoPorLeTiende: false,
        vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
      },
      [],
    );

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).toContain('https://wa.me/573001234567');
    expect(descripcion).not.toContain('/evento/concierto-jazz');
  });

  it('con instagram antepone el prefijo fijo correcto', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(
      {
        ...eventoAdministrado,
        administradoPorLeTiende: false,
        vinculoExterno: { tipo: 'instagram', valor: 'letiende' },
      },
      [],
    );

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).toContain('https://www.instagram.com/letiende');
  });

  it('sin etapas no incluye ninguna sección de etapas en la descripción', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(eventoAdministrado, []);

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).not.toContain('cierra');
  });

  it('con etapas incluye nombre, fecha de cierre en hora Bogotá y valor en formato COP por cada una', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-123' } });

    await crearEventoCalendar(
      {
        ...eventoAdministrado,
        etapas: [{ nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T05:00:00.000Z' }],
      },
      [],
    );

    const descripcion = requestMock.mock.calls[0]?.[0].data.description as string;
    expect(descripcion).toContain('Preventa: cierra 2026-09-01 00:00 (hora Bogotá) — $45.000');
  });
});

describe('actualizarEventoCalendar', () => {
  it('hace PUT a calendars/primary/events/{id} (reemplazo completo, nunca patch)', async () => {
    requestMock.mockResolvedValueOnce({ data: { id: 'gcal-existente' } });

    const resultado = await actualizarEventoCalendar('gcal-existente', eventoAdministrado, []);

    expect(resultado).toEqual({ exito: true, googleCalendarEventId: 'gcal-existente' });
    const llamada = requestMock.mock.calls[0]?.[0];
    expect(llamada.method).toBe('PUT');
    expect(llamada.url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/gcal-existente',
    );
  });

  it('devuelve { exito: false } de inmediato si SSM no tiene una credencial válida, sin llamar a Calendar', async () => {
    ssmSendMock.mockResolvedValue({ Parameter: { Value: 'sin-configurar' } });
    vi.resetModules();
    ({ actualizarEventoCalendar } = await import('./google-calendar'));

    const resultado = await actualizarEventoCalendar('gcal-existente', eventoAdministrado, []);

    expect(resultado).toEqual({ exito: false });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('devuelve { exito: false } sin lanzar cuando la llamada HTTP falla', async () => {
    requestMock.mockRejectedValueOnce(new Error('Calendar API no disponible'));

    const resultado = await actualizarEventoCalendar('gcal-existente', eventoAdministrado, []);

    expect(resultado).toEqual({ exito: false });
  });
});

describe('resolverProductores', () => {
  it('resuelve nombre y correo por cada email consultando agora-usuarios con GetItem', async () => {
    sendMock.mockResolvedValueOnce({ Item: { email: 'maria@correo.com', nombre: 'María Gómez' } });

    const resultado = await resolverProductores(['maria@correo.com']);

    expect(resultado).toEqual([{ correo: 'maria@correo.com', nombre: 'María Gómez' }]);
    const comando = sendMock.mock.calls[0]?.[0];
    expect(comando.input).toMatchObject({
      TableName: 'agora-usuarios-test',
      Key: { email: 'maria@correo.com' },
    });
  });

  it('usa el correo como nombre cuando el usuario no existe en agora-usuarios', async () => {
    sendMock.mockResolvedValueOnce({});

    const resultado = await resolverProductores(['fantasma@correo.com']);

    expect(resultado).toEqual([{ correo: 'fantasma@correo.com', nombre: 'fantasma@correo.com' }]);
  });
});
