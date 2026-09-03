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
  etapas: [{ etapaId: 'et2', nombre: 'Única', precio: 30000, cierraEn: '2026-09-10T00:00:00.000Z', orden: 1 }],
  estado: 'agotado',
  productores: [],
};

// Vencido con margen amplio (año 2020) para no depender de cuándo corre la
// prueba — mismo criterio ya usado en el resto de fixtures "en el pasado"
// del proyecto.
const eventoVencido = {
  ...eventoPublicado,
  eventoId: 'e3',
  slug: 'evento-vencido',
  fechaHora: '2020-01-10T00:00:00.000Z',
  etapas: [{ etapaId: 'et3', nombre: 'Única', precio: 20000, cierraEn: '2020-01-05T00:00:00.000Z', orden: 1 }],
};

describe('handler de /api/eventos-publicos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['TABLA_EVENTOS'] = 'agora-eventos-test';
    process.env['BUCKET_ACTIVOS'] = 'agora-activos-test';
    process.env['AWS_REGION'] = 'us-east-1';
  });

  describe('GET /api/eventos-publicos', () => {
    it('combina publicado, agotado y cancelado (vigente), ordena por fechaHora y excluye productores', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [eventoPublicado] })
        .mockResolvedValueOnce({ Items: [eventoAgotado] })
        .mockResolvedValueOnce({ Items: [] });

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
      sendMock
        .mockResolvedValueOnce({ Items: [eventoPublicado] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

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
      sendMock
        .mockResolvedValueOnce({ Items: [eventoAgotado] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo[0].imagenUrl).toBeUndefined();
      expect(cuerpo[0].logotipoUrl).toBeUndefined();
    });

    // v2 (roadmap #25) — eventos con boletería externa.
    it('normaliza administradoPorLeTiende a true cuando el evento no tiene el atributo (retrocompatibilidad)', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [eventoPublicado] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo[0].administradoPorLeTiende).toBe(true);
    });

    it('agrega vinculoExternoUrl anteponiendo el prefijo fijo del tipo de vínculo', async () => {
      const eventoExterno = {
        ...eventoPublicado,
        eventoId: 'e6',
        slug: 'evento-externo',
        administradoPorLeTiende: false,
        vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
      };
      sendMock
        .mockResolvedValueOnce({ Items: [eventoExterno] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo[0].administradoPorLeTiende).toBe(false);
      expect(cuerpo[0].vinculoExternoUrl).toBe('https://wa.me/573001234567');
    });

    it('usa Query sobre estado-fechaHora-index para cada estado que puede ser visible, nunca Scan', async () => {
      sendMock.mockResolvedValue({ Items: [] });

      await invocar('GET');

      expect(sendMock).toHaveBeenCalledTimes(3);
      for (const llamada of sendMock.mock.calls) {
        const comando = llamada[0];
        expect(comando.constructor.name).toBe('QueryCommand');
        expect(comando.input.IndexName).toBe('estado-fechaHora-index');
      }
      const estadosConsultados = sendMock.mock.calls.map(
        (llamada) => llamada[0].input.ExpressionAttributeValues[':estado'],
      );
      expect(estadosConsultados.sort()).toEqual(['agotado', 'cancelado', 'publicado']);
    });

    it('incluye un evento cancelado mientras todavía está vigente (hotfix 3)', async () => {
      const eventoCancelado = { ...eventoPublicado, eventoId: 'e4', slug: 'cancelado-vigente', estado: 'cancelado' };
      sendMock
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [eventoCancelado] });

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo).toHaveLength(1);
      expect(cuerpo[0].slug).toBe('cancelado-vigente');
      expect(cuerpo[0].estado).toBe('cancelado');
    });

    it('excluye un evento publicado cuya vigencia ya terminó (hotfix 1) y lo finaliza best-effort', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [eventoVencido] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({}); // UpdateCommand best-effort de finalizarSiVencido

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo).toHaveLength(0);
      expect(sendMock).toHaveBeenCalledTimes(4);
      const comandoUpdate = sendMock.mock.calls[3][0];
      expect(comandoUpdate.constructor.name).toBe('UpdateCommand');
      expect(comandoUpdate.input.Key).toEqual({ eventoId: 'e3' });
      expect(comandoUpdate.input.ExpressionAttributeValues[':finalizado']).toBe('finalizado');
      expect(comandoUpdate.input.ExpressionAttributeValues[':estadoActual']).toBe('publicado');
    });

    it('excluye un evento cancelado cuya vigencia ya terminó (hotfix 1 + 3)', async () => {
      const eventoCanceladoVencido = { ...eventoVencido, eventoId: 'e5', estado: 'cancelado' };
      sendMock
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [eventoCanceladoVencido] })
        .mockResolvedValueOnce({});

      const respuesta = await invocar('GET');

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo).toHaveLength(0);
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
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('responde 404 si el evento existe pero está finalizado', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, estado: 'finalizado' }] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(404);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('devuelve 200 si el evento está cancelado pero todavía vigente (hotfix 3)', async () => {
      sendMock.mockResolvedValue({ Items: [{ ...eventoPublicado, estado: 'cancelado' }] });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/concierto-jazz',
        slug: 'concierto-jazz',
      });

      expect(respuesta.statusCode).toBe(200);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.estado).toBe('cancelado');
    });

    it('responde 404 si el evento está cancelado y su vigencia ya terminó, y lo finaliza best-effort', async () => {
      sendMock
        .mockResolvedValueOnce({ Items: [{ ...eventoVencido, estado: 'cancelado' }] })
        .mockResolvedValueOnce({});

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/evento-vencido',
        slug: 'evento-vencido',
      });

      expect(respuesta.statusCode).toBe(404);
      expect(sendMock).toHaveBeenCalledTimes(2);
      const comandoUpdate = sendMock.mock.calls[1][0];
      expect(comandoUpdate.constructor.name).toBe('UpdateCommand');
      expect(comandoUpdate.input.ExpressionAttributeValues[':estadoActual']).toBe('cancelado');
    });

    it('responde 404 si el evento publicado ya venció por vigencia, y lo finaliza best-effort', async () => {
      sendMock.mockResolvedValueOnce({ Items: [eventoVencido] }).mockResolvedValueOnce({});

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos-publicos/evento-vencido',
        slug: 'evento-vencido',
      });

      expect(respuesta.statusCode).toBe(404);
      expect(sendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('GET /sitemap.xml', () => {
    it('genera un urlset XML con solo los eventos en estado publicado y vigentes', async () => {
      sendMock.mockResolvedValue({ Items: [eventoPublicado] });

      const respuesta = await invocar('GET', { rawPath: '/sitemap.xml' });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('application/xml');
      expect(respuesta.body).toContain('<loc>https://letiende.co/cartelera/evento/concierto-jazz</loc>');
      expect(respuesta.body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

      const comando = sendMock.mock.calls[0][0];
      expect(comando.constructor.name).toBe('QueryCommand');
      expect(comando.input.IndexName).toBe('estado-fechaHora-index');
      expect(comando.input.ExpressionAttributeValues[':estado']).toBe('publicado');
    });

    it('excluye un evento publicado cuya vigencia ya terminó, sin escribir en la base de datos', async () => {
      sendMock.mockResolvedValue({ Items: [eventoVencido] });

      const respuesta = await invocar('GET', { rawPath: '/sitemap.xml' });

      expect(respuesta.body).not.toContain('evento-vencido');
      expect(sendMock).toHaveBeenCalledTimes(1);
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
