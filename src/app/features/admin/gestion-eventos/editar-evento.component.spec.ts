import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EventosService } from '../../../core/api/eventos.service';
import type { Evento } from '../../../core/models/evento.model';
import { EditarEventoComponent } from './editar-evento.component';

const eventoExistente: Evento = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  sillasDisponibles: 100,
  sillasReservadas: 0,
  etapas: [
    { etapaId: 'et1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 },
  ],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo', 'bold'],
  plazoComprobanteMinutos: 10,
  productores: ['productor@letiende.co'],
  estado: 'borrador',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: {
  id: string;
  eventos?: Evento[];
  crearEventoMock?: ReturnType<typeof vi.fn>;
  actualizarEventoMock?: ReturnType<typeof vi.fn>;
  subirActivoMock?: ReturnType<typeof vi.fn>;
}) {
  const cargarEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: opciones.id }) } },
      },
      {
        provide: EventosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => false,
          cargarEventos: cargarEventosMock,
          crearEvento: opciones.crearEventoMock ?? vi.fn(),
          actualizarEvento: opciones.actualizarEventoMock ?? vi.fn(),
          subirActivo: opciones.subirActivoMock ?? vi.fn(),
        },
      },
    ],
  });

  const navigateMock = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<EditarEventoComponent> =
    TestBed.createComponent(EditarEventoComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock, navigateMock, snackBarOpenMock };
}

describe('EditarEventoComponent', () => {
  describe('modo crear (id = "nuevo")', () => {
    it('no carga eventos existentes y no permite subir activos todavía', async () => {
      const { fixture, cargarEventosMock } = configurarPrueba({ id: 'nuevo' });
      const componente = fixture.componentInstance;
      await fixture.whenStable();

      expect(cargarEventosMock).not.toHaveBeenCalled();
      expect(componente['cargando']()).toBe(false);
      expect(componente['puedeSubirActivos']()).toBe(false);
    });

    it('guardar() no llama a la API si el formulario es inválido', async () => {
      const crearEventoMock = vi.fn();
      const { fixture } = configurarPrueba({ id: 'nuevo', crearEventoMock });
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({ nombre: '', slug: '' });
      await componente['guardar']();

      expect(crearEventoMock).not.toHaveBeenCalled();
    });

    it('guardar() crea el evento y navega a la ruta de edición cuando la API responde éxito', async () => {
      const crearEventoMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture, navigateMock, snackBarOpenMock } = configurarPrueba({
        id: 'nuevo',
        crearEventoMock,
      });
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({
        slug: 'concierto-jazz',
        nombre: 'Concierto de jazz',
        descripcion: 'Una noche de jazz',
        fechaHora: '2026-09-14T20:00',
        sillasTotales: 100,
      });
      componente['etapas'].at(0).patchValue({
        nombre: 'Preventa',
        precio: 45000,
        cierraEn: '2026-08-31T19:00',
      });

      await componente['guardar']();

      expect(crearEventoMock).toHaveBeenCalledTimes(1);
      const datosEnviados = crearEventoMock.mock.calls[0][0];
      expect(datosEnviados.fechaHora).toBe('2026-09-15T01:00:00.000Z');
      expect(datosEnviados.etapas[0]).toMatchObject({ nombre: 'Preventa', precio: 45000, orden: 1 });
      expect(datosEnviados.mediosPago).toEqual(['efectivo']);
      expect(navigateMock).toHaveBeenCalledWith(['/admin/eventos', 'e1']);
      expect(snackBarOpenMock).toHaveBeenCalledWith('Evento creado correctamente.', 'Cerrar', {
        duration: 4000,
      });
    });
  });

  describe('modo editar (id = eventoId real)', () => {
    it('precarga el formulario y deshabilita slug y sillasTotales', async () => {
      const { fixture } = configurarPrueba({ id: 'e1', eventos: [eventoExistente] });
      await fixture.whenStable();
      const componente = fixture.componentInstance;

      expect(componente['cargando']()).toBe(false);
      expect(componente['eventoNoEncontrado']()).toBe(false);
      expect(componente['formulario'].controls.slug.disabled).toBe(true);
      expect(componente['formulario'].controls.sillasTotales.disabled).toBe(true);
      expect(componente['formulario'].controls.nombre.value).toBe('Concierto de jazz');
      expect(componente['formulario'].controls.mediosPago.controls.bold.value).toBe(true);
      expect(componente['etapas'].length).toBe(1);
    });

    it('marca eventoNoEncontrado cuando el eventoId no está en el listado', async () => {
      const { fixture } = configurarPrueba({ id: 'inexistente', eventos: [eventoExistente] });
      await fixture.whenStable();
      const componente = fixture.componentInstance;

      expect(componente['eventoNoEncontrado']()).toBe(true);
    });

    it('guardar() actualiza el evento sin incluir sillasTotales ni sillasDisponibles', async () => {
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        id: 'e1',
        eventos: [eventoExistente],
        actualizarEventoMock,
      });
      await fixture.whenStable();
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({ nombre: 'Nuevo nombre' });
      await componente['guardar']();

      expect(actualizarEventoMock).toHaveBeenCalledTimes(1);
      const [eventoId, datos] = actualizarEventoMock.mock.calls[0];
      expect(eventoId).toBe('e1');
      expect(datos.nombre).toBe('Nuevo nombre');
      expect(datos).not.toHaveProperty('sillasTotales');
      expect(datos).not.toHaveProperty('sillasDisponibles');
      expect(snackBarOpenMock).toHaveBeenCalledWith('Evento actualizado correctamente.', 'Cerrar', {
        duration: 4000,
      });
    });

    it('subirImagen() sube el archivo y guarda la key con actualizarEvento()', async () => {
      const subirActivoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, key: 'eventos/e1/imagen-abc.png' });
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture } = configurarPrueba({
        id: 'e1',
        eventos: [eventoExistente],
        subirActivoMock,
        actualizarEventoMock,
      });
      await fixture.whenStable();
      const componente = fixture.componentInstance;

      const archivo = new File(['contenido'], 'foto.png', { type: 'image/png' });
      const evento = {
        target: { files: [archivo] } as unknown as HTMLInputElement,
      } as unknown as Event;

      await componente['subirImagen'](evento, 'imagen');

      expect(subirActivoMock).toHaveBeenCalledWith('e1', 'imagen', archivo);
      expect(actualizarEventoMock).toHaveBeenCalledWith('e1', {
        imagenKey: 'eventos/e1/imagen-abc.png',
      });
      expect(componente['imagenKey']()).toBe('eventos/e1/imagen-abc.png');
    });
  });
});
