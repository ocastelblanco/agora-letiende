import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import { cumpleRolMinimo } from '../../core/models/usuario.model';
import { SECCIONES_NAVEGACION } from './secciones-navegacion';

/**
 * Barra de navegación de toda la app (`TODO.md` Tarea 1) — **siempre
 * visible**, con o sin sesión, para ofrecer siempre una forma de llegar a
 * `/login` (decisión de diseño explícita del usuario, ver `MEMORY.md`
 * sesión 06/08/2026 noche). Ya autenticado, muestra las secciones que el
 * rol actual cumple según `SECCIONES_NAVEGACION`, incluyendo "Cartelera"
 * para que el personal también pueda saltar a la interfaz pública desde el
 * mismo menú.
 *
 * Sin `@Input()`: todo el estado sale de `ServicioAuth` inyectado
 * directamente. Sin Angular Material nuevo (`MatToolbar`/`MatSidenav`/
 * `MatMenu`/`MatIcon`) — este componente lo carga `App` de forma *eager*,
 * así que un módulo Material adicional aquí pesaría en el bundle inicial
 * de toda página, incluida la cartelera pública para visitantes anónimos.
 * El drawer móvil (`< 768px`) es `signal(false)` + `@if` + Tailwind, mismo
 * patrón que `formularioVisible` de `GestionUsuariosComponent`.
 */
@Component({
  selector: 'app-barra-navegacion',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './barra-navegacion.component.html',
})
export class BarraNavegacionComponent {
  private readonly servicioAuth = inject(ServicioAuth);
  private readonly router = inject(Router);

  protected readonly usuarioActual = this.servicioAuth.usuarioActual;

  /** Controla el drawer móvil (`< 768px`) — oculto por defecto. */
  protected readonly menuAbierto = signal(false);

  /** Secciones visibles para el rol actual — vacío sin sesión o sin rol resuelto. */
  protected readonly secciones = computed(() => {
    const rolActual = this.servicioAuth.rol();
    if (!rolActual) {
      return [];
    }
    return SECCIONES_NAVEGACION.filter((seccion) => cumpleRolMinimo(rolActual, seccion.rolMinimo));
  });

  /** Inicial del nombre (o correo) del usuario actual, para el avatar de respaldo sin foto. */
  protected readonly inicial = computed(() => {
    const usuario = this.usuarioActual();
    const fuente = usuario?.displayName ?? usuario?.email ?? '?';
    return fuente.charAt(0).toUpperCase();
  });

  protected cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  protected alternarMenu(): void {
    this.menuAbierto.set(!this.menuAbierto());
  }

  /** Cierra sesión (primer consumidor real de `ServicioAuth.cerrarSesion()`) y vuelve a `/login`. */
  protected async cerrarSesion(): Promise<void> {
    this.cerrarMenu();
    await this.servicioAuth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
