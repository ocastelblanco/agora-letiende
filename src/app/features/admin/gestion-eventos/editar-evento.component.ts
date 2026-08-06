import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
 */
@Component({
  selector: 'app-editar-evento',
  imports: [ReactiveFormsModule, MatButtonModule, PrecioPipe],
  templateUrl: './editar-evento.component.html',
})
export class EditarEventoComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly eventosService = inject(EventosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mediosPagoDisponibles = MEDIOS_PAGO;

  private readonly idRuta = this.route.snapshot.paramMap.get('id');
  protected readonly modoCrear = this.idRuta === 'nuevo';

  /** `null` mientras se crea; el `eventoId` real una vez creado o al editar uno existente. */
  protected readonly eventoId = signal<string | null>(this.modoCrear ? null : this.idRuta);

  protected readonly cargando = signal(!this.modoCrear);
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

  async ngOnInit(): Promise<void> {
    if (this.modoCrear) {
      return;
    }

    await this.eventosService.cargarEventos();
    const evento = this.eventosService.eventos().find((e) => e.eventoId === this.idRuta);
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
      if (this.modoCrear && this.eventoId() === null) {
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
