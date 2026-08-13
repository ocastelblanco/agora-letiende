import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import type { Rol } from '../../core/models/usuario.model';
import { TaquillaComponent } from './taquilla.component';

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
  { path: 'taquilla/efectivo', component: ComponenteRutaDummy },
  { path: 'taquilla/puerta', component: ComponenteRutaDummy },
];

function configurarPrueba(rol: Rol | null): ComponentFixture<TaquillaComponent> {
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule],
    providers: [
      provideRouter(RUTAS),
      { provide: ServicioAuth, useValue: { rol: () => rol } },
    ],
  });

  const fixture = TestBed.createComponent(TaquillaComponent);
  fixture.detectChanges();
  return fixture;
}

describe('TaquillaComponent', () => {
  it('portero (el rol menos restrictivo del grupo) ve exactamente las tabs Efectivo y Puerta', () => {
    const fixture = configurarPrueba('portero');

    const tabs = Array.from(
      fixture.nativeElement.querySelectorAll('a[mat-tab-link]') as NodeListOf<HTMLAnchorElement>,
    );
    expect(tabs.map((a) => a.textContent?.trim())).toEqual(['Efectivo', 'Puerta']);
  });

  // No hay una prueba separada de "administrador" aquí: a diferencia de
  // "Mis Eventos" (donde "Eventos" exige `administrador` y distingue de
  // `productor`, ver mis-eventos.component.spec.ts), el grupo "Taquilla" no
  // tiene ningún tab exclusivo de un rol más restrictivo — ambos tabs
  // (`Efectivo`, `Puerta`) exigen `portero`, el mínimo de la jerarquía, así
  // que un administrador ve exactamente lo mismo que un portero. Una prueba
  // de "administrador" con el mismo resultado esperado no aportaría
  // cobertura nueva.
});
