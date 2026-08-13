import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { firstValueFrom } from 'rxjs';
import { UsuariosService } from '../../../core/api/usuarios.service';
import { ServicioAuth } from '../../../core/auth/servicio-auth';
import { DatosNuevoUsuario, DatosUsuario, Rol, Usuario } from '../../../core/models/usuario.model';
import { ConfirmarDialogComponent } from '../../../shared/dialogos/confirmar-dialog.component';

/**
 * Ruta protegida `/usuarios` (`guardiaRol`, `data: { rolMinimo: 'administrador' }`
 * en `app.routes.ts`; `tech-specs.md` §4.2, `TODO.md` Tarea 1) — CRUD de
 * `agora-usuarios`. Un único formulario reactivo se reutiliza para crear y
 * editar: `usuarioEditandoEmail` distingue el modo (`null` = crear, un
 * `email` = editando esa fila). El `email` es la clave primaria
 * suministrada por el administrador al crear, así que su control se
 * deshabilita al editar. La autorización real siempre la revalida el
 * backend (`CLAUDE.md` §5, A01) — este componente nunca decide por sí
 * mismo si el usuario puede escribir.
 *
 * Salvaguarda visual (el backend ya bloquea con un `400`, ver
 * `server/api/handlers/usuarios.ts`): se compara cada fila contra
 * `servicioAuth.usuarioActual()?.email` — en la fila propia se deshabilita
 * el botón "Eliminar" y, al editarla, se deshabilita el `<mat-select>` de
 * rol (queda fijo en `administrador`). Así el usuario nunca depende de
 * descubrir la restricción por un mensaje de error del backend.
 */
@Component({
  selector: 'app-gestion-usuarios',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
  ],
  templateUrl: './gestion-usuarios.component.html',
})
export class GestionUsuariosComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly usuariosService = inject(UsuariosService);
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly columnas = ['nombre', 'email', 'rol', 'activo', 'acciones'];
  protected readonly errorCarga = this.usuariosService.error;
  protected readonly usuarios = this.usuariosService.usuarios;

  /** Correo del administrador autenticado — `null` si aún no se resolvió la sesión. */
  protected readonly emailPropio = computed(() => this.servicioAuth.usuarioActual()?.email ?? null);

  protected readonly guardando = signal(false);
  protected readonly eliminandoEmail = signal<string | null>(null);

  /** Controla si el formulario de creación/edición está desplegado — oculto por defecto. */
  protected readonly formularioVisible = signal(false);

  /** `null` mientras se crea un usuario nuevo; el `email` de la fila mientras se edita. */
  protected readonly usuarioEditandoEmail = signal<string | null>(null);

  /** `true` cuando la fila en edición es la del propio administrador autenticado. */
  protected readonly editandoPropiaFila = computed(() => {
    const email = this.usuarioEditandoEmail();
    return email !== null && email === this.emailPropio();
  });

  protected readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    nombre: ['', Validators.required],
    rol: ['portero' as Rol, Validators.required],
  });

  ngOnInit(): void {
    void this.usuariosService.cargarUsuarios();
  }

  /** `true` si el `email` de la fila coincide con el del administrador autenticado. */
  protected esPropiaFila(usuario: Usuario): boolean {
    return usuario.email === this.emailPropio();
  }

  /** Limpia cualquier estado de edición previo y abre el formulario vacío en modo "crear". */
  protected agregar(): void {
    this.usuarioEditandoEmail.set(null);
    this.formulario.reset({ email: '', nombre: '', rol: 'portero' });
    this.formulario.controls.email.enable();
    this.formulario.controls.rol.enable();
    this.formularioVisible.set(true);
  }

  /**
   * Precarga el formulario con los datos de la fila, deshabilita `email`
   * (clave primaria, no editable) y entra en modo edición. Si la fila es
   * la del propio administrador autenticado, además deshabilita `rol`.
   */
  protected editar(usuario: Usuario): void {
    this.usuarioEditandoEmail.set(usuario.email);
    this.formulario.setValue({ email: usuario.email, nombre: usuario.nombre, rol: usuario.rol });
    this.formulario.controls.email.disable();
    if (this.esPropiaFila(usuario)) {
      this.formulario.controls.rol.disable();
    } else {
      this.formulario.controls.rol.enable();
    }
    this.formularioVisible.set(true);
  }

  /** Sale del modo edición, limpia y oculta el formulario, sin guardar cambios. */
  protected cancelarEdicion(): void {
    this.usuarioEditandoEmail.set(null);
    this.formulario.reset({ email: '', nombre: '', rol: 'portero' });
    this.formulario.controls.email.enable();
    this.formulario.controls.rol.enable();
    this.formularioVisible.set(false);
  }

  protected async guardar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const emailEditando = this.usuarioEditandoEmail();

    this.guardando.set(true);
    try {
      const resultado = emailEditando
        ? await this.usuariosService.actualizarUsuario(emailEditando, {
            nombre: valores.nombre,
            rol: valores.rol,
          } satisfies DatosUsuario)
        : await this.usuariosService.crearUsuario({
            email: valores.email,
            nombre: valores.nombre,
            rol: valores.rol,
          } satisfies DatosNuevoUsuario);

      if (resultado.exito) {
        this.snackBar.open(
          emailEditando ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.',
          'Cerrar',
          { duration: 4000 },
        );
        this.cancelarEdicion();
      } else {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async eliminar(usuario: Usuario): Promise<void> {
    const referenciaDialogo = this.dialog.open(ConfirmarDialogComponent, {
      data: {
        titulo: 'Eliminar usuario',
        mensaje: `¿Eliminar a "${usuario.nombre}" (${usuario.email})? Esta acción no se puede deshacer.`,
      },
    });
    const confirmado = await firstValueFrom(referenciaDialogo.afterClosed());
    if (confirmado !== true) {
      return;
    }

    this.eliminandoEmail.set(usuario.email);
    try {
      const resultado = await this.usuariosService.eliminarUsuario(usuario.email);
      if (resultado.exito) {
        this.snackBar.open('Usuario eliminado correctamente.', 'Cerrar', { duration: 4000 });
        if (this.usuarioEditandoEmail() === usuario.email) {
          this.cancelarEdicion();
        }
      } else {
        this.snackBar.open(resultado.error, 'Cerrar', { duration: 6000 });
      }
    } finally {
      this.eliminandoEmail.set(null);
    }
  }
}
