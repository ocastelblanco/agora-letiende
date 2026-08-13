import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import { tabsVisiblesDeGrupo } from '../../shared/navegacion/secciones-navegacion';

/**
 * Hub de "Taquilla" (`TODO.md` Tarea 1, rediseño a pedido del usuario tras
 * probar la v1 de dos niveles en el header): agrupa Efectivo/Puerta con
 * Angular Material Tabs ligadas al router (`mat-tab-nav-bar` +
 * `mat-tab-nav-panel`, patrón oficial "Tabs used with the router"). Las
 * rutas hijas reales (`/taquilla/efectivo`, `/taquilla/puerta`) y sus
 * guards viven en `app.routes.ts`, sin cambios — este componente solo
 * decide qué tabs mostrar según el rol (mismo filtro que
 * `BarraNavegacionComponent` usa para el nivel 1, vía `tabsVisiblesDeGrupo`).
 */
@Component({
  selector: 'app-taquilla',
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
export class TaquillaComponent {
  private readonly servicioAuth = inject(ServicioAuth);

  protected readonly tabs = computed(() =>
    tabsVisiblesDeGrupo('Taquilla', this.servicioAuth.rol()),
  );
}
