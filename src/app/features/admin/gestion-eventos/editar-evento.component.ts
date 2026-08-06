import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EventosService } from '../../../core/api/eventos.service';
import { DatosEtapaBoleteria, Evento, MedioPago } from '../../../core/models/evento.model';
import { PrecioPipe } from '../../../shared/pipes/precio.pipe';
import { desdeInputBogota, paraInputBogota } from '../../../shared/utilidades/fecha-bogota';

const MEDIOS_PAGO: readonly { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'bold', etiqueta: 'Bold' },
  { valor: 'bre_b', etiqueta: 'Bre-B' },
];

const TIPOS_MIME_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Ruta protegida `/admin/eventos/nuevo` y `/admin/eventos/:id`
 * (`guardiaRol`, `data: { rolMinimo: 'administrador' }` en `app.routes.ts`;
 * `TODO.md` Tarea 1) — alta y edición de `agora-eventos` en un único
 * componente, distinguidos por el parámetro de ruta `id` (`'nuevo'` = modo
 * crear). `sillasTotales` solo se fija al crear — la edición nunca la toca
 * (motor de aforo, roadmap #8, todavía no existe; ver
 * `server/api/handlers/eventos.ts`).
 *
 * El parámetro `id` se recibe como Signal input (`withComponentInputBinding()`
 * en `app.config.ts`), no leyendo `ActivatedRoute.snapshot` una sola vez:
 * al navegar de `/admin/eventos/nuevo` a `/admin/eventos/{eventoId}` tras
 * crear un evento, Angular **reutiliza la misma instancia** de este
 * componente (misma definición de ruta, solo cambia el parámetro) y nunca
 * vuelve a ejecutar el constructor ni `ngOnInit` — un `snapshot` leído una
 * vez quedaría "congelado" en `'nuevo'` para siempre, dejando el formulario
 * en modo crear indefinidamente (bug real encontrado en staging: permitía
 * crear el mismo evento varias veces con un segundo clic en "Crear
 * evento"). El Signal input sí se actualiza en cada navegación aunque la
 * instancia se reutilice, y el `effect()` de abajo reacciona a ese cambio.
 *
 * **Segunda capa, no solo el Signal input:** `guardar()` también transiciona
 * `modoCrear`/`eventoId` a mano, de inmediato, al crear un evento con éxito
 * — no depende únicamente de que la re-navegación reactive el `effect()`.
 * Un primer intento de arreglo (solo el Signal input) se verificó con
 * pruebas unitarias que simulan el router y con una réplica aislada de la
 * mecánica real del Router (`RouterTestingHarness`, ruta perezosa +
 * `canActivate`), y ambas confirmaron que el mecanismo funciona — pero el
 * usuario reportó que el síntoma persistía en staging real, así que esta
 * segunda capa deja de depender por completo de esa mecánica en vez de
 * seguir buscando una causa que las pruebas no logran reproducir.
 */
@Component({
  selector: 'app-editar-evento',
  imports: [ReactiveFormsModule, MatButtonModule, PrecioPipe],
  templateUrl: './editar-evento.component.html',
})
export class EditarEventoComponent {
  private readonly fb = inject(FormBuilder);
  private readonly eventosService = inject(EventosService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mediosPagoDisponibles = MEDIOS_PAGO;

  /** Parámetro de ruta `id` — `'nuevo'` en modo crear, el `eventoId` real al editar. */
  readonly id = input.required<string>();

  /**
   * Refleja `id() === 'nuevo'`, pero es un Signal escribible (no `computed`)
   * a propósito: `guardar()` lo actualiza **directamente** al crear un
   * evento con éxito, en vez de depender por completo de que la
   * re-navegación a `/admin/eventos/{eventoId}` dispare de vuelta el
   * `effect()` de abajo. Los dos caminos son redundantes cuando ambos
   * funcionan (el segundo simplemente repite la misma transición sin
   * efecto visible), pero la actualización directa no depende de la
   * mecánica de re-enlace de inputs del Router ante una ruta reutilizada.
   */
  protected readonly modoCrear = signal(true);

  /** `null` mientras se crea; el `eventoId` real una vez creado o al editar uno existente. */
  protected readonly eventoId = signal<string | null>(null);

  protected readonly cargando = signal(true);
  protected readonly eventoNoEncontrado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly subiendoImagen = signal(false);
  protected readonly subiendoLogotipo = signal(false);

  protected readonly imagenKey = signal<string | undefined>(undefined);
  protected readonly logotipoKey = signal<string | undefined>(undefined);

  protected readonly puedeSubirActivos = computed(() => this.eventoId() !== null);

  protected readonly formulario = this.fb.nonNullable.group({
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    nombre: ['', Validators.required],
    descripcion: ['', Validators.required],
    fechaHora: ['', Validators.required],
    sillasTotales: [100, [Validators.required, Validators.min(1)]],
    maxBoletasPorCompra: [4, [Validators.required, Validators.min(1)]],
    plazoComprobanteMinutos: [10, [Validators.required, Validators.min(1)]],
    productoresTexto: [''],
    estado: ['borrador'],
    mediosPago: this.fb.nonNullable.group({
      efectivo: [true],
      transferencia: [false],
      bold: [false],
      bre_b: [false],
    }),
    etapas: this.fb.nonNullable.array<
      ReturnType<typeof this.crearGrupoEtapa>
    >([this.crearGrupoEtapa()]),
  });

  private crearGrupoEtapa() {
    return this.fb.nonNullable.group({
      nombre: ['', Validators.required],
      precio: [0, [Validators.required, Validators.min(0)]],
      cierraEn: ['', Validators.required],
    });
  }

  protected get etapas() {
    return this.formulario.controls.etapas;
  }

  protected agregarEtapa(): void {
    this.etapas.push(this.crearGrupoEtapa());
  }

  protected quitarEtapa(indice: number): void {
    if (this.etapas.length > 1) {
      this.etapas.removeAt(indice);
    }
  }

  constructor() {
    // Reacciona a cada cambio del Signal input `id` — incluida la reutilización
    // de instancia descrita en el docstring de la clase, donde este es el
    // único punto que se vuelve a ejecutar.
    effect(() => {
      const id = this.id();

      if (id === 'nuevo') {
        this.modoCrear.set(true);
        this.reiniciarFormularioVacio();
        this.eventoId.set(null);
        this.eventoNoEncontrado.set(false);
        this.cargando.set(false);
        return;
      }

      this.modoCrear.set(false);

      // Si guardar() ya transicionó a este mismo eventoId de forma directa
      // (creación exitosa, ver guardar()), no repitas la carga — cuando el
      // Router también reactiva el input tras la navegación a esta misma
      // ruta reutilizada, sería una recarga redundante.
      if (this.eventoId() === id) {
        return;
      }

      this.eventoId.set(id);
      this.cargando.set(true);
      this.eventoNoEncontrado.set(false);
      void this.cargarEventoExistente(id);
    });
  }

  private reiniciarFormularioVacio(): void {
    this.formulario.reset({
      slug: '',
      nombre: '',
      descripcion: '',
      fechaHora: '',
      sillasTotales: 100,
      maxBoletasPorCompra: 4,
      plazoComprobanteMinutos: 10,
      productoresTexto: '',
      estado: 'borrador',
      mediosPago: { efectivo: true, transferencia: false, bold: false, bre_b: false },
    });
    this.formulario.controls.slug.enable();
    this.formulario.controls.sillasTotales.enable();
    this.etapas.clear();
    this.etapas.push(this.crearGrupoEtapa());
    this.imagenKey.set(undefined);
    this.logotipoKey.set(undefined);
  }

  private async cargarEventoExistente(eventoId: string): Promise<void> {
    await this.eventosService.cargarEventos();
    const evento = this.eventosService.eventos().find((e) => e.eventoId === eventoId);
    if (!evento) {
      this.eventoNoEncontrado.set(true);
      this.cargando.set(false);
      return;
    }

    this.precargarFormulario(evento);
    this.cargando.set(false);
  }

  private precargarFormulario(evento: Evento): void {
    this.imagenKey.set(evento.imagenKey);
    this.logotipoKey.set(evento.logotipoKey);

    this.formulario.patchValue({
      slug: evento.slug,
      nombre: evento.nombre,
      descripcion: evento.descripcion,
      fechaHora: paraInputBogota(evento.fechaHora),
      sillasTotales: evento.sillasTotales,
      maxBoletasPorCompra: evento.maxBoletasPorCompra,
      plazoComprobanteMinutos: evento.plazoComprobanteMinutos,
      productoresTexto: evento.productores.join(', '),
      estado: evento.estado,
    });
    // `slug` y `sillasTotales` no se editan tras crear (el slug es la URL
    // pública; sillasTotales es del motor de aforo, ver docstring arriba).
    this.formulario.controls.slug.disable();
    this.formulario.controls.sillasTotales.disable();

    for (const medio of MEDIOS_PAGO) {
      this.formulario.controls.mediosPago.controls[medio.valor].setValue(
        evento.mediosPago.includes(medio.valor),
      );
    }

    this.etapas.clear();
    for (const etapa of evento.etapas) {
      const grupo = this.crearGrupoEtapa();
      grupo.setValue({
        nombre: etapa.nombre,
        precio: etapa.precio,
        cierraEn: paraInputBogota(etapa.cierraEn),
      });
      this.etapas.push(grupo);
    }
  }

  private mediosPagoSeleccionados(): MedioPago[] {
    const valores = this.formulario.controls.mediosPago.getRawValue();
    return MEDIOS_PAGO.filter((medio) => valores[medio.valor]).map((medio) => medio.valor);
  }

  private etapasFormulario(): DatosEtapaBoleteria[] {
    return this.etapas.controls.map((grupo, indice) => ({
      nombre: grupo.controls.nombre.value,
      precio: grupo.controls.precio.value,
      cierraEn: desdeInputBogota(grupo.controls.cierraEn.value),
      orden: indice + 1,
    }));
  }

  private productoresFormulario(): string[] {
    return this.formulario.controls.productoresTexto.value
      .split(',')
      .map((correo) => correo.trim())
      .filter((correo) => correo.length > 0);
  }

  protected async guardar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    this.guardando.set(true);

    try {
      if (this.modoCrear() && this.eventoId() === null) {
        const resultado = await this.eventosService.crearEvento({
          slug: valores.slug,
          nombre: valores.nombre,
          descripcion: valores.descripcion,
          fechaHora: desdeInputBogota(valores.fechaHora),
          sillasTotales: valores.sillasTotales,
          maxBoletasPorCompra: valores.maxBoletasPorCompra,
          plazoComprobanteMinutos: valores.plazoComprobanteMinutos,
          etapas: this.etapasFormulario(),
          mediosPago: this.mediosPagoSeleccionados(),
          productores: this.productoresFormulario(),
        });

        if (resultado.exito) {
          this.snackBar.open('Evento creado correctamente.', 'Cerrar', { duration: 4000 });
          // Transición directa a modo edición — no depende de que la
          // re-navegación de abajo dispare de vuelta el `effect()` del
          // constructor (ver el comentario de `modoCrear` más arriba).
          this.modoCrear.set(false);
          this.eventoId.set(resultado.evento.eventoId);
          this.precargarFormulario(resultado.evento);
          await this.router.navigate(['/admin/eventos', resultado.evento.eventoId]);
        } else {
          this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
        }
        return;
      }

      const eventoId = this.eventoId();
      if (!eventoId) {
        return;
      }

      const resultado = await this.eventosService.actualizarEvento(eventoId, {
        nombre: valores.nombre,
        descripcion: valores.descripcion,
        fechaHora: desdeInputBogota(valores.fechaHora),
        maxBoletasPorCompra: valores.maxBoletasPorCompra,
        plazoComprobanteMinutos: valores.plazoComprobanteMinutos,
        etapas: this.etapasFormulario(),
        mediosPago: this.mediosPagoSeleccionados(),
        productores: this.productoresFormulario(),
        estado: valores.estado as Evento['estado'],
      });

      if (resultado.exito) {
        this.snackBar.open('Evento actualizado correctamente.', 'Cerrar', { duration: 4000 });
      } else {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async subirImagen(entrada: Event, tipo: 'imagen' | 'logotipo'): Promise<void> {
    const eventoId = this.eventoId();
    const archivo = (entrada.target as HTMLInputElement).files?.[0];
    if (!eventoId || !archivo) {
      return;
    }

    if (!TIPOS_MIME_IMAGEN_VALIDOS.has(archivo.type)) {
      this.snackBar.open('Solo se permiten imágenes JPEG, PNG o WEBP.', 'Cerrar', {
        duration: 6000,
      });
      return;
    }

    const señalCargando = tipo === 'imagen' ? this.subiendoImagen : this.subiendoLogotipo;
    señalCargando.set(true);
    try {
      const subida = await this.eventosService.subirActivo(eventoId, tipo, archivo);
      if (!subida.exito) {
        this.snackBar.open(subida.error, 'Cerrar', { duration: 6000 });
        return;
      }

      const resultado = await this.eventosService.actualizarEvento(eventoId, {
        [tipo === 'imagen' ? 'imagenKey' : 'logotipoKey']: subida.key,
      });
      if (resultado.exito) {
        (tipo === 'imagen' ? this.imagenKey : this.logotipoKey).set(subida.key);
        this.snackBar.open('Imagen subida correctamente.', 'Cerrar', { duration: 4000 });
      } else {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
      }
    } finally {
      señalCargando.set(false);
    }
  }
}
