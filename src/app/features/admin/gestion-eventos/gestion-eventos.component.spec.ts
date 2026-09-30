import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { EventosService } from '../../../core/api/eventos.service';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import type { Evento } from '../../../core/models/evento.model';
import type { Rol } from '../../../core/models/usuario.model';
import { GestionEventosComponent } from './gestion-eventos.component';

// `servicio-auth.ts` (importado transitivamente vía ServicioAuth) importa
// el SDK real de Firebase a nivel de módulo — mismo motivo de mock que en
// el resto de specs que tocan ServicioAuth (ver gestion-usuarios.component.spec.ts).
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(function () {
    return { setCustomParameters: vi.fn() };
  }),
}));

const eventoEjemplo: Evento = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  duracionMinutos: 180,
  administradoPorLeTiende: true,
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  productores: [],
  porteros: [],
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(opciones: {
  eventos?: Evento[];
  error?: boolean;
  eliminarEventoMock?: ReturnType<typeof vi.fn>;
  duplicarEventoMock?: ReturnType<typeof vi.fn>;
  dialogAfterClosed?: unknown;
  rol?: Rol | null;
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
          duplicarEvento: opciones.duplicarEventoMock ?? vi.fn(),
        },
      },
      {
        provide: ServicioAuth,
        useValue: {
          rol: () => opciones.rol ?? 'administrador',
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
  const navigateMock = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

  const fixture: ComponentFixture<GestionEventosComponent> =
    TestBed.createComponent(GestionEventosComponent);
  fixture.detectChanges();

  return { fixture, cargarEventosMock, dialogOpenMock, snackBarOpenMock, navigateMock };
}

/** Variante que navega a una URL con parámetros ANTES de crear el componente (el Router real los expone en el snapshot). */
async function configurarPruebaConUrl(url: string, opciones: Parameters<typeof configurarPrueba>[0]) {
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([{ path: '**', component: GestionEventosComponent }]),
      {
        provide: EventosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => false,
          cargarEventos: vi.fn().mockResolvedValue(undefined),
          eliminarEvento: vi.fn(),
        },
      },
      { provide: ServicioAuth, useValue: { rol: () => opciones.rol ?? 'administrador' } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(GestionEventosComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

const evento = (id: string, nombre: string, fechaHora: string, estado: Evento['estado'] = 'publicado'): Evento => ({
  ...eventoEjemplo,
  eventoId: id,
  slug: id,
  nombre,
  fechaHora,
  estado,
});

function nombresEnTabla(fixture: ComponentFixture<GestionEventosComponent>): string[] {
  fixture.detectChanges();
  return Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('tr.mat-mdc-row td:first-child'),
  ).map((celda) => (celda.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/^(draft|check_circle|group_off|history|cancel) /, ''));
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

  describe('acciones exclusivas de administrador', () => {
    it('con rol productor: no muestra "Crear evento" ni el botón Eliminar, pero sí Editar', () => {
      const { fixture } = configurarPrueba({ eventos: [eventoEjemplo], rol: 'productor' });
      const host = fixture.nativeElement as HTMLElement;

      expect(host.textContent).not.toContain('Crear evento');
      expect(host.querySelector('button[aria-label="Eliminar"]')).toBeNull();
      expect(host.querySelector('a[aria-label="Editar"]')).not.toBeNull();
    });

    it('con rol administrador: sí muestra "Crear evento" y el botón Eliminar', () => {
      const { fixture } = configurarPrueba({ eventos: [eventoEjemplo], rol: 'administrador' });
      const host = fixture.nativeElement as HTMLElement;

      expect(host.textContent).toContain('Crear evento');
      expect(host.querySelector('button[aria-label="Eliminar"]')).not.toBeNull();
    });
  });
  describe('duplicar (roadmap #28)', () => {
    const copia = { ...eventoEjemplo, eventoId: 'e2', slug: 'concierto-jazz-ii', estado: 'borrador' as const };

    it('duplica el evento y abre la copia en modo edición', async () => {
      const duplicarEventoMock = vi.fn().mockResolvedValue({ exito: true, evento: copia });
      const { fixture, navigateMock } = configurarPrueba({ eventos: [eventoEjemplo], duplicarEventoMock });

      await fixture.componentInstance['duplicar'](eventoEjemplo);

      expect(duplicarEventoMock).toHaveBeenCalledWith('e1');
      expect(navigateMock).toHaveBeenCalledWith(['/mis-eventos/eventos', 'e2']);
    });

    it('si falla, muestra el mensaje del backend y no navega', async () => {
      const duplicarEventoMock = vi.fn().mockResolvedValue({ exito: false, error: 'No existe un evento con ese eventoId' });
      const { fixture, navigateMock, snackBarOpenMock } = configurarPrueba({ eventos: [eventoEjemplo], duplicarEventoMock });

      await fixture.componentInstance['duplicar'](eventoEjemplo);

      expect(snackBarOpenMock).toHaveBeenCalledWith('No existe un evento con ese eventoId', 'Cerrar', { duration: 6000 });
      expect(navigateMock).not.toHaveBeenCalledWith(['/mis-eventos/eventos', expect.anything()]);
    });

    it('un doble toque antes de repintar crea una sola copia (guarda síncrona)', async () => {
      let resolver!: (valor: unknown) => void;
      const duplicarEventoMock = vi.fn().mockReturnValue(new Promise((r) => (resolver = r)));
      const { fixture } = configurarPrueba({ eventos: [eventoEjemplo], duplicarEventoMock });
      const componente = fixture.componentInstance;

      const primera = componente['duplicar'](eventoEjemplo);
      const segunda = componente['duplicar'](eventoEjemplo);
      resolver({ exito: true, evento: copia });
      await Promise.all([primera, segunda]);

      expect(duplicarEventoMock).toHaveBeenCalledTimes(1);
      expect(componente['duplicando']()).toBe(false);
    });

    it('el botón Duplicar es solo para administrador', () => {
      const admin = configurarPrueba({ eventos: [eventoEjemplo], rol: 'administrador' });
      expect((admin.fixture.nativeElement as HTMLElement).querySelector('button[aria-label="Duplicar"] mat-icon')?.textContent).toBe('content_copy');
      TestBed.resetTestingModule();

      const productor = configurarPrueba({ eventos: [eventoEjemplo], rol: 'productor' });
      expect((productor.fixture.nativeElement as HTMLElement).querySelector('button[aria-label="Duplicar"]')).toBeNull();
    });
  });

  describe('columnas y acciones (roadmap #27)', () => {
    it('ya no tiene las columnas Sillas ni Estado, y las acciones son botones de ícono', () => {
      const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });
      const host = fixture.nativeElement as HTMLElement;
      const encabezados = Array.from(host.querySelectorAll('th')).map((th) => (th.textContent ?? '').trim());

      expect(encabezados).toEqual(['Nombre', 'Fecha (Bogotá)', '']);
      expect(host.textContent).not.toContain('80 / 100');
      expect(host.querySelector('a[aria-label="Editar"] mat-icon')?.textContent).toBe('edit');
      expect(host.querySelector('button[aria-label="Eliminar"] mat-icon')?.textContent).toBe('delete');
    });

    it.each([
      ['borrador', 'draft', 'Borrador'],
      ['publicado', 'check_circle', 'Publicado'],
      ['agotado', 'group_off', 'Agotado'],
      ['finalizado', 'history', 'Finalizado'],
      ['cancelado', 'cancel', 'Cancelado'],
    ] as const)('el evento %s muestra el ícono %s con su etiqueta accesible', (estado, icono, etiqueta) => {
      const { fixture } = configurarPrueba({ eventos: [evento('x', 'Evento X', '2026-10-01T18:00:00.000Z', estado)] });
      const chip = (fixture.nativeElement as HTMLElement).querySelector('[role="img"]');

      expect(chip?.getAttribute('aria-label')).toBe(`Estado: ${etiqueta}`);
      expect(chip?.querySelector('mat-icon')?.textContent).toBe(icono);
    });
  });

  describe('orden (roadmap #27)', () => {
    const eventos = [
      evento('a', 'Zorro', '2026-10-01T18:00:00.000Z'),
      evento('b', 'Álbum', '2026-10-03T18:00:00.000Z'),
      evento('c', 'Banda', '2026-10-02T18:00:00.000Z'),
    ];

    it('por defecto ordena por fecha, la más reciente primero', () => {
      const { fixture } = configurarPrueba({ eventos });

      expect(nombresEnTabla(fixture)).toEqual(['Álbum', 'Banda', 'Zorro']);
    });

    it('ordena por nombre ignorando tildes y cambia el sentido', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;

      componente['cambiarOrden']({ active: 'nombre', direction: 'asc' });
      expect(nombresEnTabla(fixture)).toEqual(['Álbum', 'Banda', 'Zorro']);

      componente['cambiarOrden']({ active: 'nombre', direction: 'desc' });
      expect(nombresEnTabla(fixture)).toEqual(['Zorro', 'Banda', 'Álbum']);
    });

    it('ordena por fecha ascendente y un tercer clic (sin dirección) vuelve al orden por defecto', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;

      componente['cambiarOrden']({ active: 'fechaHora', direction: 'asc' });
      expect(nombresEnTabla(fixture)).toEqual(['Zorro', 'Banda', 'Álbum']);

      componente['cambiarOrden']({ active: 'fechaHora', direction: '' });
      expect(componente['orden']()).toBe('fecha');
      expect(componente['sentido']()).toBe('desc');
    });
  });

  describe('filtros (roadmap #27)', () => {
    const eventos = [
      evento('a', 'Septiembre borrador', '2026-09-20T18:00:00.000Z', 'borrador'),
      evento('b', 'Octubre publicado', '2026-10-05T18:00:00.000Z', 'publicado'),
      evento('c', 'Octubre cancelado', '2026-10-20T18:00:00.000Z', 'cancelado'),
      evento('d', 'Noviembre publicado', '2026-11-02T18:00:00.000Z', 'publicado'),
    ];

    it('filtra por estado con selección múltiple', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;

      componente['estadosFiltrados'].set(['borrador', 'cancelado']);

      expect(nombresEnTabla(fixture)).toEqual(['Octubre cancelado', 'Septiembre borrador']);
    });

    it('filtra por mes', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['periodo'].set({ tipo: 'mes', ancla: '2026-10-01' });

      expect(nombresEnTabla(fixture)).toEqual(['Octubre cancelado', 'Octubre publicado']);
    });

    it('filtra por semana (lunes a domingo)', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['periodo'].set({ tipo: 'semana', ancla: '2026-10-05' });

      expect(nombresEnTabla(fixture)).toEqual(['Octubre publicado']);
    });

    it('combina estado y periodo, y avisa cuando nada coincide', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;

      componente['periodo'].set({ tipo: 'mes', ancla: '2026-11-01' });
      componente['estadosFiltrados'].set(['borrador']);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ningún evento coincide con los filtros.');
    });

    it('"Limpiar filtros" restablece periodo y estados', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;
      componente['periodo'].set({ tipo: 'mes', ancla: '2026-10-01' });
      componente['estadosFiltrados'].set(['publicado']);

      componente['limpiarFiltros']();

      expect(componente['hayFiltros']()).toBe(false);
      expect(nombresEnTabla(fixture)).toHaveLength(4);
    });
  });

  describe('orden y filtros en la URL (roadmap #27)', () => {
    const eventos = [
      evento('a', 'Zorro', '2026-10-01T18:00:00.000Z', 'publicado'),
      evento('b', 'Álbum', '2026-10-03T18:00:00.000Z', 'cancelado'),
    ];

    it('los restaura desde los parámetros de la URL al abrir la lista', async () => {
      const fixture = await configurarPruebaConUrl(
        '/?orden=nombre&sentido=asc&periodo=mes&ancla=2026-10-01&estados=publicado,cancelado',
        { eventos },
      );
      const componente = fixture.componentInstance;

      expect(componente['orden']()).toBe('nombre');
      expect(componente['sentido']()).toBe('asc');
      expect(componente['periodo']()).toEqual({ tipo: 'mes', ancla: '2026-10-01' });
      expect(componente['estadosFiltrados']()).toEqual(['publicado', 'cancelado']);
      expect(nombresEnTabla(fixture)).toEqual(['Álbum', 'Zorro']);
    });

    it('ignora valores inválidos en la URL en vez de romper', async () => {
      const fixture = await configurarPruebaConUrl(
        '/?orden=hackeo&sentido=arriba&periodo=mes&ancla=2026-13-99&estados=borrador,inventado',
        { eventos },
      );
      const componente = fixture.componentInstance;

      expect(componente['orden']()).toBe('fecha');
      expect(componente['sentido']()).toBe('desc');
      expect(componente['periodo']().tipo).toBe('todos');
      expect(componente['estadosFiltrados']()).toEqual(['borrador']);
    });

    it('escribe en la URL solo lo que difiere del valor por defecto', async () => {
      const fixture = await configurarPruebaConUrl('/', { eventos });
      const router = TestBed.inject(Router);

      expect(router.url).toBe('/');

      fixture.componentInstance['estadosFiltrados'].set(['agotado']);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(router.url).toBe('/?estados=agotado');
    });
  });
});
