import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { PanelService } from '../../core/api/panel.service';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import { EmbebidoService } from '../../core/embebido/embebido.service';
import { GRUPOS_NAVEGACION, tabsVisiblesDeGrupo } from './secciones-navegacion';

/**
 * Barra de navegación de toda la app (`TODO.md` Tarea 1) — **siempre
 * visible**, con o sin sesión, para ofrecer siempre una forma de llegar a
 * `/login` (decisión de diseño explícita del usuario, ver `MEMORY.md`
 * sesión 06/08/2026 noche). Ya autenticado, muestra SOLO el nivel 1 (grupo)
 * armado a partir de `GRUPOS_NAVEGACION` (sin "Cartelera" — `TODO.md`
 * Tarea 1 — el logo del header ya enlaza a `/` siempre), filtrando cada tab
 * por su propio `rolMinimo` individual — el grupo en sí nunca tiene un rol
 * propio, ver el docstring de `GrupoNavegacion` en `secciones-navegacion.ts`.
 * El nivel 2 (Efectivo/Puerta, Panel/Eventos/Aprobaciones) YA NO vive en el
 * header (rediseño a pedido del usuario tras probar la v1 de dos niveles):
 * ahora vive en el cuerpo, como pestañas de Angular Material ligadas al
 * router (`mat-tab-nav-bar`), dentro de `TaquillaComponent`/
 * `MisEventosComponent`.
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
  private readonly panelService = inject(PanelService);
  private readonly router = inject(Router);

  /**
   * `true` cuando la app se sirve embebida a través del proxy de
   * letiende.co (Host `letiende.co`/`staging.letiende.co`) — en ese caso
   * el `<header>` completo se reemplaza por la barra común del contenedor
   * (solo el estado sin sesión; el panel autenticado no se toca).
   */
  protected readonly embebido = inject(EmbebidoService).embebido;

  protected readonly usuarioActual = this.servicioAuth.usuarioActual;

  /** Controla el drawer móvil (`< 768px`) — oculto por defecto. */
  protected readonly menuAbierto = signal(false);

  /** Controla el panel móvil de la barra embebida (independiente del drawer del panel autenticado). */
  protected readonly menuEmbebidoAbierto = signal(false);
  private readonly botonMenuEmbebido = viewChild<ElementRef<HTMLButtonElement>>('botonMenuEmbebido');
  private readonly botonCerrarEmbebido = viewChild<ElementRef<HTMLButtonElement>>('botonCerrarEmbebido');

  constructor() {
    // Cuando el panel móvil embebido se abre, el foco pasa a su botón de
    // cierre — mismo patrón de accesibilidad que `BarraNavegacion` del
    // contenedor letiende.co.
    effect(() => {
      if (this.menuEmbebidoAbierto()) {
        this.botonCerrarEmbebido()?.nativeElement.focus();
      }
    });
  }

  /**
   * Ruta actual, vía `Router.events` (`NavigationEnd`) convertido con
   * `toSignal` — Angular no expone la ruta activa como signal nativo
   * todavía. Único consumo: ocultar el botón "Ingresar" en `/login`
   * (`TODO.md` Tarea 1), donde se confunde con "Ingresar con Google".
   */
  private readonly rutaActual = toSignal(
    this.router.events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      map((evento) => evento.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** `true` en `/login` — el botón "Ingresar" del header solo se oculta ahí. */
  protected readonly enLogin = computed(() => this.rutaActual() === '/login');

  /**
   * Grupos visibles para el rol actual, con sus tabs ya filtrados por
   * `rolMinimo` individual — vacío sin sesión o sin rol resuelto. Un grupo
   * sin ningún tab accesible (ej. "Usuarios" para un portero) se descarta
   * por completo, nunca se muestra vacío.
   */
  protected readonly grupos = computed(() => {
    const rolActual = this.servicioAuth.rol();
    if (!rolActual) {
      return [];
    }
    return GRUPOS_NAVEGACION.map((grupo) => ({
      etiqueta: grupo.etiqueta,
      tabs: tabsVisiblesDeGrupo(grupo.etiqueta, rolActual),
    })).filter((grupo) => grupo.tabs.length > 0);
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

  protected alternarMenuEmbebido(): void {
    this.menuEmbebidoAbierto.update((abierto) => !abierto);
  }

  protected cerrarMenuEmbebido(): void {
    if (!this.menuEmbebidoAbierto()) return;
    this.menuEmbebidoAbierto.set(false);
    this.botonMenuEmbebido()?.nativeElement.focus();
  }

  /** Último tab visible del grupo — mismo criterio que rutaDestinoParaRol: es el destino al hacer click en la etiqueta del grupo (nivel 1). */
  protected ultimoTab(grupo: { tabs: { ruta: string }[] }) {
    return grupo.tabs[grupo.tabs.length - 1];
  }

  /** Un grupo está "activo" si la ruta actual es uno de sus tabs, o una ruta hija de uno de sus tabs (ej. /mis-eventos/eventos/abc123 bajo el tab /mis-eventos/eventos). */
  protected grupoActivo(grupo: { tabs: { ruta: string }[] }): boolean {
    const ruta = this.rutaActual();
    return grupo.tabs.some((tab) => ruta === tab.ruta || ruta.startsWith(`${tab.ruta}/`));
  }

  /**
   * Cierra sesión (primer consumidor real de `ServicioAuth.cerrarSesion()`)
   * y vuelve a `/login`. También limpia `PanelService` (`detalle()` guarda
   * datos personales de clientes) — `CLAUDE.md` §5, A07: "limpia todo el
   * estado reactivo (Signals) del cliente". No se limpia dentro de
   * `ServicioAuth` porque `PanelService` ya lo inyecta a él, y la inyección
   * inversa crearía una dependencia circular en el DI de Angular.
   */
  protected async cerrarSesion(): Promise<void> {
    this.cerrarMenu();
    await this.servicioAuth.cerrarSesion();
    this.panelService.limpiar();
    await this.router.navigateByUrl('/login');
  }
}
