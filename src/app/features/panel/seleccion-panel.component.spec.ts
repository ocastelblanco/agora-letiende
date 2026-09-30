import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { PanelService, EventoPanel } from '../../core/api/panel.service';
import { SeleccionPanelComponent } from './seleccion-panel.component';

const eventoEjemplo: EventoPanel = {
  eventoId: 'evt-1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  fechaHora: '2026-09-15T01:00:00.000Z',
  estado: 'publicado',
};

const evento = (id: string, nombre: string, fechaHora: string): EventoPanel => ({
  ...eventoEjemplo,
  eventoId: id,
  slug: id,
  nombre,
  fechaHora,
});

// "Ahora" = 2 de octubre de 2026 a las 10:00 en Bogotá.
const AHORA = '2026-10-02T15:00:00.000Z';

function proveedores(opciones: { eventos?: EventoPanel[]; error?: boolean }) {
  return [
    {
      provide: PanelService,
      useValue: {
        misEventos: () => opciones.eventos ?? [],
        errorMisEventos: () => opciones.error ?? false,
        cargarMisEventos: vi.fn().mockResolvedValue(undefined),
      },
    },
  ];
}

function configurarPrueba(opciones: { eventos?: EventoPanel[]; error?: boolean }) {
  const cargarMisEventosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      {
        provide: PanelService,
        useValue: {
          misEventos: () => opciones.eventos ?? [],
          errorMisEventos: () => opciones.error ?? false,
          cargarMisEventos: cargarMisEventosMock,
        },
      },
    ],
  });

  const fixture: ComponentFixture<SeleccionPanelComponent> = TestBed.createComponent(SeleccionPanelComponent);
  fixture.detectChanges();

  return { fixture, cargarMisEventosMock };
}

/** Navega a una URL con parámetros ANTES de crear el componente (el Router real los expone en el snapshot). */
async function configurarPruebaConUrl(url: string, opciones: { eventos?: EventoPanel[] }) {
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [provideRouter([{ path: '**', component: SeleccionPanelComponent }]), ...proveedores(opciones)],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(SeleccionPanelComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function nombres(fixture: ComponentFixture<SeleccionPanelComponent>): string[] {
  fixture.detectChanges();
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a span.font-semibold')).map(
    (el) => el.textContent ?? '',
  );
}

describe('SeleccionPanelComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('carga los eventos propios al iniciar', () => {
    const { cargarMisEventosMock } = configurarPrueba({});

    expect(cargarMisEventosMock).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de vacío cuando no hay eventos asignados', () => {
    const { fixture } = configurarPrueba({ eventos: [] });

    expect(fixture.nativeElement.textContent).toContain('No tienes eventos asignados');
  });

  it('muestra el mensaje de error si la carga falla', () => {
    const { fixture } = configurarPrueba({ error: true });

    expect(fixture.nativeElement.textContent).toContain('No se pudieron cargar');
  });

  it('lista los eventos con enlace a /evento/:slug/panel', () => {
    const { fixture } = configurarPrueba({ eventos: [eventoEjemplo] });

    const enlace = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
    expect(enlace.getAttribute('href')).toBe('/evento/concierto-jazz/panel');
  });

  describe('orden (roadmap #29)', () => {
    const eventos = [
      evento('a', 'Zorro', '2026-09-20T18:00:00.000Z'), // pasado
      evento('b', 'Álbum', '2026-10-20T18:00:00.000Z'), // futuro lejano
      evento('c', 'Hoy', '2026-10-02T18:00:00.000Z'),
      evento('d', 'Banda', '2026-10-03T18:00:00.000Z'), // mañana
    ];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(AHORA));
    });

    it('por defecto abre con la fecha más próxima primero: hoy y lo que viene, luego lo pasado', () => {
      const { fixture } = configurarPrueba({ eventos });

      expect(nombres(fixture)).toEqual(['Hoy', 'Banda', 'Álbum', 'Zorro']);
      expect(fixture.componentInstance['etiquetaSentido']()).toBe('Próximos primero');
    });

    it('el botón de sentido invierte la fecha: la más lejana primero', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['invertirSentido']();

      expect(nombres(fixture)).toEqual(['Álbum', 'Banda', 'Hoy', 'Zorro']);
      expect(fixture.componentInstance['etiquetaSentido']()).toBe('Fecha más lejana primero');
    });

    it('ordena por nombre (A → Z, ignorando tildes) y luego Z → A', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;

      componente['cambiarOrden']('nombre');
      expect(nombres(fixture)).toEqual(['Álbum', 'Banda', 'Hoy', 'Zorro']);
      expect(componente['etiquetaSentido']()).toBe('A → Z');

      componente['invertirSentido']();
      expect(nombres(fixture)).toEqual(['Zorro', 'Hoy', 'Banda', 'Álbum']);
      expect(componente['etiquetaSentido']()).toBe('Z → A');
    });

    it('al cambiar de campo vuelve al sentido natural de ese campo', () => {
      const { fixture } = configurarPrueba({ eventos });
      const componente = fixture.componentInstance;
      componente['invertirSentido']();

      componente['cambiarOrden']('nombre');

      expect(componente['sentido']()).toBe('asc');
    });
  });

  describe('filtro por periodo (roadmap #29)', () => {
    const eventos = [
      evento('a', 'Septiembre', '2026-09-20T18:00:00.000Z'),
      evento('b', 'Octubre uno', '2026-10-05T18:00:00.000Z'),
      evento('c', 'Octubre dos', '2026-10-20T18:00:00.000Z'),
    ];

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(AHORA));
    });

    it('filtra por mes', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['periodo'].set({ tipo: 'mes', ancla: '2026-10-01' });

      expect(nombres(fixture)).toEqual(['Octubre uno', 'Octubre dos']);
    });

    it('filtra por semana (lunes a domingo)', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['periodo'].set({ tipo: 'semana', ancla: '2026-10-05' });

      expect(nombres(fixture)).toEqual(['Octubre uno']);
    });

    it('avisa cuando ningún evento coincide con el periodo', () => {
      const { fixture } = configurarPrueba({ eventos });

      fixture.componentInstance['periodo'].set({ tipo: 'mes', ancla: '2027-01-01' });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Ningún evento coincide con el periodo elegido.');
    });

    it('no muestra los controles cuando no hay eventos asignados', () => {
      const { fixture } = configurarPrueba({ eventos: [] });

      expect(fixture.nativeElement.querySelector('app-filtro-periodo')).toBeNull();
    });
  });

  describe('orden y periodo en la URL (roadmap #29)', () => {
    const eventos = [evento('a', 'Zorro', '2026-10-01T18:00:00.000Z'), evento('b', 'Álbum', '2026-10-03T18:00:00.000Z')];

    it('los restaura desde los parámetros de la URL', async () => {
      const fixture = await configurarPruebaConUrl('/?orden=nombre&sentido=desc&periodo=mes&ancla=2026-10-01', { eventos });
      const componente = fixture.componentInstance;

      expect(componente['orden']()).toBe('nombre');
      expect(componente['sentido']()).toBe('desc');
      expect(componente['periodo']()).toEqual({ tipo: 'mes', ancla: '2026-10-01' });
      expect(nombres(fixture)).toEqual(['Zorro', 'Álbum']);
    });

    it('ignora valores inválidos en vez de romper', async () => {
      const fixture = await configurarPruebaConUrl('/?orden=hackeo&sentido=arriba&periodo=mes&ancla=2026-13-99', { eventos });
      const componente = fixture.componentInstance;

      expect(componente['orden']()).toBe('fecha');
      expect(componente['sentido']()).toBe('asc');
      expect(componente['periodo']().tipo).toBe('todos');
    });

    it('escribe en la URL solo lo que difiere del valor por defecto', async () => {
      const fixture = await configurarPruebaConUrl('/', { eventos });
      const router = TestBed.inject(Router);
      expect(router.url).toBe('/');

      fixture.componentInstance['cambiarOrden']('nombre');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(router.url).toBe('/?orden=nombre');
    });
  });
});
