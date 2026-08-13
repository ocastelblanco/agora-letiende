import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import type { EtapaBoleteria, EventoPublico } from '../../core/models/evento.model';
import { PrecioPipe } from '../../shared/pipes/precio.pipe';
import { avisoEstadoEvento } from '../../shared/utilidades/aviso-estado-evento';
import { etapaVigenteParaMostrar } from '../../shared/utilidades/etapa-vigente';
import { paraInputBogota } from '../../shared/utilidades/fecha-bogota';

const URL_BASE_PUBLICA = 'https://agora.letiende.co';
const ID_SCRIPT_JSON_LD = 'app-json-ld-evento';

/**
 * Ruta pública `/evento/:slug` (tech-specs.md §4.5, TODO.md Tarea 1) —
 * detalle público de un evento con SEO completo: `title`/`description`,
 * Open Graph, Twitter Card y JSON-LD `schema.org/Event`, resueltos en SSR
 * (`RenderMode.Server` en `app.routes.server.ts`) para que los rastreadores
 * de WhatsApp/Instagram reciban el HTML ya armado en la primera respuesta —
 * a diferencia de `/admin/*`, que es `RenderMode.Client`.
 *
 * El parámetro `slug` se recibe como Signal input
 * (`withComponentInputBinding()` en `app.config.ts`), no leyendo
 * `ActivatedRoute.snapshot`: mismo motivo documentado en
 * `EditarEventoComponent` (`docs/MEMORY.md` §7) — si el visitante navega de
 * un evento a otro y Angular reutiliza la instancia (misma definición de
 * ruta, solo cambia `:slug`), un snapshot leído una sola vez dejaría
 * title/meta/JSON-LD "congelados" en el primer evento visitado. El
 * `effect()` de abajo reacciona a cada cambio del Signal input, y
 * `actualizarJsonLd()` reemplaza el `<script>` anterior en vez de acumular
 * uno nuevo por cada slug visitado en la misma sesión del navegador.
 */
@Component({
  selector: 'app-detalle-evento',
  imports: [PrecioPipe, RouterLink],
  templateUrl: './detalle-evento.component.html',
})
export class DetalleEventoComponent {
  private readonly eventosPublicosService = inject(EventosPublicosService);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly documento = inject(DOCUMENT);

  readonly slug = input.required<string>();

  protected readonly evento = signal<EventoPublico | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noEncontrado = signal(false);

  /**
   * Etapa vigente para destacarla en el template (`TODO.md` Tarea 2) —
   * mismo utilitario compartido que `ComprarComponent`/`VentaEfectivoComponent`.
   * Aquí es solo presentación: esta página nunca envía un precio al backend.
   */
  protected readonly etapaVigente = computed(() => {
    const evento = this.evento();
    return evento ? etapaVigenteParaMostrar(evento.etapas) : null;
  });

  /**
   * Etapas en el orden real de cierre (por `cierraEn`), no en el orden en
   * que vienen en `evento.etapas` (inserción/`orden` manual del formulario
   * de administración) — la tabla pública "Etapas de boletería" debe
   * reflejar cuándo cierra cada una realmente, mismo motivo que
   * `etapaVigenteParaMostrar()`.
   */
  protected readonly etapasOrdenadas = computed(() => {
    const evento = this.evento();
    if (!evento) {
      return [];
    }
    return [...evento.etapas].sort((a, b) => new Date(a.cierraEn).getTime() - new Date(b.cierraEn).getTime());
  });

  constructor() {
    // Reacciona a cada cambio del Signal input `slug` — incluida la
    // reutilización de instancia descrita en el docstring de la clase.
    effect(() => {
      const slug = this.slug();
      this.cargando.set(true);
      this.noEncontrado.set(false);
      this.evento.set(null);
      void this.cargarEvento(slug);
    });
  }

  private async cargarEvento(slug: string): Promise<void> {
    const resultado = await this.eventosPublicosService.cargarEventoPorSlug(slug);

    if (!resultado.exito) {
      this.noEncontrado.set(true);
      this.cargando.set(false);
      return;
    }

    this.evento.set(resultado.evento);
    this.cargando.set(false);
    this.actualizarMetadatos(resultado.evento);
  }

  /** Fecha del evento en hora de Bogotá para mostrar en la página (`CLAUDE.md` §4). */
  protected fechaLegible(fechaHoraIso: string): string {
    return paraInputBogota(fechaHoraIso).replace('T', ' ');
  }

  /** `true` si `cierraEn` de la etapa ya pasó — para atenuarla en el template. */
  protected etapaCerrada(etapa: EtapaBoleteria): boolean {
    return new Date(etapa.cierraEn).getTime() <= Date.now();
  }

  /** Fecha límite de cierre de una etapa, en hora de Bogotá (`CLAUDE.md` §4). */
  protected etapaCierraEnLegible(etapa: EtapaBoleteria): string {
    return paraInputBogota(etapa.cierraEn).replace('T', ' ');
  }

  /**
   * Texto del banner diagonal AGOTADO/CANCELADO (`plan-pre-producción.md`
   * T3) — información crítica para un visitante que podría estar a punto de
   * intentar comprar, así que se muestra independientemente de si el evento
   * tiene `imagenUrl` (ver decisión en el template).
   */
  protected readonly avisoEstado = computed(() => {
    const evento = this.evento();
    return evento ? avisoEstadoEvento(evento.estado) : null;
  });

  private actualizarMetadatos(evento: EventoPublico): void {
    const tituloPagina = `${evento.nombre} — Ágora`;
    const descripcion = evento.descripcion.slice(0, 200);
    const urlEvento = `${URL_BASE_PUBLICA}/evento/${evento.slug}`;
    const imagen = evento.imagenUrl;

    this.title.setTitle(tituloPagina);
    this.meta.updateTag({ name: 'description', content: descripcion });

    this.meta.updateTag({ property: 'og:title', content: evento.nombre });
    this.meta.updateTag({ property: 'og:description', content: descripcion });
    this.meta.updateTag({ property: 'og:url', content: urlEvento });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    if (imagen) {
      this.meta.updateTag({ property: 'og:image', content: imagen });
    }

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: evento.nombre });
    this.meta.updateTag({ name: 'twitter:description', content: descripcion });
    if (imagen) {
      this.meta.updateTag({ name: 'twitter:image', content: imagen });
    }

    this.actualizarJsonLd(evento, urlEvento, imagen);
  }

  /**
   * Inyecta (o reemplaza) el `<script type="application/ld+json">` de
   * `schema.org/Event` en el `<head>`. `Meta`/`Title` no cubren JSON-LD —
   * no hay helper de Angular para esto — así que se manipula el `<head>`
   * directo vía `DOCUMENT` (`@angular/common`). Se busca por `id` fijo y se
   * quita el anterior antes de agregar el nuevo, ver docstring de la clase.
   */
  private actualizarJsonLd(evento: EventoPublico, urlEvento: string, imagen: string | undefined): void {
    this.documento.getElementById(ID_SCRIPT_JSON_LD)?.remove();

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: evento.nombre,
      description: evento.descripcion,
      startDate: evento.fechaHora,
      eventStatus: 'https://schema.org/EventScheduled',
      url: urlEvento,
      location: {
        '@type': 'Place',
        name: 'Le Tiende',
        address: 'Bogotá, Colombia',
      },
    };
    if (imagen) {
      jsonLd['image'] = [imagen];
    }
    // Decisión (`TODO.md` Tarea 2, punto 5): filtrar `offers` a la etapa
    // vigente, no a todas. `schema.org/Offer.price` describe el precio al
    // que un comprador puede acceder *ahora* — listar una preventa ya
    // cerrada como oferta activa es información engañosa para un rastreador
    // (y potencialmente reportable por Google como "precio no disponible"),
    // no una mejora de SEO. Si ninguna etapa sigue vigente, se omite
    // `offers` por completo en vez de anunciar un precio que ya no aplica.
    const etapaVigente = etapaVigenteParaMostrar(evento.etapas);
    if (etapaVigente) {
      jsonLd['offers'] = [
        {
          '@type': 'Offer',
          name: etapaVigente.nombre,
          price: etapaVigente.precio,
          priceCurrency: 'COP',
          url: urlEvento,
        },
      ];
    }

    const script = this.documento.createElement('script');
    script.id = ID_SCRIPT_JSON_LD;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    this.documento.head.appendChild(script);
  }
}
