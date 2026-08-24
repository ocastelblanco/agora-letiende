import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import { ResultadoValidacion, ValidacionPuertaService } from '../../core/api/validacion-puerta.service';
import type { EventoPublico } from '../../core/models/evento.model';

const { decodeFromVideoDeviceMock, releaseAllStreamsMock, stopMock } = vi.hoisted(() => ({
  decodeFromVideoDeviceMock: vi.fn(),
  releaseAllStreamsMock: vi.fn(),
  stopMock: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: vi.fn().mockImplementation(function (
    this: { decodeFromVideoDevice: typeof decodeFromVideoDeviceMock },
  ) {
    this.decodeFromVideoDevice = decodeFromVideoDeviceMock;
  }),
  BrowserCodeReader: { releaseAllStreams: releaseAllStreamsMock },
}));

const { PuertaComponent } = await import('./puerta.component');

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: {
  cargarEventoPorSlugMock?: ReturnType<typeof vi.fn>;
  validarBoletaMock?: ReturnType<typeof vi.fn>;
}) {
  const cargarEventoPorSlugMock =
    opciones.cargarEventoPorSlugMock ?? vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
  const validarBoletaMock = opciones.validarBoletaMock ?? vi.fn();

  TestBed.configureTestingModule({
    providers: [
      { provide: EventosPublicosService, useValue: { cargarEventoPorSlug: cargarEventoPorSlugMock } },
      { provide: ValidacionPuertaService, useValue: { validarBoleta: validarBoletaMock } },
    ],
  });

  const fixture: ComponentFixture<InstanceType<typeof PuertaComponent>> =
    TestBed.createComponent(PuertaComponent);
  return { fixture, cargarEventoPorSlugMock, validarBoletaMock };
}

async function activarConSlug(fixture: ComponentFixture<InstanceType<typeof PuertaComponent>>, slug: string) {
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PuertaComponent', () => {
  beforeEach(() => {
    decodeFromVideoDeviceMock.mockReset();
    releaseAllStreamsMock.mockReset();
    stopMock.mockReset();
    decodeFromVideoDeviceMock.mockResolvedValue({ stop: stopMock });
  });

  it('carga el evento por slug y muestra el botón de escanear', async () => {
    const { fixture, cargarEventoPorSlugMock } = configurarPrueba({});

    await activarConSlug(fixture, 'concierto-jazz');

    expect(cargarEventoPorSlugMock).toHaveBeenCalledWith('concierto-jazz');
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
    expect(fixture.nativeElement.textContent).toContain('Escanear');
  });

  it('muestra "No se encontró el evento" si el slug no resuelve', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: false, error: 'no_encontrado' });
    const { fixture } = configurarPrueba({ cargarEventoPorSlugMock });

    await activarConSlug(fixture, 'inexistente');

    expect(fixture.nativeElement.textContent).toContain('No se encontró el evento');
  });

  it('el clic en "Escanear" activa la cámara vía decodeFromVideoDevice, no automáticamente', async () => {
    const { fixture } = configurarPrueba({});
    await activarConSlug(fixture, 'concierto-jazz');

    expect(decodeFromVideoDeviceMock).not.toHaveBeenCalled();

    const video = document.createElement('video');
    await fixture.componentInstance['escanear'](video);

    expect(decodeFromVideoDeviceMock).toHaveBeenCalledTimes(1);
    expect(decodeFromVideoDeviceMock.mock.calls[0]?.[1]).toBe(video);
  });

  it('al detectar un QR válido, valida contra la API con el eventoId del evento cargado y muestra el veredicto VALIDA', async () => {
    const validarBoletaMock = vi
      .fn()
      .mockResolvedValue({ veredicto: 'VALIDA', boletaId: 'bol-1', numeroEnCompra: 2 } satisfies ResultadoValidacion);
    let callbackCapturado: ((resultado: { getText: () => string }) => void) | undefined;
    decodeFromVideoDeviceMock.mockImplementation(async (_deviceId, _video, callback) => {
      callbackCapturado = callback;
      return { stop: stopMock };
    });
    const { fixture } = configurarPrueba({ validarBoletaMock });
    await activarConSlug(fixture, 'concierto-jazz');

    await fixture.componentInstance['escanear'](document.createElement('video'));
    callbackCapturado?.({ getText: () => 'https://agora.letiende.co/boleta/bol-1.firma123' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(validarBoletaMock).toHaveBeenCalledWith('bol-1.firma123', 'e1');
    expect(stopMock).toHaveBeenCalledTimes(1);
    expect(releaseAllStreamsMock).toHaveBeenCalled();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Válida');
    expect(texto).toContain('Boleta #2');
    const overlay = fixture.nativeElement.querySelector('.bg-tertiary');
    expect(overlay).not.toBeNull();
  });

  it('muestra el veredicto YA_USADA con la hora del primer ingreso, en rojo', async () => {
    const validarBoletaMock = vi.fn().mockResolvedValue({
      veredicto: 'YA_USADA',
      ingresoEn: '2026-08-09T20:00:00.000Z',
    } satisfies ResultadoValidacion);
    let callbackCapturado: ((resultado: { getText: () => string }) => void) | undefined;
    decodeFromVideoDeviceMock.mockImplementation(async (_deviceId, _video, callback) => {
      callbackCapturado = callback;
      return { stop: stopMock };
    });
    const { fixture } = configurarPrueba({ validarBoletaMock });
    await activarConSlug(fixture, 'concierto-jazz');

    await fixture.componentInstance['escanear'](document.createElement('video'));
    callbackCapturado?.({ getText: () => 'https://agora.letiende.co/boleta/bol-1.firma123' });
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('No válida');
    expect(texto).toContain('ya ingresó');
    expect(texto).toContain('2026-08-09T20:00:00.000Z');
    expect(fixture.nativeElement.querySelector('.bg-danger')).not.toBeNull();
  });

  it('muestra error de red si la validación falla (validarBoleta devuelve null)', async () => {
    const validarBoletaMock = vi.fn().mockResolvedValue(null);
    let callbackCapturado: ((resultado: { getText: () => string }) => void) | undefined;
    decodeFromVideoDeviceMock.mockImplementation(async (_deviceId, _video, callback) => {
      callbackCapturado = callback;
      return { stop: stopMock };
    });
    const { fixture } = configurarPrueba({ validarBoletaMock });
    await activarConSlug(fixture, 'concierto-jazz');

    await fixture.componentInstance['escanear'](document.createElement('video'));
    callbackCapturado?.({ getText: () => 'https://agora.letiende.co/boleta/bol-1.firma123' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Error de red');
  });

  it('detiene el escaneo y libera la cámara al destruir el componente', async () => {
    const { fixture } = configurarPrueba({});
    await activarConSlug(fixture, 'concierto-jazz');
    await fixture.componentInstance['escanear'](document.createElement('video'));

    fixture.destroy();

    expect(stopMock).toHaveBeenCalled();
    expect(releaseAllStreamsMock).toHaveBeenCalled();
  });
});
