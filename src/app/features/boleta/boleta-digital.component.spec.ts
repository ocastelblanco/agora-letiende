import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoletaDigital, BoletaDigitalService } from '../../core/api/boleta-digital.service';
import { BoletaDigitalComponent } from './boleta-digital.component';

const boletaEjemplo: BoletaDigital = {
  boletaId: 'bol-1',
  numeroEnCompra: 1,
  estado: 'valida',
  nombreEvento: 'Concierto de jazz',
  descripcionEvento: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  direccion: 'Bogotá, Colombia',
  etapaNombre: 'Preventa',
  nombreCliente: 'Ana Pérez',
  qrPng: 'aGVsbG8=',
};

function configurarPrueba(opciones: { obtenerBoletaMock?: ReturnType<typeof vi.fn> }) {
  const obtenerBoletaMock =
    opciones.obtenerBoletaMock ?? vi.fn().mockResolvedValue({ exito: true, boleta: boletaEjemplo });

  TestBed.configureTestingModule({
    providers: [{ provide: BoletaDigitalService, useValue: { obtenerBoleta: obtenerBoletaMock } }],
  });

  const fixture: ComponentFixture<BoletaDigitalComponent> = TestBed.createComponent(BoletaDigitalComponent);
  return { fixture, obtenerBoletaMock };
}

async function activarConCodigo(fixture: ComponentFixture<BoletaDigitalComponent>, codigo: string) {
  fixture.componentRef.setInput('codigo', codigo);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('BoletaDigitalComponent', () => {
  it('carga la boleta por código y muestra el QR y los datos del evento', async () => {
    const { fixture, obtenerBoletaMock } = configurarPrueba({});

    await activarConCodigo(fixture, 'bol-1.firma123');

    expect(obtenerBoletaMock).toHaveBeenCalledWith('bol-1.firma123');
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Concierto de jazz');
    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('Preventa');
    const img = fixture.nativeElement.querySelector('img[alt="Código QR de la boleta"]') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('muestra la fecha del evento convertida a hora de Bogotá', async () => {
    const { fixture } = configurarPrueba({});

    await activarConCodigo(fixture, 'bol-1.firma123');

    expect(fixture.nativeElement.textContent).toContain('2026-09-14 20:00');
  });

  it('muestra el error del backend si el código es inválido o inexistente', async () => {
    const obtenerBoletaMock = vi
      .fn()
      .mockResolvedValue({ exito: false, error: 'Boleta inválida o inexistente' });
    const { fixture } = configurarPrueba({ obtenerBoletaMock });

    await activarConCodigo(fixture, 'bol-x.firma-mala');

    expect(fixture.nativeElement.textContent).toContain('Boleta inválida o inexistente');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });

  it('no muestra el logotipo si el evento no tiene uno', async () => {
    const obtenerBoletaMock = vi
      .fn()
      .mockResolvedValue({ exito: true, boleta: { ...boletaEjemplo, logotipoUrl: undefined } });
    const { fixture } = configurarPrueba({ obtenerBoletaMock });

    await activarConCodigo(fixture, 'bol-1.firma123');

    // Solo el QR debe quedar como <img> — sin logotipo.
    const imagenes = fixture.nativeElement.querySelectorAll('img');
    expect(imagenes.length).toBe(1);
    expect(imagenes[0].getAttribute('alt')).toBe('Código QR de la boleta');
  });
});
