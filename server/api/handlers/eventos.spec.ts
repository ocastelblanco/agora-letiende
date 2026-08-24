import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exigirRolMock, sendMock, clienteS3SendMock, getSignedUrlMock } = vi.hoisted(() => ({
  exigirRolMock: vi.fn(),
  sendMock: vi.fn(),
  clienteS3SendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

// `tieneAccesoAlEvento` se reexporta desde la implementación real
// (`importOriginal`) — es lógica pura sin dependencias externas, así que no
// hace falta (ni conviene) reimplementarla a mano en el mock; solo
// `exigirRol` se reemplaza por el mock controlado desde cada test.
vi.mock('../lib/autorizacion', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/autorizacion')>();
  return { ...real, exigirRol: exigirRolMock };
});
vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
vi.mock('../services/s3', () => ({ clienteS3: { send: clienteS3SendMock } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));

const { handler } = await import('./eventos');

class ConditionalCheckFailedException extends Error {
  constructor() {
    super('The conditional request failed');
    this.name = 'ConditionalCheckFailedException';
  }
}

const permisosAdmin = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador' as const,
  activo: true,
};

const permisosProductor = {
  email: 'productor@letiende.co',
  nombre: 'Productor',
  rol: 'productor' as const,
  activo: true,
};

const etapaValida = {
  nombre: 'Preventa',
  precio: 45000,
  cierraEn: '2026-09-01T00:00:00.000Z',
  orden: 1,
};

const eventoValido = {
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz en Le Tiende',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  maxBoletasPorCompra: 4,
  etapas: [etapaValida],
  mediosPago: ['efectivo'],
  productores: ['productor@letiende.co'],
};

function crearEvento(
  metodo: string,
  opciones: {
    rawPath?: string;
    eventoId?: string;
    cuerpo?: unknown;
    queryStringParameters?: Record<string, string>;
  } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.rawPath ?? '/api/eventos',
    pathParameters: opciones.eventoId ? { eventoId: opciones.eventoId } : undefined,
    queryStringParameters: opciones.queryStringParameters,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(
  metodo: string,
  opciones?: {
    rawPath?: string;
    eventoId?: string;
    cuerpo?: unknown;
    queryStringParameters?: Record<string, string>;
  },
) {
  const respuesta = await handler(crearEvento(metodo, opciones), {} as never, undefined as never);
  return respuesta as {
    statusCode: number;
    body?: string;
    headers?: Record<string, string>;
    isBase64Encoded?: boolean;
  };
}

describe('handler de /api/eventos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosAdmin });
    clienteS3SendMock.mockResolvedValue({ Contents: [] });
  });

  it('devuelve la respuesta de exigirRol tal cual cuando no está autorizado', async () => {
    exigirRolMock.mockResolvedValue({
      autorizado: false,
      respuesta: { statusCode: 403, body: JSON.stringify({ mensaje: 'No autorizado en Ágora' }) },
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  describe('GET /api/eventos', () => {
    it('devuelve 200 con la lista de eventos', async () => {
      sendMock.mockResolvedValue({ Items: [{ eventoId: 'e1' }] });

      const respuesta = await invocar('GET');

      expect(respuesta.statusCode).toBe(200);
      // v2 (roadmap #25) — administradoPorLeTiende se normaliza a `true`
      // cuando el ítem persistido no tiene el atributo (retrocompatibilidad).
      expect(JSON.parse(respuesta.body!)).toEqual([{ eventoId: 'e1', administradoPorLeTiende: true }]);
    });

    it('respeta administradoPorLeTiende: false persistido, sin sobrescribirlo', async () => {
      sendMock.mockResolvedValue({ Items: [{ eventoId: 'e2', administradoPorLeTiende: false }] });

      const respuesta = await invocar('GET');

      expect(JSON.parse(respuesta.body!)).toEqual([{ eventoId: 'e2', administradoPorLeTiende: false }]);
    });
  });

  describe('POST /api/eventos', () => {
    it('crea el evento con eventoId generado en el backend y aforo inicializado', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', { cuerpo: eventoValido });

      expect(respuesta.statusCode).toBe(201);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(typeof cuerpo.eventoId).toBe('string');
      expect(cuerpo.eventoId.length).toBeGreaterThan(0);
      expect(cuerpo.sillasDisponibles).toBe(100);
      expect(cuerpo.sillasReservadas).toBe(0);
      expect(cuerpo.estado).toBe('borrador');
      expect(cuerpo.etapas[0].etapaId).toEqual(expect.any(String));
    });

    it('ignora un eventoId enviado por el cliente y genera el suyo propio', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, eventoId: 'id-falso-del-cliente' },
      });

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.eventoId).not.toBe('id-falso-del-cliente');
    });

    it('ignora sillasDisponibles enviado por el cliente y lo inicializa desde sillasTotales', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, sillasDisponibles: 999999 },
      });

      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.sillasDisponibles).toBe(100);
    });

    it('responde 400 si falta un campo obligatorio', async () => {
      const { nombre: _nombre, ...sinNombre } = eventoValido;
      const respuesta = await invocar('POST', { cuerpo: sinNombre });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 400 si el slug tiene un formato inválido', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, slug: 'Slug Inválido!' },
      });

      expect(respuesta.statusCode).toBe(400);
    });

    // v2, roadmap #24 — boletería opcional: etapas: [] es válido, el evento
    // no cobra nada y solo controla aforo.
    it('acepta etapas vacío — boletería opcional sin cobro', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', { cuerpo: { ...eventoValido, etapas: [] } });

      expect(respuesta.statusCode).toBe(201);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.etapas).toEqual([]);
    });

    it('responde 400 si etapas no es un arreglo', async () => {
      const respuesta = await invocar('POST', { cuerpo: { ...eventoValido, etapas: 'no-es-un-arreglo' } });

      expect(respuesta.statusCode).toBe(400);
    });

    it('responde 400 si mediosPago trae un valor no reconocido', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, mediosPago: ['bitcoin'] },
      });

      expect(respuesta.statusCode).toBe(400);
    });

    // v2, roadmap #24 — Bold exige al menos una etapa configurada.
    it('responde 400 si mediosPago incluye bold sin ninguna etapa', async () => {
      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, etapas: [], mediosPago: ['efectivo', 'bold'] },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('acepta mediosPago con bold cuando sí hay al menos una etapa', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('POST', {
        cuerpo: { ...eventoValido, mediosPago: ['efectivo', 'bold'] },
      });

      expect(respuesta.statusCode).toBe(201);
    });

    // TODO.md Tarea 1 (T7): el documento de negocio exige al menos un
    // productor para guardar el evento — antes de esta tarea, [] era válido.
    describe('productores/porteros (TODO.md Tarea 1, T7)', () => {
      it('responde 400 si productores está vacío', async () => {
        const respuesta = await invocar('POST', { cuerpo: { ...eventoValido, productores: [] } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('responde 400 si falta productores en el payload (default [] rechazado)', async () => {
        const { productores: _productores, ...sinProductores } = eventoValido;
        const respuesta = await invocar('POST', { cuerpo: sinProductores });

        expect(respuesta.statusCode).toBe(400);
      });

      it('responde 400 si productores trae un correo inválido', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, productores: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('crea el evento con porteros vacío por defecto cuando no se envía en el payload', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', { cuerpo: eventoValido });

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.porteros).toEqual([]);
      });

      it('crea el evento con los porteros enviados', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, porteros: ['portero@letiende.co'] },
        });

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.porteros).toEqual(['portero@letiende.co']);
      });

      it('responde 400 si porteros trae un correo inválido', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, porteros: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
      });
    });

    it('responde 409 si el eventoId colisiona (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('POST', { cuerpo: eventoValido });

      expect(respuesta.statusCode).toBe(409);
    });

    // v2 (roadmap #25) — eventos con boletería externa.
    describe('administradoPorLeTiende / vinculoExterno (roadmap #25)', () => {
      it('crea el evento con administradoPorLeTiende: true por defecto cuando no viene en el payload', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', { cuerpo: eventoValido });

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.administradoPorLeTiende).toBe(true);
        expect(cuerpo.vinculoExterno).toBeUndefined();
      });

      it('responde 400 si administradoPorLeTiende no es booleano', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: { ...eventoValido, administradoPorLeTiende: 'si' },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('con administradoPorLeTiende: false, exige vinculoExterno válido', async () => {
        const { sillasTotales: _s, maxBoletasPorCompra: _m, etapas: _e, mediosPago: _mp, productores: _p, ...base } = eventoValido;
        const respuesta = await invocar('POST', {
          cuerpo: { ...base, administradoPorLeTiende: false },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('con administradoPorLeTiende: false y vinculoExterno whatsapp válido, normaliza los campos de boletería a valores neutros', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
            // Ignorados: el backend nunca confía en estos campos cuando
            // administradoPorLeTiende es false (CLAUDE.md §5, A04/A08).
            sillasTotales: 5000,
            maxBoletasPorCompra: 99,
            etapas: [etapaValida],
            mediosPago: ['bold'],
            productores: ['alguien@letiende.co'],
            porteros: ['otro@letiende.co'],
            plazoComprobanteMinutos: 999,
          },
        });

        expect(respuesta.statusCode).toBe(201);
        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.administradoPorLeTiende).toBe(false);
        expect(cuerpo.vinculoExterno).toEqual({ tipo: 'whatsapp', valor: '3001234567' });
        expect(cuerpo.sillasTotales).toBe(0);
        expect(cuerpo.sillasDisponibles).toBe(0);
        expect(cuerpo.sillasReservadas).toBe(0);
        expect(cuerpo.etapas).toEqual([]);
        expect(cuerpo.mediosPago).toEqual([]);
        expect(cuerpo.productores).toEqual([]);
        expect(cuerpo.porteros).toEqual([]);
        expect(cuerpo.maxBoletasPorCompra).toBe(1);
        expect(cuerpo.plazoComprobanteMinutos).toBe(10);
      });

      it('rechaza vinculoExterno whatsapp con un valor que no son 10 dígitos', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'whatsapp', valor: '12345' },
          },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('rechaza vinculoExterno instagram con caracteres fuera de [A-Za-z0-9._]', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'instagram', valor: 'usuario con espacios' },
          },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('acepta vinculoExterno instagram válido', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'instagram', valor: 'le_tiende.oficial' },
          },
        });

        expect(respuesta.statusCode).toBe(201);
        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.vinculoExterno).toEqual({ tipo: 'instagram', valor: 'le_tiende.oficial' });
      });

      it('rechaza vinculoExterno web cuyo valor ya incluye el prefijo https://', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'web', valor: 'https://forms.gle/abc123' },
          },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('acepta vinculoExterno web sin el prefijo, y arma una URL https válida al anteponerlo', async () => {
        sendMock.mockResolvedValue({});

        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'web', valor: 'forms.gle/abc123' },
          },
        });

        expect(respuesta.statusCode).toBe(201);
        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.vinculoExterno).toEqual({ tipo: 'web', valor: 'forms.gle/abc123' });
      });

      it('rechaza vinculoExterno con un tipo desconocido', async () => {
        const respuesta = await invocar('POST', {
          cuerpo: {
            slug: eventoValido.slug,
            nombre: eventoValido.nombre,
            descripcion: eventoValido.descripcion,
            fechaHora: eventoValido.fechaHora,
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'facebook', valor: 'algo' },
          },
        });

        expect(respuesta.statusCode).toBe(400);
      });
    });
  });

  describe('PUT /api/eventos/:eventoId', () => {
    it('actualiza el evento y responde 200', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1', nombre: 'Nuevo nombre' } });

      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { nombre: 'Nuevo nombre' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('ignora sillasDisponibles enviado directo en el payload (nunca se acepta un valor literal)', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

      await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { nombre: 'X', sillasDisponibles: 1 },
      });

      const comando = sendMock.mock.calls[0][0];
      expect(comando.input.UpdateExpression).not.toContain('sillasDisponibles');
    });

    describe('sillasTotales editable por administrador (hotfixes pre-producción)', () => {
      it('ajusta sillasDisponibles por la diferencia, con aritmética relativa (nunca un valor absoluto)', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 150 } });

        expect(sendMock).toHaveBeenCalledTimes(2);
        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.UpdateExpression).toContain('sillasTotales = :nuevoSillasTotales');
        expect(comandoUpdate.input.UpdateExpression).toContain(
          'sillasDisponibles = sillasDisponibles + :deltaSillas',
        );
        expect(comandoUpdate.input.ExpressionAttributeValues[':nuevoSillasTotales']).toBe(150);
        expect(comandoUpdate.input.ExpressionAttributeValues[':deltaSillas']).toBe(50);
      });

      it('permite reducir sillasTotales hasta exactamente lo ya vendido/reservado (delta negativo)', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        // comprometidas = 100 - 20 = 80
        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 80 } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':deltaSillas']).toBe(-20);
      });

      it('responde 400 si el nuevo total es menor que lo ya vendido/reservado, sin escribir en DynamoDB', async () => {
        sendMock.mockResolvedValueOnce({
          Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
        });

        // comprometidas = 80, pedir 79 debe rechazarse.
        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 79 } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('responde 404 si el evento no existe', async () => {
        sendMock.mockResolvedValueOnce({ Item: undefined });

        const respuesta = await invocar('PUT', { eventoId: 'inexistente', cuerpo: { sillasTotales: 100 } });

        expect(respuesta.statusCode).toBe(404);
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('responde 400 si sillasTotales no es un entero positivo', async () => {
        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 0 } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('incluye la guarda optimista sobre sillasTotales y sobre sillasDisponibles nunca negativo en el ConditionExpression, sin aritmética (bug real de staging)', async () => {
        // DynamoDB ConditionExpression no admite operadores aritméticos
        // (`+`/`-`) — solo UpdateExpression los admite en su cláusula SET.
        // Esta prueba habría pasado igual con la condición inválida de
        // antes, porque el mock no valida sintaxis real de DynamoDB (por
        // eso el bug solo apareció en staging); lo que sí verifica es que
        // el umbral se precalculó en JS y la condición solo compara un
        // `path` contra un `value`, nunca una suma dentro de la condición.
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 150 } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ConditionExpression).toContain('sillasTotales = :totalLeido');
        expect(comandoUpdate.input.ConditionExpression).toContain(
          'sillasDisponibles >= :minimoSillasDisponibles',
        );
        expect(comandoUpdate.input.ConditionExpression).not.toMatch(/sillasDisponibles\s*\+/);
        expect(comandoUpdate.input.ExpressionAttributeValues[':totalLeido']).toBe(100);
        // delta = 150 - 100 = +50 (aumenta el aforo) — el umbral nunca baja
        // de 0 aunque el delta sea positivo.
        expect(comandoUpdate.input.ExpressionAttributeValues[':minimoSillasDisponibles']).toBe(0);
      });

      it('calcula el umbral mínimo como -delta cuando se reduce sillasTotales, para que la condición siga siendo una comparación simple', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        // comprometidas = 80, nuevoTotal 85 → delta = -15 → umbral = 15.
        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 85 } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':deltaSillas']).toBe(-15);
        expect(comandoUpdate.input.ExpressionAttributeValues[':minimoSillasDisponibles']).toBe(15);
      });

      it('responde 409 (no 404) si la condición falla con sillasTotales en el payload (aforo cambió mientras editaban)', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', estado: 'publicado', sillasTotales: 100, sillasDisponibles: 20 },
          })
          .mockRejectedValueOnce(new ConditionalCheckFailedException());

        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 150 } });

        expect(respuesta.statusCode).toBe(409);
      });

      it('reactiva automáticamente a publicado un evento agotado si el nuevo aforo queda positivo', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: {
              eventoId: 'e1',
              estado: 'agotado',
              sillasTotales: 100,
              sillasDisponibles: 0,
              fechaHora: '2026-09-15T01:00:00.000Z',
              etapas: [{ etapaId: 'et1', cierraEn: '2026-09-10T00:00:00.000Z' }],
            },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 120 } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':estado']).toBe('publicado');
      });

      it('no reactiva un evento agotado si el propio payload ya trae un estado explícito', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: {
              eventoId: 'e1',
              estado: 'agotado',
              sillasTotales: 100,
              sillasDisponibles: 0,
              fechaHora: '2026-09-15T01:00:00.000Z',
              etapas: [{ etapaId: 'et1', cierraEn: '2026-09-10T00:00:00.000Z' }],
            },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 120, estado: 'finalizado' } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':estado']).toBe('finalizado');
      });

      it('no reactiva un evento agotado cuya vigencia ya terminó (no resucita un evento vencido)', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: {
              eventoId: 'e1',
              estado: 'agotado',
              sillasTotales: 100,
              sillasDisponibles: 0,
              fechaHora: '2020-01-10T00:00:00.000Z',
              etapas: [{ etapaId: 'et1', cierraEn: '2020-01-05T00:00:00.000Z' }],
            },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 120 } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':estado']).toBeUndefined();
      });

      it('un productor no puede enviar sillasTotales: 403, sin escribir en DynamoDB', async () => {
        exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosProductor });

        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { sillasTotales: 150 } });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('sillasTotales y etapas en el mismo payload comparten una única lectura previa', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: {
              eventoId: 'e1',
              estado: 'publicado',
              sillasTotales: 100,
              sillasDisponibles: 20,
              etapas: [{ etapaId: 'et1' }],
            },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { sillasTotales: 150, etapas: [{ ...etapaValida, etapaId: 'et1' }] },
        });

        // Una sola lectura (GetCommand) + una escritura (UpdateCommand) —
        // nunca dos lecturas por venir ambos campos en el mismo payload.
        expect(sendMock).toHaveBeenCalledTimes(2);
      });
    });

    it('responde 400 si no hay campos para actualizar', async () => {
      const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: {} });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('responde 400 si imagenKey no pertenece al prefijo del evento', async () => {
      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { imagenKey: 'eventos/otro-evento/foto.jpg' },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('acepta imagenKey cuando pertenece al prefijo del evento', async () => {
      sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

      const respuesta = await invocar('PUT', {
        eventoId: 'e1',
        cuerpo: { imagenKey: 'eventos/e1/imagen-abc.jpg' },
      });

      expect(respuesta.statusCode).toBe(200);
    });

    it('responde 404 si el eventoId no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('PUT', { eventoId: 'inexistente', cuerpo: { nombre: 'X' } });

      expect(respuesta.statusCode).toBe(404);
    });

    describe('productores/porteros (TODO.md Tarea 1, T7)', () => {
      it('responde 400 si productores se edita a un arreglo vacío (el evento nunca puede quedar sin ninguno)', async () => {
        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { productores: [] } });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('actualiza productores cuando el arreglo tiene al menos un correo válido', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { productores: ['nuevo@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(200);
        const comando = sendMock.mock.calls[0][0];
        expect(comando.input.ExpressionAttributeValues[':productores']).toEqual(['nuevo@letiende.co']);
      });

      it('acepta porteros vacío al editar (opcional, a diferencia de productores)', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', { eventoId: 'e1', cuerpo: { porteros: [] } });

        expect(respuesta.statusCode).toBe(200);
      });

      it('actualiza porteros con los correos enviados', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { porteros: ['portero@letiende.co'] } });

        const comando = sendMock.mock.calls[0][0];
        expect(comando.input.ExpressionAttributeValues[':porteros']).toEqual(['portero@letiende.co']);
      });

      it('responde 400 si porteros trae un correo inválido, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { porteros: ['no-es-un-correo'] },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('etapaId estable (TODO.md Tarea 2)', () => {
      it('reenviar el etapaId de una etapa existente no genera uno nuevo', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida, etapaId: 'et1' }] },
        });

        expect(sendMock).toHaveBeenCalledTimes(2);
        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':etapas'][0].etapaId).toBe('et1');
      });

      it('una etapa nueva (sin etapaId) recibe un etapaId nuevo generado por el backend', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida }] },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapaEnviada = comandoUpdate.input.ExpressionAttributeValues[':etapas'][0];
        expect(typeof etapaEnviada.etapaId).toBe('string');
        expect(etapaEnviada.etapaId).not.toBe('et1');
      });

      it('un etapaId que no pertenece al evento (inventado/obsoleto) se descarta y se genera uno nuevo', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [{ ...etapaValida, etapaId: 'etapa-inventada' }] },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapaEnviada = comandoUpdate.input.ExpressionAttributeValues[':etapas'][0];
        expect(etapaEnviada.etapaId).not.toBe('etapa-inventada');
      });

      it('dos etapas del payload que reenvían el mismo etapaId existente no terminan con la misma identidad', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: {
            etapas: [
              { ...etapaValida, etapaId: 'et1' },
              { ...etapaValida, nombre: 'General', etapaId: 'et1' },
            ],
          },
        });

        const comandoUpdate = sendMock.mock.calls[1][0];
        const etapasEnviadas = comandoUpdate.input.ExpressionAttributeValues[':etapas'];
        expect(etapasEnviadas[0].etapaId).toBe('et1');
        expect(etapasEnviadas[1].etapaId).not.toBe('et1');
        expect(typeof etapasEnviadas[1].etapaId).toBe('string');
      });

      it('responde 404 y no llega al UpdateCommand si el eventoId no existe', async () => {
        sendMock.mockResolvedValueOnce({ Item: undefined });

        const respuesta = await invocar('PUT', {
          eventoId: 'inexistente',
          cuerpo: { etapas: [etapaValida] },
        });

        expect(respuesta.statusCode).toBe(404);
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('un PUT sin etapas en el payload no hace ningún GetCommand extra', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1', nombre: 'X' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { nombre: 'X' } });

        expect(sendMock).toHaveBeenCalledTimes(1);
      });
    });

    // v2, roadmap #24 — invariante "Bold exige al menos una etapa" aplicada
    // también en la edición, no solo al crear.
    describe('Bold exige al menos una etapa (roadmap #24)', () => {
      it('responde 400 si mediosPago trae bold y el payload también vacía etapas', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [], mediosPago: ['efectivo', 'bold'] },
        });

        expect(respuesta.statusCode).toBe(400);
        // Solo el GetCommand de leerEventoActual() — nunca llega al UpdateCommand.
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('responde 400 si mediosPago trae bold y el evento actual no tiene ninguna etapa', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [] } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { mediosPago: ['efectivo', 'bold'] },
        });

        expect(respuesta.statusCode).toBe(400);
      });

      it('acepta mediosPago con bold si el evento actual ya tiene etapas', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { mediosPago: ['efectivo', 'bold'] },
        });

        expect(respuesta.statusCode).toBe(200);
      });

      it('retira bold automáticamente si un PUT vacía las etapas sin tocar mediosPago', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }], mediosPago: ['efectivo', 'bold'] },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { etapas: [] } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.UpdateExpression).toContain('#mediosPago');
        expect(comandoUpdate.input.ExpressionAttributeValues[':mediosPago']).toEqual(['efectivo']);
      });

      it('no toca mediosPago si un PUT vacía las etapas y bold no estaba habilitado', async () => {
        sendMock
          .mockResolvedValueOnce({
            Item: { eventoId: 'e1', etapas: [{ etapaId: 'et1' }], mediosPago: ['efectivo'] },
          })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', { eventoId: 'e1', cuerpo: { etapas: [] } });

        const comandoUpdate = sendMock.mock.calls[1][0];
        expect(comandoUpdate.input.UpdateExpression).not.toContain('#mediosPago');
      });
    });

    // v2 (roadmap #25) — eventos con boletería externa.
    describe('administradoPorLeTiende / vinculoExterno (roadmap #25)', () => {
      it('responde 400 si administradoPorLeTiende no es booleano', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { administradoPorLeTiende: 'si' },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('responde 400 si desactiva administradoPorLeTiende sin vinculoExterno en el mismo PUT, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { administradoPorLeTiende: false },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('responde 400 si vinculoExterno es inválido para el tipo', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { vinculoExterno: { tipo: 'whatsapp', valor: 'no-son-digitos' } },
        });

        expect(respuesta.statusCode).toBe(400);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('desactiva administradoPorLeTiende con vinculoExterno válido: normaliza los campos de boletería a valores neutros, ignorando lo que mande el cliente para ellos', async () => {
        // 1er send: QueryCommand de compras en curso (sin resultados, no
        // bloquea la desactivación). 2do send: el UpdateCommand real.
        sendMock.mockResolvedValueOnce({ Items: [] });
        sendMock.mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: {
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
            // Debe ignorarse por completo: ni se valida ni se escribe tal
            // cual (CLAUDE.md §5, A04/A08).
            sillasTotales: 5000,
            etapas: [{ nombre: 'X', precio: 1, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 }],
            mediosPago: ['bold'],
            productores: ['alguien@letiende.co'],
          },
        });

        // Sin ningún GetCommand extra: los bloques de sillasTotales/etapas
        // (los únicos que necesitan leer el evento actual) se saltan por
        // completo cuando desactivaBoleteria es true. Sí hay un QueryCommand
        // extra (verificación de compras en curso, hallazgo de code review).
        expect(sendMock).toHaveBeenCalledTimes(2);
        const comandoQuery = sendMock.mock.calls[0][0];
        expect(comandoQuery.input.IndexName).toBe('eventoId-creadaEn-index');
        expect(comandoQuery.input.ExpressionAttributeValues[':eventoId']).toBe('e1');

        const comandoUpdate = sendMock.mock.calls[1][0];
        const valores = comandoUpdate.input.ExpressionAttributeValues;
        expect(valores[':administradoPorLeTiende']).toBe(false);
        expect(valores[':vinculoExterno']).toEqual({ tipo: 'whatsapp', valor: '3001234567' });
        expect(valores[':sillasTotales']).toBe(0);
        expect(valores[':sillasDisponibles']).toBe(0);
        expect(valores[':sillasReservadas']).toBe(0);
        expect(valores[':etapas']).toEqual([]);
        expect(valores[':mediosPago']).toEqual([]);
        expect(valores[':productores']).toEqual([]);
        expect(valores[':porteros']).toEqual([]);
        expect(valores[':maxBoletasPorCompra']).toBe(1);
        expect(valores[':plazoComprobanteMinutos']).toBe(10);
      });

      it('responde 409 y no escribe nada si hay una compra "esperando_comprobante" para el evento (hallazgo de code review)', async () => {
        sendMock.mockResolvedValueOnce({
          Items: [{ compraId: 'c1', eventoId: 'e1', estado: 'esperando_comprobante' }],
        });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: {
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
          },
        });

        expect(respuesta.statusCode).toBe(409);
        expect(JSON.parse(respuesta.body!).mensaje).toContain('compra(s) en curso');
        // Solo el QueryCommand de verificación — nunca llega a escribir el
        // UpdateCommand que neutralizaría el aforo.
        expect(sendMock).toHaveBeenCalledTimes(1);
      });

      it('permite desactivar administradoPorLeTiende cuando las únicas compras del evento ya están resueltas (aprobada/rechazada/expirada)', async () => {
        // El FilterExpression real de DynamoDB (estado = iniciada/esperando_
        // comprobante/en_revision) ya excluye del lado del servidor las
        // compras aprobada/rechazada/expirada — el mock simula ese
        // resultado ya filtrado devolviendo Items vacío, mismo criterio que
        // el resto de la suite para QueryCommand con FilterExpression.
        sendMock.mockResolvedValueOnce({ Items: [] });
        sendMock.mockResolvedValueOnce({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: {
            administradoPorLeTiende: false,
            vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' },
          },
        });

        expect(respuesta.statusCode).toBe(200);
        expect(sendMock).toHaveBeenCalledTimes(2);
      });

      it('permite reactivar administradoPorLeTiende: true sin exigir vinculoExterno', async () => {
        sendMock.mockResolvedValue({ Attributes: { eventoId: 'e1' } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { administradoPorLeTiende: true },
        });

        expect(respuesta.statusCode).toBe(200);
        const comandoUpdate = sendMock.mock.calls[0][0];
        expect(comandoUpdate.input.ExpressionAttributeValues[':administradoPorLeTiende']).toBe(true);
      });

      it('un productor con "administradoPorLeTiende" en el payload: 403, sin escribir en DynamoDB', async () => {
        exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosProductor });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { administradoPorLeTiende: false, vinculoExterno: { tipo: 'whatsapp', valor: '3001234567' } },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });
  });

  describe('DELETE /api/eventos/:eventoId', () => {
    it('elimina el evento y responde 204', async () => {
      sendMock.mockResolvedValue({});

      const respuesta = await invocar('DELETE', { eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(204);
    });

    it('responde 404 si el eventoId no existe (ConditionExpression falla)', async () => {
      sendMock.mockRejectedValue(new ConditionalCheckFailedException());

      const respuesta = await invocar('DELETE', { eventoId: 'inexistente' });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 400 si falta el eventoId en la ruta', async () => {
      const respuesta = await invocar('DELETE', {});

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('lista y borra los activos de S3 bajo el prefijo del evento', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'eventos/e1/imagen-abc.png' }, { Key: 'eventos/e1/logotipo-def.png' }],
        })
        .mockResolvedValueOnce({});

      await invocar('DELETE', { eventoId: 'e1' });

      expect(clienteS3SendMock).toHaveBeenCalledTimes(2);
      const comandoListar = clienteS3SendMock.mock.calls[0][0];
      expect(comandoListar.input.Prefix).toBe('eventos/e1/');
      const comandoBorrar = clienteS3SendMock.mock.calls[1][0];
      expect(comandoBorrar.input.Delete.Objects).toEqual([
        { Key: 'eventos/e1/imagen-abc.png' },
        { Key: 'eventos/e1/logotipo-def.png' },
      ]);
    });

    it('no intenta borrar objetos de S3 si el evento no tenía ninguno', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock.mockResolvedValue({ Contents: [] });

      await invocar('DELETE', { eventoId: 'e1' });

      expect(clienteS3SendMock).toHaveBeenCalledTimes(1);
    });

    it('responde 204 aunque falle la limpieza de S3 (best-effort)', async () => {
      sendMock.mockResolvedValue({});
      clienteS3SendMock.mockRejectedValue(new Error('S3 no disponible'));

      const respuesta = await invocar('DELETE', { eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(204);
    });
  });

  describe('POST /api/eventos/:eventoId/activos/url-carga', () => {
    // TODO.md Tarea 1 (T6): generarUrlCargaActivo ahora lee el evento primero
    // para verificar tieneAccesoAlEvento — como admin tiene bypass, alcanza
    // con que el ítem exista.
    beforeEach(() => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1' } });
    });

    it('devuelve una URL prefirmada y una key bajo el prefijo del evento', async () => {
      getSignedUrlMock.mockResolvedValue('https://s3.example.com/presignada');

      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(200);
      const cuerpo = JSON.parse(respuesta.body!);
      expect(cuerpo.url).toBe('https://s3.example.com/presignada');
      expect(cuerpo.key.startsWith('eventos/e1/imagen-')).toBe(true);
    });

    it('responde 400 si el tipoMime es SVG', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/svg+xml', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });

    it('responde 400 si el tamaño excede el máximo permitido', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 999999999 },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    });

    it('responde 400 si tipo no es imagen ni logotipo', async () => {
      const respuesta = await invocar('POST', {
        rawPath: '/api/eventos/e1/activos/url-carga',
        eventoId: 'e1',
        cuerpo: { tipo: 'video', tipoMime: 'image/png', tamano: 1024 },
      });

      expect(respuesta.statusCode).toBe(400);
    });
  });

  describe('GET /api/eventos/:eventoId/qr', () => {
    it('devuelve un SVG que codifica la URL pública del slug real leído de DynamoDB', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'concierto-jazz' } });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('image/svg+xml');
      expect(respuesta.headers?.['Content-Disposition']).toContain('qr-concierto-jazz.svg');
      expect(respuesta.body).toContain('<svg');
    });

    it('devuelve PNG en base64 cuando formato=png', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'concierto-jazz' } });

      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos/e1/qr',
        eventoId: 'e1',
        queryStringParameters: { formato: 'png' },
      });

      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.headers?.['Content-Type']).toBe('image/png');
      expect(respuesta.headers?.['Content-Disposition']).toContain('qr-concierto-jazz.png');
      expect(respuesta.isBase64Encoded).toBe(true);
      const primerosBytes = Buffer.from(respuesta.body!, 'base64').subarray(0, 4);
      expect(primerosBytes).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    it('nunca usa un slug de la ruta o el payload — solo el que lee de DynamoDB', async () => {
      sendMock.mockResolvedValue({ Item: { eventoId: 'e1', slug: 'slug-real-en-bd' } });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

      expect(respuesta.body).toContain('<svg');
      const comandoGet = sendMock.mock.calls[0][0];
      expect(comandoGet.input.Key).toEqual({ eventoId: 'e1' });
    });

    it('responde 404 si el evento no existe', async () => {
      sendMock.mockResolvedValue({ Item: undefined });

      const respuesta = await invocar('GET', { rawPath: '/api/eventos/inexistente/qr', eventoId: 'inexistente' });

      expect(respuesta.statusCode).toBe(404);
    });

    it('responde 400 si formato no es svg ni png', async () => {
      const respuesta = await invocar('GET', {
        rawPath: '/api/eventos/e1/qr',
        eventoId: 'e1',
        queryStringParameters: { formato: 'jpg' },
      });

      expect(respuesta.statusCode).toBe(400);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  it('responde 405 para un método no soportado', async () => {
    const respuesta = await invocar('PATCH');

    expect(respuesta.statusCode).toBe(405);
  });

  describe('Alcance de productor (TODO.md Tarea 1, T6)', () => {
    beforeEach(() => {
      exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosProductor });
    });

    describe('GET /api/eventos', () => {
      it('como productor, solo devuelve los eventos donde está en productores', async () => {
        sendMock.mockResolvedValue({
          Items: [
            { eventoId: 'e1', productores: ['productor@letiende.co'] },
            { eventoId: 'e2', productores: ['otro@letiende.co'] },
            { eventoId: 'e3', productores: ['productor@letiende.co', 'otro@letiende.co'] },
          ],
        });

        const respuesta = await invocar('GET');

        expect(respuesta.statusCode).toBe(200);
        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.map((e: { eventoId: string }) => e.eventoId)).toEqual(['e1', 'e3']);
      });

      it('como administrador, sigue devolviendo todos los eventos (regresión)', async () => {
        exigirRolMock.mockResolvedValue({ autorizado: true, permisos: permisosAdmin });
        sendMock.mockResolvedValue({
          Items: [
            { eventoId: 'e1', productores: ['productor@letiende.co'] },
            { eventoId: 'e2', productores: ['otro@letiende.co'] },
          ],
        });

        const respuesta = await invocar('GET');

        const cuerpo = JSON.parse(respuesta.body!);
        expect(cuerpo.map((e: { eventoId: string }) => e.eventoId)).toEqual(['e1', 'e2']);
      });
    });

    describe('PUT /api/eventos/:eventoId', () => {
      it('productor asignado, solo con campos permitidos: éxito', async () => {
        sendMock
          .mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['productor@letiende.co'] } })
          .mockResolvedValueOnce({ Attributes: { eventoId: 'e1', maxBoletasPorCompra: 6 } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor con un campo no permitido en el payload: 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { nombre: 'Otro nombre' },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "etapas" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { etapas: [etapaValida] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "estado" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { estado: 'publicado' },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      // TODO.md Tarea 1 (T7): ni productores ni porteros entran a
      // CAMPOS_EDITABLES_PRODUCTOR — un productor sigue sin poder tocarlos,
      // sin cambios respecto de T6.
      it('productor con "productores" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { productores: ['otro@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor con "porteros" en el payload (no permitido): 403, sin escribir en DynamoDB', async () => {
        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { porteros: ['portero@letiende.co'] },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });

      it('productor NO asignado al evento: 403', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['otro@letiende.co'] } });

        const respuesta = await invocar('PUT', {
          eventoId: 'e1',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(403);
      });

      it('productor, evento inexistente: 404', async () => {
        sendMock.mockResolvedValueOnce({ Item: undefined });

        const respuesta = await invocar('PUT', {
          eventoId: 'inexistente',
          cuerpo: { maxBoletasPorCompra: 6 },
        });

        expect(respuesta.statusCode).toBe(404);
      });
    });

    describe('POST /api/eventos (crear)', () => {
      it('como productor: 403, sin llegar a DynamoDB', async () => {
        const respuesta = await invocar('POST', { cuerpo: eventoValido });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('DELETE /api/eventos/:eventoId', () => {
      it('como productor: 403, sin llegar a DynamoDB', async () => {
        const respuesta = await invocar('DELETE', { eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(403);
        expect(sendMock).not.toHaveBeenCalled();
      });
    });

    describe('POST /api/eventos/:eventoId/activos/url-carga', () => {
      it('productor asignado: éxito', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['productor@letiende.co'] } });
        getSignedUrlMock.mockResolvedValue('https://s3.example.com/presignada');

        const respuesta = await invocar('POST', {
          rawPath: '/api/eventos/e1/activos/url-carga',
          eventoId: 'e1',
          cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
        });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor NO asignado: 403, sin generar URL prefirmada', async () => {
        sendMock.mockResolvedValueOnce({ Item: { eventoId: 'e1', productores: ['otro@letiende.co'] } });

        const respuesta = await invocar('POST', {
          rawPath: '/api/eventos/e1/activos/url-carga',
          eventoId: 'e1',
          cuerpo: { tipo: 'imagen', tipoMime: 'image/png', tamano: 1024 },
        });

        expect(respuesta.statusCode).toBe(403);
        expect(getSignedUrlMock).not.toHaveBeenCalled();
      });
    });

    describe('GET /api/eventos/:eventoId/qr', () => {
      it('productor asignado: éxito', async () => {
        sendMock.mockResolvedValue({
          Item: { eventoId: 'e1', slug: 'concierto-jazz', productores: ['productor@letiende.co'] },
        });

        const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(200);
      });

      it('productor NO asignado: 403', async () => {
        sendMock.mockResolvedValue({
          Item: { eventoId: 'e1', slug: 'concierto-jazz', productores: ['otro@letiende.co'] },
        });

        const respuesta = await invocar('GET', { rawPath: '/api/eventos/e1/qr', eventoId: 'e1' });

        expect(respuesta.statusCode).toBe(403);
      });
    });
  });
});
