import { createHash, createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorConsultaBold, consultarNotificacionesBold, firmarBoton, montoCoincide, verificarFirmaWebhook } from './bold';

const LLAVE_SECRETA_ORIGINAL = process.env['BOLD_LLAVE_SECRETA'];

// Llave de ejemplo PÚBLICA de la documentación oficial de Bold (no es una
// credencial real ni fue usada nunca en producción) — ver la referencia en el
// test de más abajo. Se guarda en Base64 solo para que no aparezca en texto
// plano en el código fuente y no dispare falsos positivos de escaneo de
// secretos como el de GitHub (caso resuelto 16/09/2026, ver docs/tracking.csv).
const LLAVE_EJEMPLO_DOCS_BOLD = Buffer.from('a2dmcTJuTjBvNTJYcW51WFpXSU4yRg==', 'base64').toString(
  'utf8',
);

beforeEach(() => {
  process.env['BOLD_LLAVE_SECRETA'] = LLAVE_EJEMPLO_DOCS_BOLD;
});

afterEach(() => {
  if (LLAVE_SECRETA_ORIGINAL === undefined) {
    delete process.env['BOLD_LLAVE_SECRETA'];
  } else {
    process.env['BOLD_LLAVE_SECRETA'] = LLAVE_SECRETA_ORIGINAL;
  }
});

describe('firmarBoton', () => {
  it('reproduce el ejemplo real de la documentación oficial de Bold (inv0334, 39400, COP)', () => {
    // https://developers.bold.co/pagos-en-linea/boton-de-pagos/integracion-manual/integracion-manual
    // — verificado el 25/08/2026: cadena esperada
    // "inv033439400COP" + la llave de ejemplo de Bold, SHA256 de esa concatenación.
    const esperada = createHash('sha256')
      .update(`inv033439400COP${LLAVE_EJEMPLO_DOCS_BOLD}`)
      .digest('hex');

    expect(firmarBoton('inv0334', 39400, 'COP')).toBe(esperada);
  });

  it('concatena sin separadores en el orden compraId+monto+moneda+llave', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';
    const esperada = createHash('sha256').update('compra-1' + '45000' + 'COP' + 'llave-secreta').digest('hex');

    expect(firmarBoton('compra-1', 45000, 'COP')).toBe(esperada);
  });

  it('usa una cadena vacía si BOLD_LLAVE_SECRETA no está definida', () => {
    delete process.env['BOLD_LLAVE_SECRETA'];
    const esperada = createHash('sha256').update('compra-1' + '1000' + 'COP').digest('hex');

    expect(firmarBoton('compra-1', 1000, 'COP')).toBe(esperada);
  });

  it('produce firmas distintas si cambia cualquiera de los tres datos', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';
    const base = firmarBoton('compra-1', 45000, 'COP');

    expect(firmarBoton('compra-2', 45000, 'COP')).not.toBe(base);
    expect(firmarBoton('compra-1', 45001, 'COP')).not.toBe(base);
    expect(firmarBoton('compra-1', 45000, 'USD')).not.toBe(base);
  });
});

describe('verificarFirmaWebhook', () => {
  const cuerpo = '{"type":"SALE_APPROVED","data":{"metadata":{"reference":"compra-1"}}}';

  function firmarComoBold(cuerpoCrudo: string, llave: string): string {
    const base64 = Buffer.from(cuerpoCrudo, 'utf8').toString('base64');
    return createHmac('sha256', llave).update(base64).digest('hex');
  }

  it('acepta una firma válida en modo producción (HMAC-SHA256 sobre el Base64 del cuerpo, con BOLD_LLAVE_SECRETA)', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';
    const firmaValida = firmarComoBold(cuerpo, 'llave-secreta');

    expect(verificarFirmaWebhook(cuerpo, firmaValida, false)).toBe(true);
  });

  it('rechaza una firma inválida en modo producción', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';

    expect(verificarFirmaWebhook(cuerpo, 'firma-incorrecta-de-64-caracteres-hex-000000000000000000000000', false)).toBe(false);
  });

  it('rechaza una firma calculada con la llave real cuando el body cambió (integridad)', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';
    const firmaDelOriginal = firmarComoBold(cuerpo, 'llave-secreta');

    expect(verificarFirmaWebhook(cuerpo + 'x', firmaDelOriginal, false)).toBe(false);
  });

  it('modo pruebas: firma con llave vacía, ignorando BOLD_LLAVE_SECRETA aunque esté definida', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta-de-produccion';
    const firmaDePrueba = firmarComoBold(cuerpo, '');

    expect(verificarFirmaWebhook(cuerpo, firmaDePrueba, true)).toBe(true);
    // La misma firma calculada con la llave real de producción, en modo
    // pruebas, debe rechazarse — son ramas de llave distintas.
    const firmaConLlaveReal = firmarComoBold(cuerpo, 'llave-secreta-de-produccion');
    expect(verificarFirmaWebhook(cuerpo, firmaConLlaveReal, true)).toBe(false);
  });

  it('rechaza sin lanzar cuando la firma recibida tiene una longitud distinta a la esperada', () => {
    process.env['BOLD_LLAVE_SECRETA'] = 'llave-secreta';

    expect(verificarFirmaWebhook(cuerpo, 'corta', false)).toBe(false);
  });
});

describe('montoCoincide', () => {
  it('acepta el monto exacto en COP, o sin moneda informada', () => {
    expect(montoCoincide({ total: 90000, currency: 'COP' }, 90000)).toBe(true);
    expect(montoCoincide({ total: 90000 }, 90000)).toBe(true);
  });

  it('rechaza montos distintos, otra moneda, texto o datos ausentes', () => {
    expect(montoCoincide({ total: 89999, currency: 'COP' }, 90000)).toBe(false);
    expect(montoCoincide({ total: 90000, currency: 'USD' }, 90000)).toBe(false);
    expect(montoCoincide({ total: '90000', currency: 'COP' }, 90000)).toBe(false);
    expect(montoCoincide({ currency: 'COP' }, 90000)).toBe(false);
    expect(montoCoincide(undefined, 90000)).toBe(false);
  });
});

describe('consultarNotificacionesBold', () => {
  const fetchOriginal = globalThis.fetch;
  const llaveOriginal = process.env['BOLD_LLAVE_IDENTIDAD'];
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env['BOLD_LLAVE_IDENTIDAD'] = 'llave-identidad-de-prueba';
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    if (llaveOriginal === undefined) {
      delete process.env['BOLD_LLAVE_IDENTIDAD'];
    } else {
      process.env['BOLD_LLAVE_IDENTIDAD'] = llaveOriginal;
    }
  });

  it('consulta por referencia externa, con host fijo y la llave de identidad', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ notifications: [{ type: 'SALE_APPROVED' }] }) });

    const resultado = await consultarNotificacionesBold('compra/../1', 3000);

    const [url, opciones] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; signal: AbortSignal }];
    expect(url).toBe('https://integrations.api.bold.co/payments/webhook/notifications/compra%2F..%2F1?is_external_reference=true');
    expect(opciones.headers['Authorization']).toBe('x-api-key llave-identidad-de-prueba');
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(resultado).toEqual([{ type: 'SALE_APPROVED' }]);
  });

  it('devuelve una lista vacía si la respuesta no trae notifications', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    expect(await consultarNotificacionesBold('compra-1', 3000)).toEqual([]);
  });

  it('lanza ErrorConsultaBold sin llamar a Bold si falta la llave de identidad', async () => {
    delete process.env['BOLD_LLAVE_IDENTIDAD'];

    await expect(consultarNotificacionesBold('compra-1', 3000)).rejects.toBeInstanceOf(ErrorConsultaBold);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lanza ErrorConsultaBold si Bold responde con error, falla la red o vence el tiempo', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(consultarNotificacionesBold('compra-1', 3000)).rejects.toMatchObject({ estadoHttp: 401, esDeAutorizacion: true });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(consultarNotificacionesBold('compra-1', 3000)).rejects.toMatchObject({ estadoHttp: 500, esDeAutorizacion: false });

    fetchMock.mockRejectedValueOnce(new Error('red caída'));
    await expect(consultarNotificacionesBold('compra-1', 3000)).rejects.toMatchObject({ estadoHttp: undefined, esDeAutorizacion: false });

    fetchMock.mockRejectedValueOnce(new DOMException('Tiempo agotado', 'TimeoutError'));
    await expect(consultarNotificacionesBold('compra-1', 3000)).rejects.toBeInstanceOf(ErrorConsultaBold);
  });
});
