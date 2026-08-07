import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { EventosService } from '../../../core/api/eventos.service';
import type { Evento } from '../../../core/models/evento.model';
import { GestionEventosComponent } from './gestion-eventos.component';

const eventoEjemplo: Evento = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  productores: [],
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: {
  eventos?: Evento[];
  error?: boolean;
  eliminarEventoMock?: ReturnType<typeof vi.fn>;
  dialogAfterClosed?: unknown;
}) {
  const cargarEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      {
        provide: EventosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => opciones.error ?? false,
          cargarEventos: cargarEventosMock,
          eliminarEvento: opciones.eliminarEventoMock ?? vi.fn(),
        },
      },
    ],
  });

  // Mismo motivo que en gestion-usuarios.component.spec.ts: interceptar el
  // método sobre la instancia real, no sobrescribir el provider (MEMORY.md §7).
  const dialogOpenMock = vi
    .spyOn(TestBed.inject(MatDialog), 'open')
    .mockReturnValue({ afterClosed: () => of(opciones.dialogAfterClosed) } as never);
  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<GestionEventosComponent> =
    TestBed.createComponent(GestionEventosComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock, dialogOpenMock, snackBarOpenMock };
}

describe('GestionEventosComponent', () => {
  it('carga los eventos al iniciar', () => {
    const { cargarEventosMock } = configurarPrueba({});

    expect(cargarEventosMock).toHaveBeenCalledTimes(1);
  });

  it('fechaLegible convierte el UTC ISO almacenado a hora de pared de Bogotá', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
    const componente = fixture.componentInstance;

    expect(componente['fechaLegible'](eventoEjemplo.fechaHora)).toBe('2026-09-14 20:00');
  });

  it('expone el listado y el error tal como los entrega el servicio', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
    const componente = fixture.componentInstance;

    expect(componente['eventos']()).toEqual([eventoEjemplo]);
    expect(componente['errorCarga']()).toBe(false);
  });

  describe('eliminar', () => {
    it('no llama a la API si el diálogo de confirmación se cancela', async () => {
      const eliminarEventoMock = vi.fn();
      const { fixture, dialogOpenMock } = configurarPrueba({
        eventos: [eventoEjemplo],
        eliminarEventoMock,
        dialogAfterClosed: undefined,
      });
      const componente = fixture.componentInstance;

      await componente['eliminar'](eventoEjemplo);

      expect(dialogOpenMock).toHaveBeenCalledTimes(1);
      expect(eliminarEventoMock).not.toHaveBeenCalled();
    });

    it('llama a la API cuando el diálogo se confirma', async () => {
      const eliminarEventoMock = vi.fn().mockResolvedValue({ exito: true });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        eventos: [eventoEjemplo],
        eliminarEventoMock,
        dialogAfterClosed: true,
      });
      const componente = fixture.componentInstance;

      await componente['eliminar'](eventoEjemplo);

      expect(eliminarEventoMock).toHaveBeenCalledWith('e1');
      expect(snackBarOpenMock).toHaveBeenCalledWith('Evento eliminado correctamente.', 'Cerrar', {
        duration: 4000,
      });
    });

    it('muestra el mensaje de error del backend cuando la eliminación falla', async () => {
      const eliminarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: false, error: 'No existe un evento con ese eventoId' });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        eventos: [eventoEjemplo],
        eliminarEventoMock,
        dialogAfterClosed: true,
      });
      const componente = fixture.componentInstance;

      await componente['eliminar'](eventoEjemplo);

      expect(snackBarOpenMock).toHaveBeenCalledWith(
        'No existe un evento con ese eventoId',
        'Cerrar',
        { duration: 6000 },
      );
    });
  });
});
