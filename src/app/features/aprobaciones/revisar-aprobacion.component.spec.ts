import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AprobacionesService, DetalleAprobacion } from '../../core/api/aprobaciones.service';
import { RevisarAprobacionComponent } from './revisar-aprobacion.component';

const detalleEjemplo: DetalleAprobacion = {
  compraId: 'c1',
  cantidad: 2,
  montoTotal: 90000,
  cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' },
  urlComprobante: 'https://s3.amazonaws.com/comprobante.png',
};

function configurarPrueba(opciones: {
  obtenerDetalleMock?: ReturnType<typeof vi.fn>;
  aprobarMock?: ReturnType<typeof vi.fn>;
  rechazarMock?: ReturnType<typeof vi.fn>;
}) {
  const obtenerDetalleMock =
    opciones.obtenerDetalleMock ??
    vi.fn().mockResolvedValue({ exito: true, detalle: detalleEjemplo });

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      {
        provide: AprobacionesService,
        useValue: {
          obtenerDetalle: obtenerDetalleMock,
          aprobar: opciones.aprobarMock ?? vi.fn(),
          rechazar: opciones.rechazarMock ?? vi.fn(),
        },
      },
    ],
  });

  const fixture: ComponentFixture<RevisarAprobacionComponent> =
    TestBed.createComponent(RevisarAprobacionComponent);
  return { fixture, obtenerDetalleMock };
}

async function activarConToken(fixture: ComponentFixture<RevisarAprobacionComponent>, token: string) {
  fixture.componentRef.setInput('token', token);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('RevisarAprobacionComponent', () => {
  it('carga el detalle por token y lo muestra (cliente, cantidad, total, comprobante)', async () => {
    const { fixture, obtenerDetalleMock } = configurarPrueba({});

    await activarConToken(fixture, 'token-x');

    expect(obtenerDetalleMock).toHaveBeenCalledWith('token-x');
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('90.000');
    expect(fixture.nativeElement.querySelector('a[href="https://s3.amazonaws.com/comprobante.png"]')).not.toBeNull();
  });

  it('muestra el error del backend si el token ya fue resuelto o expiró', async () => {
    const obtenerDetalleMock = vi
      .fn()
      .mockResolvedValue({ exito: false, error: 'Esta compra ya fue resuelta por otro miembro del equipo.' });
    const { fixture } = configurarPrueba({ obtenerDetalleMock });

    await activarConToken(fixture, 'token-x');

    expect(fixture.nativeElement.textContent).toContain('ya fue resuelta');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('aprobar() llama al servicio y muestra la confirmación', async () => {
    const aprobarMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture } = configurarPrueba({ aprobarMock });
    await activarConToken(fixture, 'token-x');

    await fixture.componentInstance['aprobar']();
    fixture.detectChanges();

    expect(aprobarMock).toHaveBeenCalledWith('token-x');
    expect(fixture.nativeElement.textContent).toContain('Compra aprobada');
  });

  it('aprobar() muestra el error si el backend rechaza la acción (ej. ya resuelta)', async () => {
    const aprobarMock = vi.fn().mockResolvedValue({ exito: false, error: 'Ya fue resuelta.' });
    const { fixture } = configurarPrueba({ aprobarMock });
    await activarConToken(fixture, 'token-x');

    await fixture.componentInstance['aprobar']();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ya fue resuelta.');
    expect(fixture.componentInstance['resolucion']()).toBeNull();
  });

  it('rechazar() envía el motivo escrito y muestra la confirmación', async () => {
    const rechazarMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture } = configurarPrueba({ rechazarMock });
    await activarConToken(fixture, 'token-x');
    fixture.componentInstance['formularioRechazo'].controls.motivo.setValue('No corresponde el monto');

    await fixture.componentInstance['rechazar']();
    fixture.detectChanges();

    expect(rechazarMock).toHaveBeenCalledWith('token-x', 'No corresponde el monto');
    expect(fixture.nativeElement.textContent).toContain('Compra rechazada');
  });

  it('rechazar() sin motivo escrito envía undefined', async () => {
    const rechazarMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture } = configurarPrueba({ rechazarMock });
    await activarConToken(fixture, 'token-x');

    await fixture.componentInstance['rechazar']();

    expect(rechazarMock).toHaveBeenCalledWith('token-x', undefined);
  });

  it('regresión: un doble click real (dos invocaciones sin esperar la primera) solo dispara una petición al servicio (hotfix pre-producción, 14/08/2026)', async () => {
    // Promesa controlada a mano para simular una petición en curso — el
    // segundo click debe llegar mientras la primera todavía no resolvió,
    // que es exactamente la ventana de carrera real reportada en staging
    // (dos invocaciones de Lambda a menos de 1 segundo de diferencia).
    let resolverPrimera!: (valor: { exito: true }) => void;
    const rechazarMock = vi.fn().mockReturnValueOnce(
      new Promise<{ exito: true }>((resolve) => {
        resolverPrimera = resolve;
      }),
    );
    const { fixture } = configurarPrueba({ rechazarMock });
    await activarConToken(fixture, 'token-x');
    fixture.componentInstance['formularioRechazo'].controls.motivo.setValue('No corresponde el monto');

    const primeraLlamada = fixture.componentInstance['rechazar']();
    const segundaLlamada = fixture.componentInstance['rechazar'](); // "doble click" antes de que la primera resuelva
    resolverPrimera({ exito: true });
    await Promise.all([primeraLlamada, segundaLlamada]);
    fixture.detectChanges();

    expect(rechazarMock).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Compra rechazada');
  });
});
