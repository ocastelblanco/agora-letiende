import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { merge } from 'rxjs';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { EventosService } from '../../../core/api/eventos.service';
import { UsuariosService } from '../../../core/api/usuarios.service';
import {
  DatosEtapaBoleteria,
  Evento,
  MedioPago,
  TipoVinculo,
  VinculoExterno,
} from '../../../core/models/evento.model';
import { PrecioPipe } from '../../../shared/pipes/precio.pipe';
import { desdeInputBogota, paraInputBogota } from '../../../shared/utilidades/fecha-bogota';
import { slugificar } from '../../../shared/utilidades/slugificar';

// Bre-B no es un medio de pago aparte: es una transferencia entre cuentas
// de otras entidades financieras, así que queda dentro de "Transferencia"
// (a diferencia del QR de Bre-B como flujo propio, roadmap v2).
const MEDIOS_PAGO: readonly { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'bold', etiqueta: 'Bold' },
];

const TIPOS_MIME_IMAGEN_VALIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

// v2 (roadmap #25) — mismo criterio de validación que el backend
// (`server/api/handlers/eventos.ts`, `normalizarVinculoExterno`): el
// backend siempre revalida, esto es solo para dar feedback inmediato en el
// formulario (CLAUDE.md §5, A04/A08).
const TIPOS_VINCULO: readonly { valor: TipoVinculo; etiqueta: string }[] = [
  { valor: 'whatsapp', etiqueta: 'WhatsApp' },
  { valor: 'instagram', etiqueta: 'Instagram' },
  { valor: 'web', etiqueta: 'Página web' },
];
const PATRONES_VALOR_VINCULO: Record<TipoVinculo, RegExp> = {
  whatsapp: /^\d{9}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  web: /^https:\/\/.{1,256}$/,
};
const PREFIJO_VINCULO_WEB = 'https://';

/**
 * Rutas protegidas `/mis-eventos/eventos/nuevo` (exclusiva de
 * `administrador`, `data: { rolMinimo: 'administrador' }`) y
 * `/mis-eventos/eventos/:id` (`administrador` o `productor` asignado al
 * evento, `data: { rolMinimo: rolMinimoDeRuta('/mis-eventos/eventos') }`) en
 * `app.routes.ts` (`TODO.md` Tarea 1, T6) — alta y edición de
 * `agora-eventos` en un único componente, distinguidos por el parámetro de
 * ruta `id` (`'nuevo'` = modo crear; un productor nunca llega a ese modo,
 * solo a la edición de un evento donde está asignado). `sillasTotales` es
 * editable por `administrador` también al editar (hotfixes pre-producción:
 * "el administrador debe poder editar el número de sillas totales de un
 * evento, en todo momento") — el backend (`server/api/handlers/eventos.ts`)
 * ajusta `sillasDisponibles` por la diferencia, nunca acepta ese campo
 * directo del cliente. Un `productor` nunca puede tocarlo (no está en
 * `CAMPOS_EDITABLES_PRODUCTOR`), así que sigue deshabilitado para ese rol.
 *
 * El parámetro `id` se recibe como Signal input (`withComponentInputBinding()`
 * en `app.config.ts`), no leyendo `ActivatedRoute.snapshot` una sola vez:
 * al navegar de `/mis-eventos/eventos/nuevo` a `/mis-eventos/eventos/{eventoId}` tras
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
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    PrecioPipe,
  ],
  templateUrl: './editar-evento.component.html',
})
export class EditarEventoComponent {
  private readonly fb = inject(FormBuilder);
  private readonly eventosService = inject(EventosService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly servicioAuth = inject(ServicioAuth);

  /** `true` si el usuario actual es productor — acota qué campos puede editar (TODO.md Tarea 1, T6). */
  protected readonly esProductor = computed(() => this.servicioAuth.rol() === 'productor');

  protected readonly mediosPagoDisponibles = MEDIOS_PAGO;
  protected readonly tiposVinculoDisponibles = TIPOS_VINCULO;

  /**
   * Opciones de los selectores de `productores`/`porteros` (TODO.md Tarea 1,
   * T7) — filtradas en el cliente sobre el único listado que ya expone
   * `GET /api/usuarios` (sin filtro de rol en el backend). Deliberadamente
   * **no** se cargan para un `productor`: ese endpoint exige
   * `exigirRol('administrador')` (`server/api/handlers/usuarios.ts`), así
   * que pedirlo devolvería 403 sin ningún beneficio — el productor ve estos
   * campos de solo lectura (ver plantilla), no necesita el directorio
   * completo de personal para eso.
   *
   * `productoresDisponibles` incluye también `administrador` (hotfix
   * pre-producción, 14/08/2026): un administrador puede quedar asignado como
   * productor de un evento puntual para recibir el correo `aviso_comprobante`
   * y poder aprobar/rechazar compras por el enlace mágico, sin que eso le
   * quite ni le agregue ningún permiso — `tieneAccesoAlEvento()` ya deja
   * pasar a cualquier `administrador` sin mirar `productores` (bypass
   * existente), así que esto es solo una conveniencia de notificación, no un
   * cambio de autorización.
   */
  protected readonly productoresDisponibles = computed(() =>
    this.usuariosService
      .usuarios()
      .filter((u) => u.rol === 'productor' || u.rol === 'administrador'),
  );
  protected readonly porterosDisponibles = computed(() =>
    this.usuariosService.usuarios().filter((u) => u.rol === 'portero'),
  );

  /** Parámetro de ruta `id` — `'nuevo'` en modo crear, el `eventoId` real al editar. */
  readonly id = input.required<string>();

  /**
   * Refleja `id() === 'nuevo'`, pero es un Signal escribible (no `computed`)
   * a propósito: `guardar()` lo actualiza **directamente** al crear un
   * evento con éxito, en vez de depender por completo de que la
   * re-navegación a `/mis-eventos/eventos/{eventoId}` dispare de vuelta el
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
  protected readonly descargandoQr = signal<'svg' | 'png' | null>(null);

  protected readonly imagenKey = signal<string | undefined>(undefined);
  protected readonly logotipoKey = signal<string | undefined>(undefined);

  protected readonly puedeSubirActivos = computed(() => this.eventoId() !== null);

  protected readonly formulario = this.fb.nonNullable.group({
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    nombre: ['', Validators.required],
    descripcion: ['', Validators.required],
    fechaHora: ['', Validators.required],
    // v2 (roadmap #25) — `true` por defecto: Ágora administra la boletería.
    // En `false`, sincronizarBoleteriaExterna() (constructor) oculta la
    // necesidad de productores y habilita `vinculoExterno` en su lugar.
    administradoPorLeTiende: this.fb.nonNullable.control<boolean>(true),
    vinculoExterno: this.fb.nonNullable.group({
      tipo: this.fb.nonNullable.control<TipoVinculo>('whatsapp'),
      valor: ['', Validators.required],
    }),
    sillasTotales: [100, [Validators.required, Validators.min(1)]],
    maxBoletasPorCompra: [4, [Validators.required, Validators.min(1)]],
    plazoComprobanteMinutos: [10, [Validators.required, Validators.min(1)]],
    // Arreglo de correos, no texto libre (TODO.md Tarea 1, T7) — el
    // `required` sobre un arreglo lo cumple `Validators.required` de Angular
    // (una `[]` cuenta como vacío), reflejando en el formulario la misma
    // regla que el backend ya exige (`normalizarProductores`, al menos un
    // productor). `porteros` es análogo pero opcional, sin validador.
    productores: this.fb.nonNullable.control<string[]>([], Validators.required),
    porteros: this.fb.nonNullable.control<string[]>([]),
    estado: ['borrador'],
    mediosPago: this.fb.nonNullable.group({
      efectivo: [true],
      transferencia: [false],
      bold: [false],
    }),
    // v2 (roadmap #24) — boletería opcional: inicia vacío. Sin etapas, el
    // evento no cobra nada y solo controla aforo; el cobro se activa al
    // agregar la primera etapa con agregarEtapa().
    etapas: this.fb.nonNullable.array<ReturnType<typeof this.crearGrupoEtapa>>([]),
  });

  private crearGrupoEtapa() {
    return this.fb.nonNullable.group({
      // Vacío por defecto: una etapa nueva agregada con agregarEtapa() queda
      // con etapaId: '', que etapasFormulario() traduce a `undefined` —
      // "generar uno nuevo en el backend" (TODO.md Tarea 2). Sin validadores:
      // no es un campo que el administrador edite a mano.
      etapaId: [''],
      nombre: ['', Validators.required],
      precio: [0, [Validators.required, Validators.min(0)]],
      cierraEn: ['', Validators.required],
    });
  }

  protected get etapas() {
    return this.formulario.controls.etapas;
  }

  /** v2 (roadmap #24) — ver el comentario en el constructor sobre cuándo se invoca. */
  private sincronizarDisponibilidadBold(): void {
    const boldControl = this.formulario.controls.mediosPago.controls.bold;
    if (this.etapas.length === 0) {
      if (boldControl.value) {
        boldControl.setValue(false);
      }
      if (boldControl.enabled) {
        boldControl.disable();
      }
    } else if (boldControl.disabled) {
      boldControl.enable();
    }
  }

  /** Colapsado por defecto — evita que el formulario de edición abra con una lista larga de etapas ya expandida. */
  protected readonly etapasExpandido = signal(false);

  protected alternarEtapasExpandido(): void {
    this.etapasExpandido.update((v) => !v);
  }

  /**
   * `true` en cuanto el administrador edita el campo `slug` a mano — a
   * partir de ahí, `actualizarSlugAutomatico()` deja de sobrescribirlo. Se
   * detecta mediante `slug.valueChanges`, que solo emite ante una escritura
   * real del usuario: el autocompletado usa `setValue(..., { emitEvent: false })`
   * a propósito para no disparar esta misma bandera.
   */
  private slugTocadoManualmente = false;

  protected agregarEtapa(): void {
    this.etapas.push(this.crearGrupoEtapa());
  }

  /**
   * v2 (roadmap #24) — sin mínimo de etapas: se puede bajar hasta 0 (el
   * evento vuelve a no cobrar nada, solo controla aforo). Antes de esta
   * tarea el mínimo era 1.
   */
  protected quitarEtapa(indice: number): void {
    this.etapas.removeAt(indice);
  }

  /**
   * v2 (roadmap #25) — refleja el valor real del control `administradoPorLeTiende`
   * como Signal, para que la plantilla pueda ocultar (no solo deshabilitar)
   * las secciones de boletería con `@if`. Se actualiza desde la suscripción
   * a `valueChanges` en el constructor, incluida la precarga de un evento
   * existente (`precargarFormulario()` usa `patchValue`, que también emite).
   */
  protected readonly administradoPorLeTiende = signal(true);

  /**
   * v2 (roadmap #25) — un evento con boletería externa no necesita
   * productores asignados (nadie va a aprobar comprobantes ni recibir
   * avisos de compra) y en su lugar exige `vinculoExterno`: alterna cuál de
   * los dos controles está habilitado, para que `formulario.invalid` refleje
   * la regla real sin depender de ocultar campos con `@if` en la plantilla
   * (la validez de Angular ignora un control deshabilitado). El resto de
   * campos de boletería (`sillasTotales`, `etapas`, `mediosPago`, etc.) no
   * necesita este tratamiento: sus valores por defecto ya son válidos, así
   * que ocultarlos con `@if` basta — el backend los normaliza de todas
   * formas cuando `administradoPorLeTiende` es `false` (`server/api/handlers/eventos.ts`).
   */
  private sincronizarBoleteriaExterna(administrado: boolean): void {
    this.administradoPorLeTiende.set(administrado);
    if (administrado) {
      if (!this.esProductor()) {
        this.formulario.controls.productores.enable();
      }
      this.formulario.controls.vinculoExterno.disable();
    } else {
      this.formulario.controls.productores.disable();
      this.formulario.controls.vinculoExterno.enable();
    }
  }

  /**
   * v2 (roadmap #25) — el patrón exigido a `vinculoExterno.valor` depende
   * del `tipo` elegido (mismo criterio que el backend, `normalizarVinculoExterno`
   * en `server/api/handlers/eventos.ts`, que siempre revalida). Se reaplica
   * cada vez que el administrador cambia el tipo, para no arrastrar el
   * patrón del tipo anterior.
   */
  private actualizarValidadoresVinculo(): void {
    const tipo = this.formulario.controls.vinculoExterno.controls.tipo.value;
    const valorControl = this.formulario.controls.vinculoExterno.controls.valor;
    valorControl.setValidators([Validators.required, Validators.pattern(PATRONES_VALOR_VINCULO[tipo])]);
    valorControl.updateValueAndValidity({ emitEvent: false });
  }

  constructor() {
    // Selectores de productores/porteros (TODO.md Tarea 1, T7) — solo se
    // carga el directorio si NO es productor (ver docstring de
    // `productoresDisponibles` arriba: para un productor, ese GET
    // respondería 403). Lectura única de `esProductor()` al construir: la
    // guardia de ruta (`guardiaRol`) ya esperó a que la sesión esté resuelta
    // antes de permitir la navegación, mismo supuesto que ya usa
    // `precargarFormulario()`/`guardar()` en este mismo componente.
    if (!this.esProductor()) {
      void this.usuariosService.cargarUsuarios();
    }

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

    // v2 (roadmap #24) — Bold exige al menos una etapa configurada: se
    // deshabilita (y se fuerza a `false`, para que un `getRawValue()`
    // posterior no lo envíe en `true` pese a estar deshabilitado) en cuanto
    // `etapas` queda vacío, y se rehabilita al agregar la primera etapa.
    // `etapas.valueChanges` ya emite ante cualquier `push()`/`removeAt()`/
    // `clear()` (estructural), así que una sola suscripción cubre
    // `agregarEtapa()`, `quitarEtapa()`, `reiniciarFormularioVacio()` y el
    // bucle de `precargarFormulario()`, sin llamarla a mano en cada uno.
    // Nunca para un `productor`: ese rol ya tiene `mediosPago` deshabilitado
    // por completo (ver `precargarFormulario()`), y no debe reactivar nada.
    if (!this.esProductor()) {
      this.etapas.valueChanges
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.sincronizarDisponibilidadBold());
      this.sincronizarDisponibilidadBold();
    }

    // El slug se sugiere solo, a partir de nombre + fecha, mientras el
    // administrador no lo haya tocado a mano — ver docstring de
    // `slugTocadoManualmente`.
    this.formulario.controls.slug.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.slugTocadoManualmente = true;
    });
    merge(
      this.formulario.controls.nombre.valueChanges,
      this.formulario.controls.fechaHora.valueChanges,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.actualizarSlugAutomatico());

    // v2 (roadmap #25) — arranca deshabilitado: el valor por defecto de
    // `administradoPorLeTiende` es `true` (ver docstring de
    // `sincronizarBoleteriaExterna`), así que `vinculoExterno` no debe
    // bloquear la validez del formulario hasta que se desactive.
    this.formulario.controls.vinculoExterno.disable();
    this.actualizarValidadoresVinculo();

    this.formulario.controls.administradoPorLeTiende.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((valor) => this.sincronizarBoleteriaExterna(valor));
    this.formulario.controls.vinculoExterno.controls.tipo.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.actualizarValidadoresVinculo());
  }

  /**
   * Regenera `slug` a partir de `nombre` + la fecha (ej. "Noche de engaños
   * y karaoke" + 21/08/2026 → "noche-de-enganos-y-karaoke-2026-08-21").
   * Solo mientras se crea (nunca en edición, donde `slug` ya está
   * deshabilitado) y solo si el administrador no lo editó él mismo todavía.
   */
  private actualizarSlugAutomatico(): void {
    if (!this.modoCrear() || this.slugTocadoManualmente) {
      return;
    }

    const nombre = this.formulario.controls.nombre.value;
    if (!nombre.trim()) {
      return;
    }

    const fechaHora = this.formulario.controls.fechaHora.value;
    const fecha = fechaHora.includes('T') ? fechaHora.split('T')[0] : '';
    const base = slugificar(nombre);
    const slug = fecha ? `${base}-${fecha}` : base;
    this.formulario.controls.slug.setValue(slug, { emitEvent: false });
  }

  private reiniciarFormularioVacio(): void {
    this.formulario.reset({
      slug: '',
      nombre: '',
      descripcion: '',
      fechaHora: '',
      administradoPorLeTiende: true,
      vinculoExterno: { tipo: 'whatsapp', valor: '' },
      sillasTotales: 100,
      maxBoletasPorCompra: 4,
      plazoComprobanteMinutos: 10,
      productores: [],
      porteros: [],
      estado: 'borrador',
      mediosPago: { efectivo: true, transferencia: false, bold: false },
    });
    this.formulario.controls.slug.enable();
    this.formulario.controls.sillasTotales.enable();
    // v2 (roadmap #25) — reset() no garantiza reevaluar el enabled/disabled
    // de administradoPorLeTiende/vinculoExterno (mismo motivo que
    // sillasTotales.enable() arriba): se fuerza explícitamente al estado
    // correspondiente a `administradoPorLeTiende: true`.
    this.sincronizarBoleteriaExterna(true);
    // v2 (roadmap #24) — un evento nuevo inicia sin etapas (boletería
    // opcional): antes se precargaba una etapa vacía por defecto.
    this.etapas.clear();
    this.imagenKey.set(undefined);
    this.logotipoKey.set(undefined);
    // El propio reset() de arriba dispara slug.valueChanges (con slug en
    // '') y marcaría slugTocadoManualmente = true — deshacerlo para que el
    // autocompletado siga activo en este formulario recién reiniciado.
    this.slugTocadoManualmente = false;
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

    // v2 (roadmap #25) — retrocompatibilidad: un evento creado antes de esta
    // tarea no tiene el atributo (`?? true`, mismo criterio que el backend
    // en `listarEventos()`/`aVistaPublica()`). El input "web" muestra la URL
    // completa (con el prefijo `https://` antepuesto) aunque `valor` solo
    // guarde la parte variable — ver `vinculoExternoDesdeFormulario()`.
    const administradoPorLeTiende = evento.administradoPorLeTiende ?? true;
    const vinculo = evento.vinculoExterno;

    this.formulario.patchValue({
      slug: evento.slug,
      nombre: evento.nombre,
      descripcion: evento.descripcion,
      fechaHora: paraInputBogota(evento.fechaHora),
      administradoPorLeTiende,
      vinculoExterno: vinculo
        ? { tipo: vinculo.tipo, valor: vinculo.tipo === 'web' ? `${PREFIJO_VINCULO_WEB}${vinculo.valor}` : vinculo.valor }
        : undefined,
      sillasTotales: evento.sillasTotales,
      maxBoletasPorCompra: evento.maxBoletasPorCompra,
      plazoComprobanteMinutos: evento.plazoComprobanteMinutos,
      productores: evento.productores,
      porteros: evento.porteros,
      estado: evento.estado,
    });
    // No depende únicamente de que patchValue() dispare de vuelta la
    // suscripción a `administradoPorLeTiende.valueChanges` (mismo criterio
    // que el resto de este componente, ver docstring de la clase sobre la
    // "segunda capa" sin depender de la reactividad del formulario).
    this.sincronizarBoleteriaExterna(administradoPorLeTiende);

    // `slug` no se edita tras crear (es la URL pública) — `sillasTotales`
    // SÍ es editable en edición para un `administrador` (ver docstring de
    // la clase); para un `productor` se deshabilita más abajo, junto con el
    // resto de campos fuera de su alcance (TODO.md Tarea 1, T6).
    this.formulario.controls.slug.disable();

    // v2 (roadmap #24) — las etapas se cargan ANTES que mediosPago, a
    // propósito: `sincronizarDisponibilidadBold()` reacciona a cada cambio
    // de `etapas` (incluido este `clear()`/`push()`) y deshabilita+fuerza en
    // `false` el checkbox de Bold mientras `etapas` está vacío. Si mediosPago
    // se cargara primero con el valor real de `bold` (`true` en un evento
    // que sí tiene etapas), el `clear()` de abajo lo pisaría a `false` antes
    // de que el bucle alcance a repoblar `etapas` — invertir el orden evita
    // ese pisado, apoyándose en que el backend nunca persiste `bold: true`
    // sin al menos una etapa (`server/api/handlers/eventos.ts`).
    this.etapas.clear();
    for (const etapa of evento.etapas) {
      const grupo = this.crearGrupoEtapa();
      // Preserva el etapaId real ya existente (TODO.md Tarea 2) — así
      // etapasFormulario() lo reenvía tal cual al guardar, en vez de dejar
      // que el backend genere uno nuevo y huerfanice compras/boletas ya
      // asociadas a esta etapa.
      grupo.setValue({
        etapaId: etapa.etapaId,
        nombre: etapa.nombre,
        precio: etapa.precio,
        cierraEn: paraInputBogota(etapa.cierraEn),
      });
      this.etapas.push(grupo);
    }

    for (const medio of MEDIOS_PAGO) {
      this.formulario.controls.mediosPago.controls[medio.valor].setValue(
        evento.mediosPago.includes(medio.valor),
      );
    }

    // Un productor solo puede editar maxBoletasPorCompra y
    // plazoComprobanteMinutos (más imagenKey/logotipoKey, que no son
    // controles de este formulario) — el resto de campos se deshabilita
    // aquí como espejo en UI de lo que el backend ya rechaza
    // (server/api/handlers/eventos.ts, CAMPOS_EDITABLES_PRODUCTOR, TODO.md
    // Tarea 1, T6). DEBE ejecutarse DESPUÉS del bucle de arriba: cada
    // `this.etapas.push(grupo)` reevalúa el estado disabled/enabled de todo
    // el FormArray según sus hijos (que nacen habilitados), así que
    // deshabilitar `etapas` ANTES del bucle queda deshecho por el primer
    // `push()` (bug real: el productor veía "Etapas de boletería" editable
    // pese al `.disable()` de arriba).
    if (this.esProductor()) {
      this.formulario.controls.nombre.disable();
      this.formulario.controls.descripcion.disable();
      this.formulario.controls.fechaHora.disable();
      this.formulario.controls.administradoPorLeTiende.disable();
      this.formulario.controls.vinculoExterno.disable();
      this.formulario.controls.sillasTotales.disable();
      this.formulario.controls.productores.disable();
      this.formulario.controls.porteros.disable();
      this.formulario.controls.estado.disable();
      this.formulario.controls.mediosPago.disable();
      this.etapas.disable();
    }
  }

  private mediosPagoSeleccionados(): MedioPago[] {
    const valores = this.formulario.controls.mediosPago.getRawValue();
    return MEDIOS_PAGO.filter((medio) => valores[medio.valor]).map((medio) => medio.valor);
  }

  private etapasFormulario(): DatosEtapaBoleteria[] {
    return this.etapas.controls.map((grupo, indice) => ({
      // Nunca cadena vacía: el backend (normalizarEtapas(), TODO.md Tarea 2)
      // solo reutiliza un etapaId si viene como string no vacío y pertenece
      // al evento; una cadena vacía se trataría como "inválido" en vez de
      // "ausente", así que se traduce explícitamente a undefined.
      etapaId: grupo.controls.etapaId.value || undefined,
      nombre: grupo.controls.nombre.value,
      precio: grupo.controls.precio.value,
      cierraEn: desdeInputBogota(grupo.controls.cierraEn.value),
      orden: indice + 1,
    }));
  }

  /**
   * v2 (roadmap #25) — traduce el grupo `vinculoExterno` del formulario
   * (donde el tipo "web" muestra la URL completa) al `VinculoExterno` que
   * espera el backend (`valor` sin el prefijo fijo, tech-specs.md §4.3): le
   * quita el prefijo `https://` que el propio formulario le antepuso en
   * `precargarFormulario()`. El backend siempre revalida el resultado
   * (`normalizarVinculoExterno`), esto es solo para no duplicar el prefijo.
   */
  private vinculoExternoDesdeFormulario(): VinculoExterno {
    const grupo = this.formulario.controls.vinculoExterno.getRawValue();
    const valor =
      grupo.tipo === 'web' && grupo.valor.startsWith(PREFIJO_VINCULO_WEB)
        ? grupo.valor.slice(PREFIJO_VINCULO_WEB.length)
        : grupo.valor;
    return { tipo: grupo.tipo, valor };
  }

  /**
   * Texto de solo lectura para `productores`/`porteros` cuando el rol actual
   * es `productor` (TODO.md Tarea 1, T7) — la plantilla usa `mat-select`
   * interactivo solo para `administrador`; un productor ve esta lista plana
   * en su lugar (ver docstring de `productoresDisponibles`: no hay opciones
   * cargadas para armar un `mat-select` con las etiquetas correctas).
   */
  protected productoresParaMostrar(): string {
    const valores = this.formulario.controls.productores.value;
    return valores.length > 0 ? valores.join(', ') : 'Ninguno asignado';
  }

  protected porterosParaMostrar(): string {
    const valores = this.formulario.controls.porteros.value;
    return valores.length > 0 ? valores.join(', ') : 'Ninguno asignado';
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
          administradoPorLeTiende: valores.administradoPorLeTiende,
          sillasTotales: valores.sillasTotales,
          maxBoletasPorCompra: valores.maxBoletasPorCompra,
          plazoComprobanteMinutos: valores.plazoComprobanteMinutos,
          etapas: this.etapasFormulario(),
          mediosPago: this.mediosPagoSeleccionados(),
          productores: valores.productores,
          porteros: valores.porteros,
          ...(valores.administradoPorLeTiende
            ? {}
            : { vinculoExterno: this.vinculoExternoDesdeFormulario() }),
        });

        if (resultado.exito) {
          this.snackBar.open('Evento creado correctamente.', 'Cerrar', { duration: 4000 });
          // Transición directa a modo edición — no depende de que la
          // re-navegación de abajo dispare de vuelta el `effect()` del
          // constructor (ver el comentario de `modoCrear` más arriba).
          this.modoCrear.set(false);
          this.eventoId.set(resultado.evento.eventoId);
          this.precargarFormulario(resultado.evento);
          await this.router.navigate(['/mis-eventos/eventos', resultado.evento.eventoId]);
        } else {
          this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
        }
        return;
      }

      const eventoId = this.eventoId();
      if (!eventoId) {
        return;
      }

      // Un productor solo puede enviar los 4 campos que el backend le
      // permite editar (server/api/handlers/eventos.ts,
      // CAMPOS_EDITABLES_PRODUCTOR) — cualquier otro campo en el payload lo
      // rechaza con 403, así que el payload es parcial en ese caso (TODO.md
      // Tarea 1, T6).
      const resultado = await this.eventosService.actualizarEvento(
        eventoId,
        this.esProductor()
          ? {
              maxBoletasPorCompra: valores.maxBoletasPorCompra,
              plazoComprobanteMinutos: valores.plazoComprobanteMinutos,
            }
          : {
              nombre: valores.nombre,
              descripcion: valores.descripcion,
              fechaHora: desdeInputBogota(valores.fechaHora),
              administradoPorLeTiende: valores.administradoPorLeTiende,
              sillasTotales: valores.sillasTotales,
              maxBoletasPorCompra: valores.maxBoletasPorCompra,
              plazoComprobanteMinutos: valores.plazoComprobanteMinutos,
              etapas: this.etapasFormulario(),
              mediosPago: this.mediosPagoSeleccionados(),
              productores: valores.productores,
              porteros: valores.porteros,
              estado: valores.estado as Evento['estado'],
              ...(valores.administradoPorLeTiende
                ? {}
                : { vinculoExterno: this.vinculoExternoDesdeFormulario() }),
            },
      );

      if (resultado.exito) {
        this.snackBar.open('Evento actualizado correctamente.', 'Cerrar', { duration: 4000 });
        // Sincroniza los etapaId con la respuesta del servidor (ALL_NEW):
        // toda etapa nueva (etapaId vacío en el payload) recibe aquí el
        // etapaId real que le asignó normalizarEtapas() en el backend. Sin
        // esto, un segundo guardar() en la misma sesión de edición volvería
        // a enviarla como "nueva" y el backend le generaría OTRO etapaId
        // distinto, huerfanizando cualquier venta ya asociada al primero —
        // el mismo bug que esta corrección existe para eliminar, reaparecido
        // en una sesión de edición con guardados sucesivos. Se copian solo
        // los etapaId por índice (no se llama precargarFormulario() completo)
        // porque el backend conserva el orden del arreglo recibido
        // (normalizarEtapas() itera `for (const item of valor)` sin
        // reordenar) y así se evita reprocesar fechas/medios de pago que ya
        // están correctos en el formulario tras un guardado exitoso.
        this.etapas.controls.forEach((grupo, indice) => {
          const etapaActualizada = resultado.evento.etapas[indice];
          if (etapaActualizada) {
            grupo.controls.etapaId.setValue(etapaActualizada.etapaId);
          }
        });
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

  /**
   * Descarga el QR de marketing del evento (SVG o PNG) — es una descarga
   * autenticada, así que no puede ser un `<a href>` plano (no lleva el
   * header `Authorization`): se pide como `Blob` y se dispara con un `<a>`
   * temporal + `URL.createObjectURL()`.
   */
  protected async descargarQr(formato: 'svg' | 'png'): Promise<void> {
    const eventoId = this.eventoId();
    if (!eventoId) {
      return;
    }

    this.descargandoQr.set(formato);
    try {
      const resultado = await this.eventosService.descargarQr(eventoId, formato);
      if (!resultado.exito) {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
        return;
      }

      const url = URL.createObjectURL(resultado.blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = resultado.nombreArchivo;
      enlace.click();
      URL.revokeObjectURL(url);
    } finally {
      this.descargandoQr.set(null);
    }
  }
}
