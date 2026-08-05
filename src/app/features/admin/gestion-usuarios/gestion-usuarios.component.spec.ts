import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { UsuariosService } from '../../../core/api/usuarios.service';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import type { Usuario } from '../../../core/models/usuario.model';
import { GestionUsuariosComponent } from './gestion-usuarios.component';

// `servicio-auth.ts` (importado transitivamente vía ServicioAuth) importa
// el SDK real de Firebase a nivel de módulo — mismo motivo de mock que en
// el resto de specs que tocan ServicioAuth.
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

const usuarioPropio: Usuario = {
  email: 'admin@letiende.co',
  nombre: 'Admin',
  rol: 'administrador',
  activo: true,
  creadoEn: '2026-08-05T00:00:00.000Z',
};
const otroUsuario: Usuario = {
  email: 'portero@letiende.co',
  nombre: 'Portero',
  rol: 'portero',
  activo: true,
  creadoEn: '2026-08-05T00:00:00.000Z',
};

function configurarPrueba(opciones: {
  usuarios?: Usuario[];
  crearUsuarioMock?: ReturnType<typeof vi.fn>;
  actualizarUsuarioMock?: ReturnType<typeof vi.fn>;
  eliminarUsuarioMock?: ReturnType<typeof vi.fn>;
  dialogAfterClosed?: unknown;
}) {
  const cargarUsuariosMock = vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      {
        provide: UsuariosService,
        useValue: {
          usuarios: () => opciones.usuarios ?? [],
          error: () => false,
          cargarUsuarios: cargarUsuariosMock,
          crearUsuario: opciones.crearUsuarioMock ?? vi.fn(),
          actualizarUsuario: opciones.actualizarUsuarioMock ?? vi.fn(),
          eliminarUsuario: opciones.eliminarUsuarioMock ?? vi.fn(),
        },
      },
      {
        provide: ServicioAuth,
        useValue: { usuarioActual: () => ({ email: usuarioPropio.email }) },
      },
    ],
  });

  // Se intercepta el método sobre la instancia real (en vez de sobrescribir
  // el provider) porque MatDialog/MatSnackBar son `providedIn: 'root'` y un
  // componente standalone que importa MatDialogModule puede seguir
  // resolviendo la instancia real por su propia cadena de inyección —
  // interceptar el método garantiza que cualquier `inject(MatDialog)` vea
  // el mismo mock, sin depender de cómo se resolvió la instancia.
  const dialogOpenMock = vi
    .spyOn(TestBed.inject(MatDialog), 'open')
    .mockReturnValue({ afterClosed: () => of(opciones.dialogAfterClosed) } as never);
  const snackBarOpenMock = vi
    .spyOn(TestBed.inject(MatSnackBar), 'open')
    .mockImplementation(() => ({}) as never);

  const fixture: ComponentFixture<GestionUsuariosComponent> =
    TestBed.createComponent(GestionUsuariosComponent);
  fixture.detectChanges();

  return { fixture, cargarUsuariosMock, dialogOpenMock, snackBarOpenMock };
}

describe('GestionUsuariosComponent', () => {
  it('carga los usuarios al iniciar', () => {
    const { cargarUsuariosMock } = configurarPrueba({});

    expect(cargarUsuariosMock).toHaveBeenCalledTimes(1);
  });

  it('agregar() abre el formulario vacío en modo crear, con email y rol habilitados', () => {
    const { fixture } = configurarPrueba({});
    const componente = fixture.componentInstance;

    componente['agregar']();

    expect(componente['formularioVisible']()).toBe(true);
    expect(componente['usuarioEditandoEmail']()).toBeNull();
    expect(componente['formulario'].controls.email.disabled).toBe(false);
  });

  it('editar() precarga el formulario y deshabilita el email', () => {
    const { fixture } = configurarPrueba({ usuarios: [otroUsuario] });
    const componente = fixture.componentInstance;

    componente['editar'](otroUsuario);

    expect(componente['usuarioEditandoEmail']()).toBe(otroUsuario.email);
    expect(componente['formulario'].controls.email.disabled).toBe(true);
    expect(componente['formulario'].getRawValue()).toEqual({
      email: otroUsuario.email,
      nombre: otroUsuario.nombre,
      rol: otroUsuario.rol,
    });
  });

  it('editar() deshabilita el rol cuando la fila es la propia (salvaguarda visual)', () => {
    const { fixture } = configurarPrueba({ usuarios: [usuarioPropio] });
    const componente = fixture.componentInstance;

    componente['editar'](usuarioPropio);

    expect(componente['editandoPropiaFila']()).toBe(true);
    expect(componente['formulario'].controls.rol.disabled).toBe(true);
  });

  it('esPropiaFila distingue la fila del administrador autenticado de las demás', () => {
    const { fixture } = configurarPrueba({});
    const componente = fixture.componentInstance;

    expect(componente['esPropiaFila'](usuarioPropio)).toBe(true);
    expect(componente['esPropiaFila'](otroUsuario)).toBe(false);
  });

  it('guardar() crea un usuario nuevo cuando no se está editando', async () => {
    const crearUsuarioMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture, snackBarOpenMock } = configurarPrueba({ crearUsuarioMock });
    const componente = fixture.componentInstance;

    componente['agregar']();
    componente['formulario'].setValue({
      email: 'nuevo@letiende.co',
      nombre: 'Nuevo',
      rol: 'portero',
    });
    await componente['guardar']();

    expect(crearUsuarioMock).toHaveBeenCalledWith({
      email: 'nuevo@letiende.co',
      nombre: 'Nuevo',
      rol: 'portero',
    });
    expect(snackBarOpenMock).toHaveBeenCalledWith('Usuario creado correctamente.', 'Cerrar', {
      duration: 4000,
    });
    expect(componente['formularioVisible']()).toBe(false);
  });

  it('guardar() no llama a la API si el formulario es inválido', async () => {
    const crearUsuarioMock = vi.fn();
    const { fixture } = configurarPrueba({ crearUsuarioMock });
    const componente = fixture.componentInstance;

    componente['agregar']();
    await componente['guardar']();

    expect(crearUsuarioMock).not.toHaveBeenCalled();
  });

  it('guardar() muestra el mensaje de error del backend cuando la operación falla', async () => {
    const crearUsuarioMock = vi
      .fn()
      .mockResolvedValue({ exito: false, error: 'Ya existe ese correo' });
    const { fixture, snackBarOpenMock } = configurarPrueba({ crearUsuarioMock });
    const componente = fixture.componentInstance;

    componente['agregar']();
    componente['formulario'].setValue({
      email: 'nuevo@letiende.co',
      nombre: 'Nuevo',
      rol: 'portero',
    });
    await componente['guardar']();

    expect(snackBarOpenMock).toHaveBeenCalledWith('Ya existe ese correo', 'Cerrar', {
      duration: 6000,
    });
  });

  it('eliminar() no llama a la API si el diálogo de confirmación se cancela', async () => {
    const eliminarUsuarioMock = vi.fn();
    const { fixture, dialogOpenMock } = configurarPrueba({
      eliminarUsuarioMock,
      dialogAfterClosed: undefined,
    });
    const componente = fixture.componentInstance;

    await componente['eliminar'](otroUsuario);

    expect(dialogOpenMock).toHaveBeenCalledTimes(1);
    expect(eliminarUsuarioMock).not.toHaveBeenCalled();
  });

  it('eliminar() llama a la API cuando el diálogo se confirma', async () => {
    const eliminarUsuarioMock = vi.fn().mockResolvedValue({ exito: true });
    const { fixture, snackBarOpenMock } = configurarPrueba({
      eliminarUsuarioMock,
      dialogAfterClosed: true,
    });
    const componente = fixture.componentInstance;

    await componente['eliminar'](otroUsuario);

    expect(eliminarUsuarioMock).toHaveBeenCalledWith(otroUsuario.email);
    expect(snackBarOpenMock).toHaveBeenCalledWith('Usuario eliminado correctamente.', 'Cerrar', {
      duration: 4000,
    });
  });
});
