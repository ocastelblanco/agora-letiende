import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import { tabsVisiblesDeGrupo } from '../../shared/navegacion/secciones-navegacion';

/**
 * Hub de "Mis Eventos" (`TODO.md` Tarea 1, rediseño a pedido del usuario tras
 * probar la v1 de dos niveles en el header): agrupa Panel/Eventos/
 * Aprobaciones con Angular Material Tabs ligadas al router
 * (`mat-tab-nav-bar` + `mat-tab-nav-panel`, patrón oficial "Tabs used with
 * the router"). Las rutas hijas reales (`/mis-eventos/panel`,
 * `/mis-eventos/eventos[/:id]`, `/mis-eventos/aprobaciones`) y sus guards
 * viven en `app.routes.ts`, sin cambios — este componente solo decide qué
 * tabs mostrar según el rol, vía `tabsVisiblesDeGrupo`. Un `productor`
 * NUNCA ve la tab "Eventos" aquí: exige `rolMinimo: 'administrador'` en
 * `secciones-navegacion.ts`, y `tabsVisiblesDeGrupo` ya la filtra antes de
 * llegar a esta plantilla — el punto de autorización crítico verificado en
 * la ronda anterior.
 */
@Component({
  selector: 'app-mis-eventos',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatTabsModule],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panelTabs" class="border-b border-primary/10 bg-white px-4">
      @for (tab of tabs(); track tab.ruta) {
        <a
          mat-tab-link
          [routerLink]="tab.ruta"
          routerLinkActive
          #rla="routerLinkActive"
          [active]="rla.isActive"
        >
          {{ tab.etiqueta }}
        </a>
      }
    </nav>
    <mat-tab-nav-panel #panelTabs>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
})
export class MisEventosComponent {
  private readonly servicioAuth = inject(ServicioAuth);

  protected readonly tabs = computed(() =>
    tabsVisiblesDeGrupo('Mis Eventos', this.servicioAuth.rol()),
  );
}
