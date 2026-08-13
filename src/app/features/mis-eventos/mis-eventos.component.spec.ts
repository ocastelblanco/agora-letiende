import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import type { Rol } from '../../core/models/usuario.model';
import { MisEventosComponent } from './mis-eventos.component';

/** Componente vacío para registrar rutas reales en las pruebas del router-outlet. */
@Component({ selector: 'app-ruta-dummy', template: '' })
class ComponenteRutaDummy {}

// `servicio-auth.ts` (importado abajo solo como token de DI) importa el SDK
// real de Firebase a nivel de módulo — se mockea aquí para que este archivo
// nunca lo cargue de verdad (mismo motivo que en barra-navegacion.component.spec.ts).
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

const RUTAS: Routes = [
  { path: 'mis-eventos/panel', component: ComponenteRutaDummy },
  { path: 'mis-eventos/eventos', component: ComponenteRutaDummy },
  { path: 'mis-eventos/aprobaciones', component: ComponenteRutaDummy },
];

function configurarPrueba(rol: Rol | null): ComponentFixture<MisEventosComponent> {
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter(RUTAS),
      { provide: ServicioAuth, useValue: { rol: () => rol } },
    ],
  });

  const fixture = TestBed.createComponent(MisEventosComponent);
  fixture.detectChanges();
  return fixture;
}

describe('MisEventosComponent', () => {
  // Cambio de alcance DELIBERADO de TODO.md Tarea 1 (T6) respecto de la
  // tarea anterior (T5): antes, "Eventos" exigía 'administrador' y un
  // productor nunca lo veía en este hub; ahora exige 'productor'
  // (secciones-navegacion.ts), así que un productor SÍ ve las 3 tabs, igual
  // que un administrador — el productor puede editar campos puntuales de
  // sus propios eventos (server/api/handlers/eventos.ts).
  it('productor ve las 3 tabs del grupo, incluida "Eventos" (TODO.md Tarea 1, T6)', () => {
    const fixture = configurarPrueba('productor');

    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('a[mat-tab-link]') as NodeListOf<HTMLAnchorElement>,
    );
    expect(tabs.map((a) => a.textContent?.trim())).toEqual(['Panel', 'Eventos', 'Aprobaciones']);
  });

  it('administrador ve todas las tabs del grupo, incluida "Eventos"', () => {
    const fixture = configurarPrueba('administrador');

    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('a[mat-tab-link]') as NodeListOf<HTMLAnchorElement>,
    );
    expect(tabs.map((a) => a.textContent?.trim())).toEqual(['Panel', 'Eventos', 'Aprobaciones']);
  });
});
