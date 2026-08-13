import { Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { BrowserCodeReader, BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { EventosPublicosService } from '../../core/api/eventos-publicos.service';
import { ResultadoValidacion, ValidacionPuertaService } from '../../core/api/validacion-puerta.service';
import type { EventoPublico } from '../../core/models/evento.model';

/**
 * Ruta protegida `/evento/:slug/puerta` (`guardiaRol`, mínimo `portero`,
 * `TODO.md` Tarea 2 — Validación en puerta, `docs/DESIGN.md` §8). Se llega
 * acá desde `SeleccionPuertaComponent` (`/taquilla/puerta`) o por enlace directo.
 *
 * El acceso a la cámara se dispara **solo** desde el manejador de click del
 * botón "Escanear" — nunca automáticamente al cargar la página
 * (`CLAUDE.md` §7: `getUserMedia` exige HTTPS y gesto explícito del
 * usuario, mismo hallazgo que Babel documentó para el escaneo de ISBN).
 *
 * El `<video>` vive **fuera** de los bloques `@if`/`@else` del template
 * (siempre montado, solo se alterna su visibilidad con clases) para que la
 * referencia del stream nunca se pierda al cambiar entre pantalla de
 * "Escanear", overlay de veredicto y overlay de error de red.
 */
@Component({
  selector: 'app-puerta',
  imports: [],
  templateUrl: './puerta.component.html',
})
export class PuertaComponent implements OnDestroy {
  private readonly eventosPublicosService = inject(EventosPublicosService);
  private readonly validacionPuertaService = inject(ValidacionPuertaService);

  readonly slug = input.required<string>();

  protected readonly cargandoEvento = signal(true);
  protected readonly evento = signal<EventoPublico | null>(null);
  protected readonly escaneando = signal(false);
  protected readonly resultado = signal<ResultadoValidacion | null>(null);
  protected readonly errorRed = signal(false);

  private controles: IScannerControls | null = null;

  constructor() {
    effect(() => {
      void this.cargarEvento(this.slug());
    });
  }

  private async cargarEvento(slug: string): Promise<void> {
    this.cargandoEvento.set(true);
    this.evento.set(null);
    const resultado = await this.eventosPublicosService.cargarEventoPorSlug(slug);
    if (resultado.exito) {
      this.evento.set(resultado.evento);
    }
    this.cargandoEvento.set(false);
  }

  /** Manejador de click del botón "Escanear"/"Escanear otra"/"Reintentar" — el único disparador permitido de la cámara. */
  protected async escanear(video: HTMLVideoElement): Promise<void> {
    const evento = this.evento();
    if (!evento) {
      return;
    }

    this.resultado.set(null);
    this.errorRed.set(false);
    this.escaneando.set(true);

    const lector = new BrowserQRCodeReader();
    try {
      this.controles = await lector.decodeFromVideoDevice(undefined, video, (resultadoQr) => {
        if (resultadoQr) {
          void this.procesarCodigoEscaneado(resultadoQr.getText(), evento.eventoId);
        }
      });
    } catch {
      this.escaneando.set(false);
      this.errorRed.set(true);
    }
  }

  private async procesarCodigoEscaneado(textoQr: string, eventoId: string): Promise<void> {
    this.detenerEscaneo();

    const codigo = this.extraerCodigo(textoQr);
    if (!codigo) {
      this.resultado.set({ veredicto: 'NO_EXISTE' });
      return;
    }

    const respuesta = await this.validacionPuertaService.validarBoleta(codigo, eventoId);
    if (!respuesta) {
      this.errorRed.set(true);
      return;
    }
    this.resultado.set(respuesta);
  }

  /** El QR codifica la URL completa de la boleta (`{URL_BASE_APP}/boleta/{codigo}`) — se extrae el último segmento. */
  private extraerCodigo(textoQr: string): string | null {
    try {
      const url = new URL(textoQr);
      const segmentos = url.pathname.split('/').filter((segmento) => segmento.length > 0);
      return segmentos.at(-1) ?? null;
    } catch {
      return null;
    }
  }

  private detenerEscaneo(): void {
    this.controles?.stop();
    this.controles = null;
    BrowserCodeReader.releaseAllStreams();
    this.escaneando.set(false);
  }

  ngOnDestroy(): void {
    this.detenerEscaneo();
  }
}
