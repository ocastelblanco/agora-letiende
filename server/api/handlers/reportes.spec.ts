import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, exigirRolMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  exigirRolMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
// exigirRol se mockea, pero tieneAccesoAlEvento se importa real (mismo
// criterio que aprobaciones.spec.ts) — es una función pura sin dependencias.
vi.mock('../lib/autorizacion', async () => {
  const real = await vi.importActual<typeof import('../lib/autorizacion')>('../lib/autorizacion');
  return { ...real, exigirRol: exigirRolMock };
});

const { handler } = await import('./reportes');

const permisosProductor = {
  email: 'productor@letiende.co',
  nombre: 'Productor',
  rol: 'productor' as const,
  activo: true,
};

const permisosAdministrador = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador' as const,
  activo: true,
};

const eventoItem = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-01T00:00:00.000Z',
  sillasTotales: 100,
  sillasDisponibles: 40,
  sillasReservadas: 5,
  productores: ['productor@letiende.co'],
  estado: 'publicado',
  etapas: [
    { etapaId: 'et-1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-08-15T00:00:00.000Z', orden: 1 },
    { etapaId: 'et-2', nombre: 'General', precio: 60000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 2 },
  ],
};

const boletasMixtas = [
  { boletaId: 'b1', estado: 'usada' },
  { boletaId: 'b2', estado: 'usada' },
  { boletaId: 'b3', estado: 'valida' },
];

const comprasAprobadas = [
  {
    compraId: 'c1',
    eventoId: 'evt-1',
    etapaId: 'et-1',
    cantidad: 2,
    montoTotal: 90000,
    cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
    medioPago: 'efectivo',
    creadaEn: '2026-08-08T00:00:00.000Z',
    estado: 'aprobada',
  },
  {
    compraId: 'c2',
    eventoId: 'evt-1',
    etapaId: 'et-2',
    cantidad: 1,
    montoTotal: 60000,
    cliente: { nombre: 'Luis Gómez', telefono: '3009876543', correo: 'luis@correo.com' },
    medioPago: 'transferencia',
    creadaEn: '2026-08-09T00:00:00.000Z',
    estado: 'aprobada',
  },
];

function crearPeticion(
  metodo: string,
  opciones: { eventoId?: string } = {},
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: metodo } },
    rawPath: opciones.eventoId ? `/api/eventos/${opciones.eventoId}/panel` : '/api/eventos/panel',
    pathParameters: opciones.eventoId ? { eventoId: opciones.eventoId } : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocar(metodo: string, opciones?: Parameters<typeof crearPeticion>[1]) {
  const respuesta = await handler(crearPeticion(metodo, opciones), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  sendMock.mockReset();
  exigirRolMock.mockReset();
});

describe('GET /api/eventos/panel', () => {
  it('responde con la respuesta de exigirRol si no está autorizado', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 403, body: '{"mensaje":"No autorizado en Ágora"}' },
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('solo lista los eventos donde el productor está asignado', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({
      Items: [
        eventoItem,
        { ...eventoItem, eventoId: 'evt-ajeno', slug: 'otro-evento', productores: ['otro@letiende.co'] },
      ],
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toEqual([
      {
        eventoId: 'evt-1',
        slug: 'concierto-jazz',
        nombre: 'Concierto de jazz',
        fechaHora: '2026-09-01T00:00:00.000Z',
        estado: 'publicado',
      },
    ]);
  });

  it('devuelve todos los eventos sin filtrar, con bypass de administrador', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosAdministrador });
    sendMock.mockResolvedValueOnce({
      Items: [
        eventoItem,
        { ...eventoItem, eventoId: 'evt-ajeno', slug: 'otro-evento', productores: ['otro@letiende.co'] },
      ],
    });

    const respuesta = await invocar('GET');

    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toHaveLength(2);
  });
});

describe('GET /api/eventos/:eventoId/panel', () => {
  it('responde con la respuesta de exigirRol si no está autorizado', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 401, body: '{"mensaje":"No autenticado"}' },
    });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    expect(respuesta.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el evento no existe', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocar('GET', { eventoId: 'evt-inexistente' });

    expect(respuesta.statusCode).toBe(404);
  });

  it('responde 403 si el productor no está asignado a este evento', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({
      Item: { ...eventoItem, productores: ['otro@letiende.co'] },
    });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    expect(respuesta.statusCode).toBe(403);
    // Nunca consulta boletas/compras si el acceso al evento ya fue denegado.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('agrega métricas por etapa, aforo e ingresados/faltan con dos etapas y boletas mixtas', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock
      .mockResolvedValueOnce({ Item: eventoItem })
      .mockResolvedValueOnce({ Items: boletasMixtas })
      .mockResolvedValueOnce({ Items: comprasAprobadas });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo).toEqual({
      nombreEvento: 'Concierto de jazz',
      sillasTotales: 100,
      sillasDisponibles: 40,
      sillasVendidas: 55,
      porEtapa: [
        { etapaId: 'et-1', nombre: 'Preventa', vendidas: 2, recaudado: 90000 },
        { etapaId: 'et-2', nombre: 'General', vendidas: 1, recaudado: 60000 },
      ],
      totalVendidas: 3,
      totalRecaudado: 150000,
      ingresados: 2,
      totalBoletas: 3,
      faltanPorIngresar: 1,
      clientes: [
        {
          compraId: 'c1',
          nombre: 'Ana Pérez',
          telefono: '3001234567',
          correo: 'ana@correo.com',
          cantidad: 2,
          montoTotal: 90000,
          etapaId: 'et-1',
          medioPago: 'efectivo',
          creadaEn: '2026-08-08T00:00:00.000Z',
        },
        {
          compraId: 'c2',
          nombre: 'Luis Gómez',
          telefono: '3009876543',
          correo: 'luis@correo.com',
          cantidad: 1,
          montoTotal: 60000,
          etapaId: 'et-2',
          medioPago: 'transferencia',
          creadaEn: '2026-08-09T00:00:00.000Z',
        },
      ],
    });

    const consultaBoletas = sendMock.mock.calls[1]?.[0];
    expect(consultaBoletas.input.IndexName).toBe('eventoId-estado-index');
    const consultaCompras = sendMock.mock.calls[2]?.[0];
    expect(consultaCompras.input.IndexName).toBe('eventoId-creadaEn-index');
  });

  it('no pierde una compra cuyo etapaId ya no existe en evento.etapas (huérfana por edición del evento)', async () => {
    // Simula el bug de eventos.ts: `normalizarEtapas()` regenera etapaId en
    // cada PUT que incluya `etapas`, huerfanizando el etapaId de compras ya
    // aprobadas. `porEtapa` debe seguir mostrando esa plata, con un nombre
    // de respaldo, y los totales nunca deben perderla.
    const compraHuerfana = {
      ...comprasAprobadas[0],
      compraId: 'c-huerfana',
      etapaId: 'et-borrada',
    };
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock
      .mockResolvedValueOnce({ Item: eventoItem })
      .mockResolvedValueOnce({ Items: boletasMixtas })
      .mockResolvedValueOnce({ Items: [...comprasAprobadas, compraHuerfana] });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.porEtapa).toContainEqual({
      etapaId: 'et-borrada',
      nombre: 'Etapa eliminada',
      vendidas: 2,
      recaudado: 90000,
    });
    // Los totales se calculan sobre TODAS las compras aprobadas, sin pasar
    // por `etapas` — nunca pueden desaparecer aunque `porEtapa` tenga
    // huérfanos.
    expect(cuerpo.totalVendidas).toBe(5);
    expect(cuerpo.totalRecaudado).toBe(240000);
  });

  it('permite el acceso con bypass de administrador aunque no esté en productores', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosAdministrador });
    sendMock
      .mockResolvedValueOnce({ Item: { ...eventoItem, productores: ['otro@letiende.co'] } })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.ingresados).toBe(0);
    expect(cuerpo.totalBoletas).toBe(0);
  });
});

describe('método no soportado', () => {
  it('responde 405 para métodos distintos de GET', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });

    const respuesta = await invocar('POST');

    expect(respuesta.statusCode).toBe(405);
  });
});
