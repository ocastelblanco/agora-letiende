import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../core/models/evento.model';
import { DetalleEventoComponent } from './detalle-evento.component';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz en Le Tiende',
  imagenUrl: 'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/e1/imagen-abc.png',
  fechaHora: '2026-09-15T01:00:00.000Z',
  sillasTotales: 100,
  sillasDisponibles: 80,
  sillasReservadas: 5,
  etapas: [{ etapaId: 'et1', nombre: 'Preventa', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 1 }],
  maxBoletasPorCompra: 4,
  mediosPago: ['efectivo'],
  plazoComprobanteMinutos: 10,
  estado: 'publicado',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

function configurarPrueba(cargarEventoPorSlugMock: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: EventosPublicosService,
        useValue: { cargarEventoPorSlug: cargarEventoPorSlugMock },
      },
    ],
  });

  const fixture: ComponentFixture<DetalleEventoComponent> =
    TestBed.createComponent(DetalleEventoComponent);
  return { fixture };
}

async function activarConSlug(fixture: ComponentFixture<DetalleEventoComponent>, slug: string) {
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('DetalleEventoComponent', () => {
  afterEach(() => {
    document.getElementById('app-json-ld-evento')?.remove();
  });

  it('muestra el evento cuando el servicio responde con éxito', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');
    const componente = fixture.componentInstance;

    expect(cargarEventoPorSlugMock).toHaveBeenCalledWith('concierto-jazz');
    expect(componente['cargando']()).toBe(false);
    expect(componente['noEncontrado']()).toBe(false);
    expect(componente['evento']()).toEqual(eventoEjemplo);
    expect(fixture.nativeElement.textContent).toContain('Concierto de jazz');
  });

  it('muestra el botón "Comprar boletas" cuando el evento está publicado y tiene sillas disponibles', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    const enlace: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="/evento/concierto-jazz/comprar"]',
    );
    expect(enlace).not.toBeNull();
    expect(enlace?.textContent).toContain('Comprar boletas');
  });

  it('no muestra el botón "Comprar boletas" si el evento está agotado', async () => {
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValue({ exito: true, evento: { ...eventoEjemplo, estado: 'agotado', sillasDisponibles: 0 } });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).not.toContain('Comprar boletas');
  });

  it('marca noEncontrado cuando el servicio responde sin éxito (404)', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: false, error: 'no_encontrado' });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'inexistente');
    const componente = fixture.componentInstance;

    expect(componente['noEncontrado']()).toBe(true);
    expect(componente['evento']()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Evento no encontrado');
  });

  it('actualiza title, description, Open Graph y Twitter Card', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    const title = TestBed.inject(Title);
    const meta = TestBed.inject(Meta);

    expect(title.getTitle()).toBe('Concierto de jazz — Ágora');
    expect(meta.getTag('name="description"')?.content).toBe('Una noche de jazz en Le Tiende');
    expect(meta.getTag('property="og:title"')?.content).toBe('Concierto de jazz');
    expect(meta.getTag('property="og:description"')?.content).toBe('Una noche de jazz en Le Tiende');
    expect(meta.getTag('property="og:url"')?.content).toBe(
      'https://agora.letiende.co/evento/concierto-jazz',
    );
    expect(meta.getTag('property="og:type"')?.content).toBe('website');
    expect(meta.getTag('property="og:image"')?.content).toBe(eventoEjemplo.imagenUrl);
    expect(meta.getTag('name="twitter:card"')?.content).toBe('summary_large_image');
    expect(meta.getTag('name="twitter:title"')?.content).toBe('Concierto de jazz');
    expect(meta.getTag('name="twitter:description"')?.content).toBe('Una noche de jazz en Le Tiende');
    expect(meta.getTag('name="twitter:image"')?.content).toBe(eventoEjemplo.imagenUrl);
  });

  it('inyecta un <script type="application/ld+json"> con schema.org/Event', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    const script = document.getElementById('app-json-ld-evento');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('type')).toBe('application/ld+json');
    const jsonLd = JSON.parse(script!.textContent!);
    expect(jsonLd['@type']).toBe('Event');
    expect(jsonLd.name).toBe('Concierto de jazz');
    expect(jsonLd.startDate).toBe('2026-09-15T01:00:00.000Z');
    expect(jsonLd.offers[0]).toMatchObject({ name: 'Preventa', price: 45000, priceCurrency: 'COP' });
  });

  it('reemplaza el <script> JSON-LD anterior en vez de acumular uno por cada slug (reutilización de instancia)', async () => {
    const otroEvento: EventoPublico = { ...eventoEjemplo, eventoId: 'e2', slug: 'otro-evento', nombre: 'Otro evento' };
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValueOnce({ exito: true, evento: eventoEjemplo })
      .mockResolvedValueOnce({ exito: true, evento: otroEvento });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');
    await activarConSlug(fixture, 'otro-evento');

    const scripts = document.querySelectorAll('#app-json-ld-evento');
    expect(scripts.length).toBe(1);
    const jsonLd = JSON.parse(scripts[0].textContent!);
    expect(jsonLd.name).toBe('Otro evento');
  });
});
