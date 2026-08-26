import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const { sendMock, exigirRolMock, clienteS3SendMock, getSignedUrlMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  exigirRolMock: vi.fn(),
  clienteS3SendMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

vi.mock('../services/dynamodb', () => ({ documentoDynamoDB: { send: sendMock } }));
// exigirRol se mockea, pero tieneAccesoAlEvento se importa real (mismo
// criterio que aprobaciones.spec.ts) — es una función pura sin dependencias.
vi.mock('../lib/autorizacion', async () => {
  const real = await vi.importActual<typeof import('../lib/autorizacion')>('../lib/autorizacion');
  return { ...real, exigirRol: exigirRolMock };
});
// Mismo patrón que comprobantes.spec.ts/aprobaciones.spec.ts para el
// mecanismo de URL prefirmada (TODO.md Tarea 2, generarReporteEvento).
vi.mock('../services/s3', () => ({ clienteS3: { send: clienteS3SendMock } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }));

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

const permisosPortero = {
  email: 'portero@letiende.co',
  nombre: 'Portero',
  rol: 'portero' as const,
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

/** `GET /api/eventos/:eventoId/reportes?formato=...` — ruta distinta de `/panel`. */
function crearPeticionReportes(eventoId: string, formato?: string): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method: 'GET' } },
    rawPath: `/api/eventos/${eventoId}/reportes`,
    pathParameters: { eventoId },
    queryStringParameters: formato !== undefined ? { formato } : undefined,
    headers: {},
  } as unknown as Parameters<typeof handler>[0];
}

async function invocarReportes(eventoId: string, formato?: string) {
  const respuesta = await handler(crearPeticionReportes(eventoId, formato), {} as never, undefined as never);
  return respuesta as { statusCode: number; body?: string };
}

beforeEach(() => {
  sendMock.mockReset();
  exigirRolMock.mockReset();
  clienteS3SendMock.mockReset();
  getSignedUrlMock.mockReset();
  getSignedUrlMock.mockResolvedValue('https://s3.amazonaws.com/reportes-presignada');
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

  // TODO.md Tarea 1 (T8): este endpoint pasó de exigirRol('productor') a
  // exigirRol('portero') para que SeleccionVentaEfectivoComponent/
  // SeleccionPuertaComponent lo reutilicen — un portero solo ve los eventos
  // donde está en `porteros`, nunca por `productores`.
  it('un portero solo ve los eventos donde está en porteros', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosPortero });
    sendMock.mockResolvedValueOnce({
      Items: [
        { ...eventoItem, porteros: ['portero@letiende.co'] },
        { ...eventoItem, eventoId: 'evt-ajeno', slug: 'otro-evento', porteros: ['otro@letiende.co'] },
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

  it('un portero nunca se resuelve contra productores (regresión)', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosPortero });
    sendMock.mockResolvedValueOnce({
      // El correo del portero está en `productores`, no en `porteros` —
      // no debería alcanzar este evento.
      Items: [{ ...eventoItem, productores: ['portero@letiende.co'], porteros: [] }],
    });

    const respuesta = await invocar('GET');

    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toEqual([]);
  });

  // roadmap #25 — un evento con boletería externa no tiene aforo/etapas que
  // gestionar, así que se excluye del selector compartido por panel, venta
  // en efectivo y validación en puerta (mismo endpoint, `CLAUDE.md`).
  it('excluye eventos con administradoPorLeTiende: false y conserva los demás', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosAdministrador });
    sendMock.mockResolvedValueOnce({
      Items: [
        { ...eventoItem, eventoId: 'evt-externo', slug: 'evento-externo', administradoPorLeTiende: false },
        { ...eventoItem, eventoId: 'evt-normal', slug: 'evento-normal' },
      ],
    });

    const respuesta = await invocar('GET');

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '[]');
    expect(cuerpo).toEqual([
      {
        eventoId: 'evt-normal',
        slug: 'evento-normal',
        nombre: 'Concierto de jazz',
        fechaHora: '2026-09-01T00:00:00.000Z',
        estado: 'publicado',
      },
    ]);
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
      sillasReservadas: 5,
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
    // Simula un huérfano histórico o de datos legado (`normalizarEtapas()`
    // ya preserva el etapaId real en cada PUT desde TODO.md Tarea 2,
    // 11/08/2026, pero esta defensa se mantiene permanente). `porEtapa`
    // debe seguir mostrando esa plata, con un nombre de respaldo, y los
    // totales nunca deben perderla.
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

  // v2, roadmap #24 — una compra sin etapaId (evento sin etapas, boletería
  // sin cobro) se agrupa aparte, con una etiqueta distinta de "Etapa
  // eliminada" (que implica una etapa que sí existió).
  it('agrupa las compras sin etapaId bajo una etiqueta "Sin etapa", distinta de una etapa eliminada', async () => {
    const compraSinEtapa = {
      ...comprasAprobadas[0],
      compraId: 'c-sin-etapa',
      etapaId: undefined,
      montoTotal: 0,
    };
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock
      .mockResolvedValueOnce({ Item: eventoItem })
      .mockResolvedValueOnce({ Items: boletasMixtas })
      .mockResolvedValueOnce({ Items: [...comprasAprobadas, compraSinEtapa] });

    const respuesta = await invocar('GET', { eventoId: 'evt-1' });

    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    expect(cuerpo.porEtapa).toContainEqual({
      etapaId: undefined,
      nombre: 'Sin etapa (boletería sin cobro)',
      vendidas: 2,
      recaudado: 0,
    });
    // Sigue sumando al total, igual que cualquier otra compra aprobada.
    expect(cuerpo.totalVendidas).toBe(5);
  });
});

describe('GET /api/eventos/:eventoId/reportes', () => {
  // A diferencia de `boletasMixtas` (solo boletaId/estado, suficiente para
  // el panel de métricas), el reporte necesita compraId/etapaId/
  // valorUnitario/ingresoEn — mismos campos reales que emite
  // `services/boleteria.ts` (`emitirBoletas`).
  const boletasParaReporte = [
    {
      boletaId: 'b1',
      compraId: 'c1',
      etapaId: 'et-1',
      valorUnitario: 45000,
      estado: 'usada',
      ingresoEn: '2026-09-01T01:30:00.000Z',
    },
    {
      boletaId: 'b2',
      compraId: 'c1',
      etapaId: 'et-1',
      valorUnitario: 45000,
      estado: 'valida',
    },
    {
      boletaId: 'b3',
      compraId: 'c2',
      etapaId: 'et-2',
      valorUnitario: 60000,
      estado: 'valida',
    },
  ];

  it('responde con la respuesta de exigirRol si no está autorizado', async () => {
    exigirRolMock.mockResolvedValueOnce({
      autorizado: false,
      respuesta: { statusCode: 403, body: '{"mensaje":"No autorizado en Ágora"}' },
    });

    const respuesta = await invocarReportes('evt-1', 'xlsx');

    expect(respuesta.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 400 si formato no es xlsx ni pdf', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });

    const respuesta = await invocarReportes('evt-1', 'csv');

    expect(respuesta.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('responde 400 si formato no viene en la query', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });

    const respuesta = await invocarReportes('evt-1');

    expect(respuesta.statusCode).toBe(400);
  });

  it('responde 501 explícito para formato=pdf, sin tocar DynamoDB ni S3', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });

    const respuesta = await invocarReportes('evt-1', 'pdf');

    expect(respuesta.statusCode).toBe(501);
    expect(sendMock).not.toHaveBeenCalled();
    expect(clienteS3SendMock).not.toHaveBeenCalled();
  });

  it('responde 404 si el evento no existe', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({});

    const respuesta = await invocarReportes('evt-inexistente', 'xlsx');

    expect(respuesta.statusCode).toBe(404);
  });

  it('responde 403 si el productor no está asignado a este evento', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock.mockResolvedValueOnce({ Item: { ...eventoItem, productores: ['otro@letiende.co'] } });

    const respuesta = await invocarReportes('evt-1', 'xlsx');

    expect(respuesta.statusCode).toBe(403);
    // Nunca consulta boletas/compras ni sube nada a S3 si el acceso al
    // evento ya fue denegado.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(clienteS3SendMock).not.toHaveBeenCalled();
  });

  it('sube el .xlsx a reportes/{eventoId}/ y responde la URL prefirmada, sin exponer el archivo en el cuerpo', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock
      .mockResolvedValueOnce({ Item: eventoItem })
      .mockResolvedValueOnce({ Items: boletasParaReporte })
      .mockResolvedValueOnce({ Items: comprasAprobadas });
    clienteS3SendMock.mockResolvedValueOnce({});

    const respuesta = await invocarReportes('evt-1', 'xlsx');

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body ?? '{}');
    // Nunca el archivo en el cuerpo de la respuesta — solo la URL
    // prefirmada (`CLAUDE.md` §5, A02).
    expect(cuerpo).toEqual({ url: 'https://s3.amazonaws.com/reportes-presignada' });

    expect(clienteS3SendMock).toHaveBeenCalledTimes(1);
    const comandoSubida = clienteS3SendMock.mock.calls[0]?.[0];
    expect(comandoSubida.input.Key).toMatch(/^reportes\/evt-1\/[0-9a-f-]{36}\.xlsx$/);
    expect(comandoSubida.input.ContentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(Buffer.isBuffer(comandoSubida.input.Body)).toBe(true);

    // getSignedUrl firma sobre la misma key recién subida, con vida corta,
    // y fuerza un nombre de archivo legible (`reporte-{slug}.xlsx`) en vez
    // del UUID interno de la key (defecto 1 de la revisión de arquitectura).
    const [, comandoDescarga, opciones] = getSignedUrlMock.mock.calls[0] as [
      unknown,
      { input: { Key: string; ResponseContentDisposition?: string } },
      { expiresIn: number },
    ];
    expect(comandoDescarga.input.Key).toBe(comandoSubida.input.Key);
    expect(comandoDescarga.input.ResponseContentDisposition).toBe(
      'attachment; filename="reporte-concierto-jazz.xlsx"',
    );
    expect(opciones.expiresIn).toBe(900);
  });

  it('emite una fila con "N/D" en las columnas de la compra si la boleta no tiene compra aprobada correspondiente, sin descartarla', async () => {
    // Defecto 2 de la revisión de arquitectura: antes esta boleta huérfana
    // se descartaba en silencio (`return []`), dejando el total de filas
    // del .xlsx por debajo de `totalBoletas` sin ninguna señal de por qué.
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });
    sendMock
      .mockResolvedValueOnce({ Item: eventoItem })
      .mockResolvedValueOnce({
        Items: [
          ...boletasParaReporte,
          { boletaId: 'b-huerfana', compraId: 'c-inexistente', etapaId: 'et-1', valorUnitario: 45000, estado: 'valida' },
        ],
      })
      .mockResolvedValueOnce({ Items: comprasAprobadas });
    clienteS3SendMock.mockResolvedValueOnce({});

    const respuesta = await invocarReportes('evt-1', 'xlsx');

    expect(respuesta.statusCode).toBe(200);
    const comandoSubida = clienteS3SendMock.mock.calls[0]?.[0] as { input: { Body: Buffer } };
    const libro = XLSX.read(comandoSubida.input.Body, { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json(libro.Sheets['Boletas']!) as Record<string, unknown>[];

    // El número de filas siempre coincide con el número real de boletas del
    // evento (4 = 3 normales + 1 huérfana) — nunca desaparece una fila.
    expect(filas).toHaveLength(4);
    const filaHuerfana = filas.find((fila) => fila['Cliente'] === 'N/D');
    expect(filaHuerfana).toMatchObject({
      Cliente: 'N/D',
      Teléfono: 'N/D',
      Correo: 'N/D',
      'Fecha y hora de compra': 'N/D',
      'Medio de pago': 'N/D',
      Valor: 45000,
      'Etapa de boletería': 'Preventa',
    });
    // El ID (compraId) es la llave foránea real de la boleta hacia su
    // compra — nunca se descarta ni se reemplaza por 'N/D', ni siquiera
    // cuando la compra no existe.
    expect(filaHuerfana?.['ID']).toBe('c-inexistente');
  });
});

describe('método no soportado', () => {
  it('responde 405 para métodos distintos de GET', async () => {
    exigirRolMock.mockResolvedValueOnce({ autorizado: true, permisos: permisosProductor });

    const respuesta = await invocar('POST');

    expect(respuesta.statusCode).toBe(405);
  });
});
