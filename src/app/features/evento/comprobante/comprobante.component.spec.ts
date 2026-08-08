import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ComprobantesService } from '../../../core/api/comprobantes.service';
import { ComprobanteComponent } from './comprobante.component';

function configurarPrueba(opciones: { subirComprobanteMock?: ReturnType<typeof vi.fn> } = {}) {
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      { provide: ComprobantesService, useValue: { subirComprobante: opciones.subirComprobanteMock ?? vi.fn() } },
    ],
  });

  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<ComprobanteComponent> = TestBed.createComponent(ComprobanteComponent);
  return { fixture, snackBarOpenMock };
}

function activarConToken(fixture: ComponentFixture<ComprobanteComponent>, token: string) {
  fixture.componentRef.setInput('token', token);
  fixture.detectChanges();
}

function archivoDePrueba(tipo = 'image/png'): File {
  return new File(['contenido'], 'comprobante.png', { type: tipo });
}

function simularSeleccionDeArchivo(componente: ComprobanteComponent, archivo: File): void {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [archivo] });
  componente['seleccionarArchivo']({ target: input } as unknown as Event);
}

describe('ComprobanteComponent', () => {
  it('no permite confirmar sin haber seleccionado un archivo', async () => {
    const subirComprobanteMock = vi.fn();
    const { fixture } = configurarPrueba({ subirComprobanteMock });
    activarConToken(fixture, 'token-abc');

    await fixture.componentInstance['subir']();

    expect(subirComprobanteMock).not.toHaveBeenCalled();
  });

  it('rechaza un tipo de archivo no permitido antes de intentar subirlo', () => {
    const subirComprobanteMock = vi.fn();
    const { fixture, snackBarOpenMock } = configurarPrueba({ subirComprobanteMock });
    activarConToken(fixture, 'token-abc');

    simularSeleccionDeArchivo(fixture.componentInstance, archivoDePrueba('image/svg+xml'));

    expect(fixture.componentInstance['archivoSeleccionado']()).toBeNull();
    expect(snackBarOpenMock).toHaveBeenCalled();
  });

  it('acepta un PDF', () => {
    const { fixture } = configurarPrueba({});
    activarConToken(fixture, 'token-abc');

    simularSeleccionDeArchivo(fixture.componentInstance, archivoDePrueba('application/pdf'));

    expect(fixture.componentInstance['archivoSeleccionado']()?.type).toBe('application/pdf');
  });

  it('sube el comprobante con el token de la ruta y muestra la confirmación', async () => {
    const subirComprobanteMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture } = configurarPrueba({ subirComprobanteMock });
    activarConToken(fixture, 'token-abc');
    simularSeleccionDeArchivo(fixture.componentInstance, archivoDePrueba());

    await fixture.componentInstance['subir']();
    fixture.detectChanges();

    expect(subirComprobanteMock).toHaveBeenCalledWith('token-abc', expect.any(File));
    expect(fixture.componentInstance['subido']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Comprobante recibido');
  });

  it('muestra el error del backend en un snackbar y no marca como subido si falla (ej. enlace vencido)', async () => {
    const subirComprobanteMock = vi.fn().mockResolvedValue({
      exito: false,
      error: 'Este enlace ya venció y la reserva se canceló. Puedes volver a intentar la compra.',
    });
    const { fixture, snackBarOpenMock } = configurarPrueba({ subirComprobanteMock });
    activarConToken(fixture, 'token-abc');
    simularSeleccionDeArchivo(fixture.componentInstance, archivoDePrueba());

    await fixture.componentInstance['subir']();

    expect(snackBarOpenMock).toHaveBeenCalledWith(
      'Este enlace ya venció y la reserva se canceló. Puedes volver a intentar la compra.',
      'Cerrar',
      expect.objectContaining({ duration: expect.any(Number) }),
    );
    expect(fixture.componentInstance['subido']()).toBe(false);
  });
});
