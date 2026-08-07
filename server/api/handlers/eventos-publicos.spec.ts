import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));

const { handler } = await import('./eventos-publicos');

function crearEvento(
  metodo: string,
  opciones: { rawPath?: string; slug?: string } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/eventos-publicos',
    pathParameters: opciones.slug ? { slug: opciones.slug } : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, opciones?: { rawPath?: string; slug?: string }) {
  const respuesta = await handler(crearEvento(metodo, opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string; headers?: Record<string, string> };
}

const eventoPublicado = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz en Le Tiende',
  fechaHora: '2026-09-15T01:00:00.000Z',
  imagenKey: 'eventos/e1/imagen-abc.png',
  logotipoKey: 'eventos/e1/logotipo-def.png',
  etapas: [{ etapaId: 'et1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 }],
  estado: 'publicado',
  productores: ['productor@letiende.co'],
};

const eventoAgotado = {
  eventoId: 'e2',
  slug: 'stand-up-agotado',
  nombre: 'Stand up',
  descripcion: 'Comedia',
  fechaHora: '2026-09-10T01:00:00.000Z',
  etapas: [],
  estado: 'agotado',
  productores: [],
};

describe('handler de /api/eventos-publicos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['TABLA_EVENTOS'] = 'agora-eventos-test';
    process.env['BUCKET_ACTIVOS'] = 'agora-activos-test';
    process.env['AWS_REGION'] = 'us-east-1';
  });

  describe('GET /api/eventos-publicos', () => {
    it('combina publicado y agotado, ordena por fechaHora y excluye productores', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [eventoPublicado] })
        .mockResolvedValueOnce({ Items: [eventoAgotado] });

      const respuesta = await invocar('GET');

      expect(respuesta.statusCode).toBe(200);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo).toHaveLength(2);
      // eventoAgotado (2026-09-10) antes que eventoPublicado (2026-09-15).
      expect(cuerpo[0].slug).toBe('stand-up-agotado');
      expect(cuerpo[1].slug).toBe('concierto-jazz');
      expect(cuerpo[1].productores).toBeUndefined();
      expect(cuerpo[0].productores).toBeUndefined();
    });

    it('agrega imagenUrl/logotipoUrl calculadas en el backend cuando existen las keys', async () => {
      sendMock.mockResolvedValueOnce({ Items: [eventoPublicado] }).mockResolvedValueOnce({ Items: [] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo[0].imagenUrl).toBe(
        'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/e1/imagen-abc.png',
      );
      expect(cuerpo[0].logotipoUrl).toBe(
        'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/e1/logotipo-def.png',
      );
    });

    it('no incluye imagenUrl/logotipoUrl cuando el evento no tiene esas keys', async () => {
      sendMock.mockResolvedValueOnce({ Items: [eventoAgotado] }).mockResolvedValueOnce({ Items: [] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo[0].imagenUrl).toBeUndefined();
      expect(cuerpo[0].logotipoUrl).toBeUndefined();
    });

    it('usa Query sobre estado-fechaHora-index para cada estado visible, nunca Scan', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      await invocar('GET');

      expect(sendMock).toHaveBeenCalledTimes(2);
      for (const llamada of sendMock.mock.calls) {
        const comando = llamada[0];
        expect(comando.constructor.name).toBe('QueryCommand');
        expect(comando.input.IndexName).toBe('estado-fechaHora-index');
      }
      const estadosConsultados = sendMock.mock.calls.map(
        (llamada) => llamada[0].input.ExpressionAttributeValues[':estado'],
      );
      expect(estadosConsultados.sort()).toEqual(['agotado', 'publicado']);
    });
  });

  describe('GET /api/eventos-publicos/:slug', () => {
    it('devuelve el evento cuando existe y está publicado, sin productores', async () => {
      sendMock.mockResolvedValue({ Items: [eventoPublicado] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(200);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.slug).toBe('concierto-jazz');
      expect(cuerpo.productores).toBeUndefined();
    });

    it('usa Query sobre slug-index, nunca Scan', async () => {
      sendMock.mockResolvedValue({ Items: [eventoPublicado] });

      await invocar('GET', { rawPath: '/api/eventos-publicos/concierto-jazz', slug: 'concierto-jazz' });

      expect(sendMock).toHaveBeenCalledTimes(1);
      const comando = sendMock.mock.calls[0][0];
      expect(comando.constructor.name).toBe('QueryCommand');
      expect(comando.input.IndexName).toBe('slug-index');
    });

    it('responde 404 si el slug no existe', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/inexistente',
        slug: 'inexistente',
      });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 404 si el evento existe pero está en borrador', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, estado: 'borrador' }] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 404 si el evento existe pero está finalizado', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, estado: 'finalizado' }] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 404 si el evento existe pero está cancelado', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, estado: 'cancelado' }] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(404);
    });
  });

  describe('GET /sitemap.xml', () => {
    it('genera un urlset XML con solo los eventos en estado publicado', async () => {
      sendMock.mockResolvedValue({ Items: [eventoPublicado] });

      const respuesta = await invocar('GET', { rawPath: '/sitemap.xml' });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('application/xml');
      expect(respuesta.body).toContain('<loc>https://agora.letiende.co/evento/concierto-jazz</loc>');
      expect(respuesta.body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      const comando = sendMock.mock.calls[0][0];
      expect(comando.constructor.name).toBe('QueryCommand');
      expect(comando.input.IndexName).toBe('estado-fechaHora-index');
      expect(comando.input.ExpressionAttributeValues[':estado']).toBe('publicado');
    });

    it('escapa caracteres especiales del slug en el XML', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, slug: 'a&b' }] });

      const respuesta = await invocar('GET', { rawPath: '/sitemap.xml' });

      expect(respuesta.body).toContain('a&amp;b');
    });
  });

  it('responde 405 para un método no soportado', async () => {
    const respuesta = await invocar('POST');

    expect(respuesta.statusCode).toBe(405);
  });
});
