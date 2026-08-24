import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import type { EventoPublico } from '../../core/models/evento.model';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';
import { DetalleEventoComponent } from './detalle-evento.component';

const eventoEjemplo: EventoPublico = {
  eventoId: 'e1',
  slug: 'concierto-jazz',
  nombre: 'Concierto de jazz',
  descripcion: 'Una noche de jazz en Le Tiende',
  imagenUrl: 'https://agora-activos-test.s3.us-east-1.amazonaws.com/eventos/e1/imagen-abc.png',
  fechaHora: '2026-09-15T01:00:00.000Z',
  administradoPorLeTiende: true,
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

  // v2, roadmap #24 — boletería opcional: sin etapas, el botón dice
  // "Adquirir boletas" en vez de "Comprar boletas".
  it('muestra el botón "Adquirir boletas" cuando el evento no tiene etapas de boletería', async () => {
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValue({ exito: true, evento: { ...eventoEjemplo, etapas: [] } });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    const enlace: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
      'a[href="/evento/concierto-jazz/comprar"]',
    );
    expect(enlace).not.toBeNull();
    expect(enlace?.textContent).toContain('Adquirir boletas');
    expect(enlace?.textContent).not.toContain('Comprar boletas');
  });

  // v2 (roadmap #25) — eventos con boletería externa.
  describe('boletería externa (roadmap #25)', () => {
    const eventoExterno: EventoPublico = {
      ...eventoEjemplo,
      administradoPorLeTiende: false,
      vinculoExterno: { tipo: 'whatsapp', valor: '300123456' },
      vinculoExternoUrl: 'https://wa.me/57300123456',
    };

    it('muestra el bloque "MÁS INFORMACIÓN" en vez del botón de compra', async () => {
      const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoExterno });
      const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

      await activarConSlug(fixture, 'concierto-jazz');

      expect(fixture.nativeElement.textContent).toContain('Más información');
      const enlace: HTMLAnchorElement | null = fixture.nativeElement.querySelector(
        'a[href="https://wa.me/57300123456"]',
      );
      expect(enlace).not.toBeNull();
      expect(enlace?.getAttribute('target')).toBe('_blank');
      expect(enlace?.getAttribute('rel')).toBe('noopener');
      expect(fixture.nativeElement.querySelector('a[href="/evento/concierto-jazz/comprar"]')).toBeNull();
    });

    it('no muestra el bloque "MÁS INFORMACIÓN" cuando administradoPorLeTiende es true', async () => {
      const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
      const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

      await activarConSlug(fixture, 'concierto-jazz');

      expect(fixture.nativeElement.textContent).not.toContain('Más información');
    });
  });

  it('no muestra el botón "Comprar boletas" si el evento está agotado', async () => {
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValue({ exito: true, evento: { ...eventoEjemplo, estado: 'agotado', sillasDisponibles: 0 } });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).not.toContain('Comprar boletas');
  });

  it('no muestra ningún banner AGOTADO/CANCELADO cuando el evento está publicado', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).not.toContain('AGOTADO');
    expect(fixture.nativeElement.textContent).not.toContain('CANCELADO');
  });

  it('muestra el banner "AGOTADO" cuando el evento está agotado', async () => {
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValue({ exito: true, evento: { ...eventoEjemplo, estado: 'agotado', sillasDisponibles: 0 } });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).toContain('AGOTADO');
  });

  it('muestra el banner "CANCELADO" cuando el evento está cancelado', async () => {
    const cargarEventoPorSlugMock = vi
      .fn()
      .mockResolvedValue({ exito: true, evento: { ...eventoEjemplo, estado: 'cancelado' } });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).toContain('CANCELADO');
  });

  it('muestra el banner "AGOTADO" aunque el evento no tenga imagenUrl', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({
      exito: true,
      evento: { ...eventoEjemplo, imagenUrl: undefined, estado: 'agotado', sillasDisponibles: 0 },
    });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    expect(fixture.nativeElement.textContent).toContain('AGOTADO');
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

  it('distingue la etapa vigente ("Vigente") de una etapa ya cerrada ("Cerrada")', async () => {
    const eventoConEtapas: EventoPublico = {
      ...eventoEjemplo,
      etapas: [
        { etapaId: 'et1', nombre: 'Preventa', precio: 30000, cierraEn: '2000-01-01T00:00:00.000Z', orden: 1 },
        { etapaId: 'et2', nombre: 'General', precio: 45000, cierraEn: '2099-01-01T00:00:00.000Z', orden: 2 },
      ],
    };
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoConEtapas });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');
    const componente = fixture.componentInstance;

    expect(componente['etapaVigente']()?.etapaId).toBe('et2');
    expect(componente['etapaCerrada'](eventoConEtapas.etapas[0])).toBe(true);
    expect(componente['etapaCerrada'](eventoConEtapas.etapas[1])).toBe(false);

    const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('ul li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Cerrada');
    expect(items[0].classList.contains('opacity-50')).toBe(true);
    expect(items[1].textContent).toContain('Vigente');
    expect(items[1].classList.contains('opacity-50')).toBe(false);
  });

  it('muestra la fecha límite de cada etapa en la lista de etapas', async () => {
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoEjemplo });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');

    const fechaEsperada = paraInputBogota(eventoEjemplo.etapas[0].cierraEn).replace('T', ' ');
    const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('ul li');
    expect(items[0].textContent).toContain(`Cierra: ${fechaEsperada}`);
  });

  it('renderiza la tabla de etapas en orden cronológico por cierraEn, no en el orden del arreglo de entrada', async () => {
    // Caso real reportado: A (orden 1, cierraEn 2026-08-01) ya cerrada, B
    // (orden 2, cierraEn 2026-09-15) vigente "según orden", C se agrega al
    // final del formulario (orden 3) pero cierraEn 2026-09-01, ANTES que B.
    // El arreglo viene de la base de datos en orden de `orden` (A, B, C);
    // la tabla debe mostrarlas cronológicamente: A, C, B.
    const eventoConEtapasDesordenadas: EventoPublico = {
      ...eventoEjemplo,
      etapas: [
        { etapaId: 'A', nombre: 'Preventa', precio: 30000, cierraEn: '2026-08-01T00:00:00.000Z', orden: 1 },
        { etapaId: 'B', nombre: 'General', precio: 60000, cierraEn: '2026-09-15T00:00:00.000Z', orden: 2 },
        { etapaId: 'C', nombre: 'Última hora', precio: 45000, cierraEn: '2026-09-01T00:00:00.000Z', orden: 3 },
      ],
    };
    const cargarEventoPorSlugMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoConEtapasDesordenadas });
    const { fixture } = configurarPrueba(cargarEventoPorSlugMock);

    await activarConSlug(fixture, 'concierto-jazz');
    const componente = fixture.componentInstance;

    expect(componente['etapasOrdenadas']().map((etapa) => etapa.etapaId)).toEqual(['A', 'C', 'B']);

    const items: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('ul li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Preventa');
    expect(items[1].textContent).toContain('Última hora');
    expect(items[2].textContent).toContain('General');
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
