import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock, sendMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  JWT: vi.fn().mockImplementation(function (this: { request: typeof requestMock }) {
    this.request = requestMock;
  }),
}));
vi.mock('./dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const {
  crearEventoCalendar,
  actualizarEventoCalendar,
  resolverProductores,
  credencialCalendarConfigurada,
} = await import('./google-calendar');

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

beforeEach(() => {
  vi.clearAllMocks();
  requestMock.mockReset();
  sendMock.mockReset();
  process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT'] = CREDENCIAL_VALIDA;
  process.env['URL_BASE_APP'] = 'https://agora.letiende.co';
  process.env['TABLA_USUARIOS'] = 'agora-usuarios-test';
});

describe('credencialCalendarConfigurada', () => {
  it('true cuando GOOGLE_CALENDAR_SERVICE_ACCOUNT está presente', () => {
    expect(credencialCalendarConfigurada()).toBe(true);
  });

  it('false cuando GOOGLE_CALENDAR_SERVICE_ACCOUNT está ausente/vacío', () => {
    delete process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT'];
    expect(credencialCalendarConfigurada()).toBe(false);
  });
});

describe('crearEventoCalendar', () => {
  it('devuelve { exito: false } de inmediato si falta la credencial, sin llamar a Calendar', async () => {
    delete process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT'];

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

  it('devuelve { exito: false } de inmediato si falta la credencial, sin llamar a Calendar', async () => {
    delete process.env['GOOGLE_CALENDAR_SERVICE_ACCOUNT'];

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
