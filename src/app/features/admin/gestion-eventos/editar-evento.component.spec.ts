import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { EventosService } from '../../../core/api/eventos.service';
import { UsuariosService } from '../../../core/api/usuarios.service';
import type { Evento } from '../../../core/models/evento.model';
import type { Rol, Usuario } from '../../../core/models/usuario.model';
import { EditarEventoComponent } from './editar-evento.component';

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
  porteros: ['portero@letiende.co'],
  estado: 'borrador',
  creadoEn: '2026-08-06T00:00:00.000Z',
  actualizadoEn: '2026-08-06T00:00:00.000Z',
};

const usuariosEjemplo: Usuario[] = [
  { email: 'productor@letiende.co', nombre: 'Paula Productora', rol: 'productor', activo: true, creadoEn: '2026-08-01T00:00:00.000Z' },
  { email: 'portero@letiende.co', nombre: 'Pedro Portero', rol: 'portero', activo: true, creadoEn: '2026-08-01T00:00:00.000Z' },
];

function configurarPrueba(opciones: {
  eventos?: Evento[];
  crearEventoMock?: ReturnType<typeof vi.fn>;
  actualizarEventoMock?: ReturnType<typeof vi.fn>;
  subirActivoMock?: ReturnType<typeof vi.fn>;
  descargarQrMock?: ReturnType<typeof vi.fn>;
  rol?: Rol | null;
  usuarios?: Usuario[];
}) {
  const cargarEventosMock = vi.fn().mockResolvedValue(undefined);
  const cargarUsuariosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter([]),
      {
        provide: EventosService,
        useValue: {
          eventos: () => opciones.eventos ?? [],
          error: () => false,
          cargarEventos: cargarEventosMock,
          crearEvento: opciones.crearEventoMock ?? vi.fn(),
          actualizarEvento: opciones.actualizarEventoMock ?? vi.fn(),
          subirActivo: opciones.subirActivoMock ?? vi.fn(),
          descargarQr: opciones.descargarQrMock ?? vi.fn(),
        },
      },
      {
        provide: UsuariosService,
        useValue: {
          usuarios: () => opciones.usuarios ?? usuariosEjemplo,
          error: () => false,
          cargarUsuarios: cargarUsuariosMock,
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

  const navigateMock = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<EditarEventoComponent> =
    TestBed.createComponent(EditarEventoComponent);

  return { fixture, cargarEventosMock, cargarUsuariosMock, navigateMock, snackBarOpenMock };
}

async function activarConId(fixture: ComponentFixture<EditarEventoComponent>, id: string) {
  fixture.componentRef.setInput('id', id);
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('EditarEventoComponent', () => {
  describe('modo crear (id = "nuevo")', () => {
    it('no carga eventos existentes y no permite subir activos todavía', async () => {
      const { fixture, cargarEventosMock } = configurarPrueba({});
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      expect(cargarEventosMock).not.toHaveBeenCalled();
      expect(componente['cargando']()).toBe(false);
      expect(componente['puedeSubirActivos']()).toBe(false);
    });

    it('guardar() no llama a la API si el formulario es inválido', async () => {
      const crearEventoMock = vi.fn();
      const { fixture } = configurarPrueba({ crearEventoMock });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({ nombre: '', slug: '' });
      await componente['guardar']();

      expect(crearEventoMock).not.toHaveBeenCalled();
    });

    it('guardar() crea el evento y navega a la ruta de edición cuando la API responde éxito', async () => {
      const crearEventoMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture, navigateMock, snackBarOpenMock } = configurarPrueba({ crearEventoMock });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({
        slug: 'concierto-jazz',
        nombre: 'Concierto de jazz',
        descripcion: 'Una noche de jazz',
        fechaHora: '2026-09-14T20:00',
        sillasTotales: 100,
        productores: ['productor@letiende.co'],
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
      expect(navigateMock).toHaveBeenCalledWith(['/mis-eventos/eventos', 'e1']);
      expect(snackBarOpenMock).toHaveBeenCalledWith('Evento creado correctamente.', 'Cerrar', {
        duration: 4000,
      });

      // Regresión: la transición a modo edición debe ser inmediata, sin
      // depender de que el Router reactive el Signal input `id` de vuelta
      // (que en esta prueba nunca se simula) — ver el docstring de la
      // clase sobre la "segunda capa" en guardar().
      expect(componente['modoCrear']()).toBe(false);
      expect(componente['eventoId']()).toBe('e1');
      expect(componente['formulario'].controls.slug.disabled).toBe(true);
    });

    it('sugiere el slug a partir del nombre y la fecha mientras el administrador no lo edite', async () => {
      const { fixture } = configurarPrueba({});
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      componente['formulario'].controls.nombre.setValue('Noche de engaños y karaoke');
      componente['formulario'].controls.fechaHora.setValue('2026-08-21T20:00');

      expect(componente['formulario'].controls.slug.value).toBe(
        'noche-de-enganos-y-karaoke-2026-08-21',
      );
    });

    it('deja de sugerir el slug en cuanto el administrador lo edita a mano', async () => {
      const { fixture } = configurarPrueba({});
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      componente['formulario'].controls.nombre.setValue('Concierto de jazz');
      componente['formulario'].controls.slug.setValue('mi-slug-elegido');
      componente['formulario'].controls.nombre.setValue('Otro nombre distinto');

      expect(componente['formulario'].controls.slug.value).toBe('mi-slug-elegido');
    });

    it('regresión: si el router reutiliza la instancia y el id pasa de "nuevo" al eventoId real, entra en modo edición en vez de quedar congelada en modo crear', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente] });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;
      expect(componente['modoCrear']()).toBe(true);

      await activarConId(fixture, 'e1');

      expect(componente['modoCrear']()).toBe(false);
      expect(componente['eventoId']()).toBe('e1');
      expect(componente['formulario'].controls.slug.disabled).toBe(true);
      expect(componente['formulario'].controls.nombre.value).toBe('Concierto de jazz');
    });
  });

  describe('colapso de "Etapas de boletería"', () => {
    it('empieza colapsado (sin el FormArray de etapas visible en el DOM) y se expande al hacer click en el control', async () => {
      const { fixture } = configurarPrueba({});
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      expect(componente['etapasExpandido']()).toBe(false);
      expect(fixture.nativeElement.querySelector('[formarrayname="etapas"]')).toBeNull();

      const botones = Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[];
      const botonMostrar = botones.find((boton) => boton.textContent?.trim() === 'Mostrar');
      expect(botonMostrar).toBeTruthy();

      botonMostrar!.click();
      fixture.detectChanges();

      expect(componente['etapasExpandido']()).toBe(true);
      expect(fixture.nativeElement.querySelector('[formarrayname="etapas"]')).not.toBeNull();
    });
  });

  describe('modo editar (id = eventoId real)', () => {
    it('precarga el formulario y deshabilita slug (sillasTotales queda editable para administrador)', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente] });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      expect(componente['cargando']()).toBe(false);
      expect(componente['eventoNoEncontrado']()).toBe(false);
      expect(componente['formulario'].controls.slug.disabled).toBe(true);
      expect(componente['formulario'].controls.sillasTotales.disabled).toBe(false);
      expect(componente['formulario'].controls.sillasTotales.value).toBe(100);
      expect(componente['formulario'].controls.nombre.value).toBe('Concierto de jazz');
      expect(componente['formulario'].controls.mediosPago.controls.bold.value).toBe(true);
      expect(componente['etapas'].length).toBe(1);
      // TODO.md Tarea 2: el etapaId real ya existente se preserva en el
      // FormArray, no se deja vacío.
      expect(componente['etapas'].at(0).controls.etapaId.value).toBe('et1');
    });

    it('marca eventoNoEncontrado cuando el eventoId no está en el listado', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente] });
      await activarConId(fixture, 'inexistente');
      const componente = fixture.componentInstance;

      expect(componente['eventoNoEncontrado']()).toBe(true);
    });

    it('guardar() actualiza el evento incluyendo sillasTotales (editable), nunca sillasDisponibles', async () => {
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture, snackBarOpenMock } = configurarPrueba({
        eventos: [eventoExistente],
        actualizarEventoMock,
      });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      componente['formulario'].patchValue({ nombre: 'Nuevo nombre', sillasTotales: 150 });
      await componente['guardar']();

      expect(actualizarEventoMock).toHaveBeenCalledTimes(1);
      const [eventoId, datos] = actualizarEventoMock.mock.calls[0];
      expect(eventoId).toBe('e1');
      expect(datos.nombre).toBe('Nuevo nombre');
      expect(datos.sillasTotales).toBe(150);
      expect(datos).not.toHaveProperty('sillasDisponibles');
      expect(snackBarOpenMock).toHaveBeenCalledWith('Evento actualizado correctamente.', 'Cerrar', {
        duration: 4000,
      });
      // TODO.md Tarea 2: etapasFormulario() reenvía el etapaId real ya
      // precargado, en vez de dejar que el backend genere uno nuevo.
      expect(datos.etapas[0].etapaId).toBe('et1');
    });

    it('regresión: un segundo guardar() tras agregarEtapa() reenvía el etapaId que el backend asignó en el primer guardado', async () => {
      const eventoConEtapaNueva: Evento = {
        ...eventoExistente,
        etapas: [
          ...eventoExistente.etapas,
          {
            etapaId: 'et2-generado-por-backend',
            nombre: 'General',
            precio: 30000,
            cierraEn: '2026-09-10T00:00:00.000Z',
            orden: 2,
          },
        ],
      };
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValueOnce({ exito: true, evento: eventoConEtapaNueva })
        .mockResolvedValueOnce({ exito: true, evento: eventoConEtapaNueva });
      const { fixture } = configurarPrueba({
        eventos: [eventoExistente],
        actualizarEventoMock,
      });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      // Agrega una segunda etapa sin etapaId (como haría agregarEtapa() al
      // administrador dar clic en "Agregar etapa") y guarda una primera vez.
      componente['agregarEtapa']();
      componente['etapas'].at(1).patchValue({
        nombre: 'General',
        precio: 30000,
        cierraEn: '2026-09-09T19:00',
      });
      await componente['guardar']();

      const primerPayload = actualizarEventoMock.mock.calls[0][1];
      expect(primerPayload.etapas[1].etapaId).toBeUndefined();

      // El formulario debe haberse sincronizado con el etapaId real que
      // devolvió el backend en la respuesta ALL_NEW — sin recargar ni
      // navegar entre medio.
      expect(componente['etapas'].at(1).controls.etapaId.value).toBe(
        'et2-generado-por-backend',
      );

      // Un segundo guardar() en la misma sesión debe reenviar ESE mismo
      // etapaId, no uno vacío que el backend volvería a tratar como "nueva"
      // (huerfanizando cualquier venta ya asociada a la primera).
      await componente['guardar']();
      const segundoPayload = actualizarEventoMock.mock.calls[1][1];
      expect(segundoPayload.etapas[1].etapaId).toBe('et2-generado-por-backend');
    });

    it('subirImagen() sube el archivo y guarda la key con actualizarEvento()', async () => {
      const subirActivoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, key: 'eventos/e1/imagen-abc.png' });
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture } = configurarPrueba({
        eventos: [eventoExistente],
        subirActivoMock,
        actualizarEventoMock,
      });
      await activarConId(fixture, 'e1');
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

    describe('descargarQr', () => {
      it('descarga el archivo con el nombre que devuelve el servicio', async () => {
        const blob = new Blob(['<svg></svg>'], { type: 'image/svg+xml' });
        const descargarQrMock = vi
          .fn()
          .mockResolvedValue({ exito: true, blob, nombreArchivo: 'qr-concierto-jazz.svg' });
        const { fixture } = configurarPrueba({ eventos: [eventoExistente], descargarQrMock });
        await activarConId(fixture, 'e1');
        const componente = fixture.componentInstance;

        const createObjectURLMock = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
        const revokeObjectURLMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        try {
          await componente['descargarQr']('svg');

          expect(descargarQrMock).toHaveBeenCalledWith('e1', 'svg');
          expect(createObjectURLMock).toHaveBeenCalledWith(blob);
          expect(clickMock).toHaveBeenCalledTimes(1);
          expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url');
        } finally {
          createObjectURLMock.mockRestore();
          revokeObjectURLMock.mockRestore();
          clickMock.mockRestore();
        }
      });

      it('muestra el mensaje de error del servicio cuando la descarga falla', async () => {
        const descargarQrMock = vi.fn().mockResolvedValue({
          exito: false,
          error: 'No se pudo descargar el QR. Intenta de nuevo.',
        });
        const { fixture, snackBarOpenMock } = configurarPrueba({
          eventos: [eventoExistente],
          descargarQrMock,
        });
        await activarConId(fixture, 'e1');
        const componente = fixture.componentInstance;

        await componente['descargarQr']('png');

        expect(snackBarOpenMock).toHaveBeenCalledWith(
          'No se pudo descargar el QR. Intenta de nuevo.',
          'Cerrar',
          { duration: 6000 },
        );
      });
    });
  });

  describe('modo editar con rol productor', () => {
    it('deshabilita el FormArray de etapas tras precargar el formulario (regresión: etapas.disable() se deshacía a sí mismo)', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente], rol: 'productor' });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      expect(componente['etapas'].disabled).toBe(true);
      expect(componente['formulario'].controls.nombre.disabled).toBe(true);
      expect(componente['formulario'].controls.descripcion.disabled).toBe(true);
      expect(componente['formulario'].controls.fechaHora.disabled).toBe(true);
      expect(componente['formulario'].controls.sillasTotales.disabled).toBe(true);
      expect(componente['formulario'].controls.productores.disabled).toBe(true);
      expect(componente['formulario'].controls.porteros.disabled).toBe(true);
      expect(componente['formulario'].controls.estado.disabled).toBe(true);
      expect(componente['formulario'].controls.mediosPago.disabled).toBe(true);
    });

    it('guardar() envía únicamente los campos que el productor puede editar', async () => {
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture } = configurarPrueba({
        eventos: [eventoExistente],
        actualizarEventoMock,
        rol: 'productor',
      });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      await componente['guardar']();

      expect(actualizarEventoMock).toHaveBeenCalledTimes(1);
      const [eventoId, datos] = actualizarEventoMock.mock.calls[0];
      expect(eventoId).toBe('e1');
      expect(datos).toEqual({
        maxBoletasPorCompra: eventoExistente.maxBoletasPorCompra,
        plazoComprobanteMinutos: eventoExistente.plazoComprobanteMinutos,
      });
    });

    // TODO.md Tarea 1 (T7): GET /api/usuarios exige exigirRol('administrador')
    // (server/api/handlers/usuarios.ts) — un productor nunca debe llamarlo.
    it('nunca llama cargarUsuarios() para un productor (ese GET respondería 403)', async () => {
      const { fixture, cargarUsuariosMock } = configurarPrueba({
        eventos: [eventoExistente],
        rol: 'productor',
      });
      await activarConId(fixture, 'e1');

      expect(cargarUsuariosMock).not.toHaveBeenCalled();
    });

    it('muestra productores/porteros como texto de solo lectura, con las etiquetas correctas', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente], rol: 'productor' });
      await activarConId(fixture, 'e1');
      fixture.detectChanges();

      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain('productor@letiende.co');
      expect(texto).toContain('portero@letiende.co');
      expect(fixture.nativeElement.querySelector('mat-select')).toBeNull();
    });
  });

  describe('selectores de productores/porteros (TODO.md Tarea 1, T7)', () => {
    it('como administrador, carga el directorio de usuarios al construir', async () => {
      const { fixture, cargarUsuariosMock } = configurarPrueba({});
      await activarConId(fixture, 'nuevo');

      expect(cargarUsuariosMock).toHaveBeenCalledTimes(1);
    });

    it('incluye a los administradores en el desplegable de productores, para que puedan recibir correos de aprobación si se los selecciona (hotfix pre-producción, 14/08/2026)', async () => {
      const usuariosConAdmin: Usuario[] = [
        ...usuariosEjemplo,
        { email: 'admin@letiende.co', nombre: 'Ana Admin', rol: 'administrador', activo: true, creadoEn: '2026-08-01T00:00:00.000Z' },
      ];
      const { fixture } = configurarPrueba({ usuarios: usuariosConAdmin });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;

      expect(componente['productoresDisponibles']().map((u: Usuario) => u.email)).toEqual([
        'productor@letiende.co',
        'admin@letiende.co',
      ]);
      // Porteros no cambia: el hotfix es exclusivo del desplegable de productores.
      expect(componente['porterosDisponibles']().map((u: Usuario) => u.email)).toEqual(['portero@letiende.co']);
    });

    it('precarga productores/porteros con los correos del evento existente', async () => {
      const { fixture } = configurarPrueba({ eventos: [eventoExistente] });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;

      expect(componente['formulario'].controls.productores.value).toEqual(['productor@letiende.co']);
      expect(componente['formulario'].controls.porteros.value).toEqual(['portero@letiende.co']);
    });

    it('guardar() en modo crear es inválido sin al menos un productor seleccionado', async () => {
      const crearEventoMock = vi.fn();
      const { fixture } = configurarPrueba({ crearEventoMock });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;
      componente['formulario'].patchValue({
        slug: 'x',
        nombre: 'X',
        descripcion: 'X',
        fechaHora: '2026-09-15T10:00',
      });

      await componente['guardar']();

      expect(crearEventoMock).not.toHaveBeenCalled();
      expect(componente['formulario'].controls.productores.invalid).toBe(true);
    });

    it('guardar() en modo crear envía productores y porteros seleccionados', async () => {
      const crearEventoMock = vi.fn().mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture } = configurarPrueba({ crearEventoMock });
      await activarConId(fixture, 'nuevo');
      const componente = fixture.componentInstance;
      componente['formulario'].patchValue({
        slug: 'x',
        nombre: 'X',
        descripcion: 'X',
        fechaHora: '2026-09-15T10:00',
        productores: ['productor@letiende.co'],
        porteros: ['portero@letiende.co'],
      });
      componente['etapas'].at(0).patchValue({
        nombre: 'Preventa',
        precio: 45000,
        cierraEn: '2026-08-31T19:00',
      });

      await componente['guardar']();

      expect(crearEventoMock).toHaveBeenCalledWith(
        expect.objectContaining({
          productores: ['productor@letiende.co'],
          porteros: ['portero@letiende.co'],
        }),
      );
    });

    it('guardar() como administrador en modo editar envía productores y porteros', async () => {
      const actualizarEventoMock = vi
        .fn()
        .mockResolvedValue({ exito: true, evento: eventoExistente });
      const { fixture } = configurarPrueba({ eventos: [eventoExistente], actualizarEventoMock });
      await activarConId(fixture, 'e1');
      const componente = fixture.componentInstance;
      componente['formulario'].controls.porteros.setValue(['nuevo-portero@letiende.co']);

      await componente['guardar']();

      const [, datos] = actualizarEventoMock.mock.calls[0];
      expect(datos.productores).toEqual(['productor@letiende.co']);
      expect(datos.porteros).toEqual(['nuevo-portero@letiende.co']);
    });
  });
});
