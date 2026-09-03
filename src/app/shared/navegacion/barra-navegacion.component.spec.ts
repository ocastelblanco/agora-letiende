import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import type { User } from 'firebase/auth';
import { PanelService } from '../../core/api/panel.service';
import { ServicioAuth } from '../../core/auth/servicio-auth';
import { EmbebidoService } from '../../core/embebido/embebido.service';
import type { Rol } from '../../core/models/usuario.model';
import { BarraNavegacionComponent } from './barra-navegacion.component';

/** Componente vacío para registrar rutas reales en las pruebas que navegan. */
@Component({ selector: 'app-ruta-dummy', template: '' })
class ComponenteRutaDummy {}

// `servicio-auth.ts` (importado abajo solo como token de DI) importa el SDK
// real de Firebase a nivel de módulo — se mockea aquí para que este archivo
// nunca lo cargue de verdad (mismo motivo que en login.component.spec.ts).
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

/** Rutas de personal usadas en las pruebas que navegan, para que el Router pueda resolverlas. */
const RUTAS_PERSONAL: Routes = [
  { path: 'login', component: ComponenteRutaDummy },
  { path: 'usuarios', component: ComponenteRutaDummy },
  { path: 'taquilla/efectivo', component: ComponenteRutaDummy },
  { path: 'taquilla/puerta', component: ComponenteRutaDummy },
  { path: 'mis-eventos/panel', component: ComponenteRutaDummy },
  { path: 'mis-eventos/eventos', component: ComponenteRutaDummy },
  { path: 'mis-eventos/aprobaciones', component: ComponenteRutaDummy },
];

function configurarPrueba(
  usuarioActual: User | null,
  rol: Rol | null,
  cerrarSesionMock = vi.fn().mockResolvedValue(undefined),
  limpiarPanelMock = vi.fn(),
  rutas: Routes = [],
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(rutas),
      {
        provide: ServicioAuth,
        useValue: {
          usuarioActual: () => usuarioActual,
          rol: () => rol,
          cerrarSesion: cerrarSesionMock,
        },
      },
      { provide: PanelService, useValue: { limpiar: limpiarPanelMock } },
    ],
  });

  const fixture: ComponentFixture<BarraNavegacionComponent> =
    TestBed.createComponent(BarraNavegacionComponent);
  fixture.detectChanges();

  return { fixture, cerrarSesionMock, limpiarPanelMock };
}

describe('BarraNavegacionComponent', () => {
  it('sin sesión: muestra el logo y el botón "Ingresar" como icon button accesible, sin secciones ni avatar', () => {
    const { fixture } = configurarPrueba(null, null);
    const texto = fixture.nativeElement.textContent as string;

    const enlaceIngresar = fixture.nativeElement.querySelector(
      'a[aria-label="Ingresar"]',
    ) as HTMLAnchorElement;
    expect(enlaceIngresar).toBeTruthy();
    expect(enlaceIngresar.getAttribute('href')).toBe('/login');
    expect(enlaceIngresar.textContent?.trim()).toBe('');
    expect(texto).not.toContain('Ingresar');
    expect(texto).not.toContain('Cerrar sesión');
    expect(fixture.nativeElement.querySelectorAll('nav a').length).toBe(0);
  });

  it('el botón "Ingresar" no se renderiza en /login (se confunde con "Ingresar con Google")', async () => {
    const { fixture } = configurarPrueba(null, null, undefined, undefined, [
      { path: 'login', component: ComponenteRutaDummy },
    ]);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/login');
    fixture.detectChanges();

    const enlaceIngresar = fixture.nativeElement.querySelector('a[aria-label="Ingresar"]');
    expect(enlaceIngresar).toBeNull();
  });

  it('administrador ve "Usuarios" (tab único) y "Mis Eventos" (grupo, nivel 1), pero ya no Cartelera ni un enlace navegable a "Eventos" suelto', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Usuarios');
    expect(texto).toContain('Mis Eventos');
    // "Eventos" no aparece como enlace navegable de nivel 1 suelto: solo
    // dentro de la fila de tabs de nivel 2, que no se muestra sin navegar a
    // un tab de "Mis Eventos" (ningún grupo está activo por defecto en el
    // fixture). No se puede usar `texto.not.toContain('Eventos')` porque el
    // grupo se llama literalmente "Mis Eventos", que contiene esa subcadena.
    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('nav a') as NodeListOf<HTMLAnchorElement>,
    );
    expect(enlaces.map((a) => a.textContent?.trim())).not.toContain('Eventos');
    expect(enlaces.map((a) => a.getAttribute('href'))).not.toContain('/mis-eventos/eventos');
    expect(texto).toContain('Cerrar sesión');
  });

  it('portero ve "Taquilla" (grupo, nivel 1) en vez de "Efectivo"/"Puerta" sueltos', () => {
    const usuario = { displayName: 'Pedro Portero', email: 'pedro@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'portero');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Taquilla');
    expect(texto).not.toContain('Efectivo');
    expect(texto).not.toContain('Puerta');
    expect(texto).not.toContain('Aprobaciones');
    expect(texto).not.toContain('Eventos');
    expect(texto).not.toContain('Usuarios');
  });

  it('productor ve "Mis Eventos" (grupo) en vez de "Panel"/"Aprobaciones" sueltos, y tampoco ve Cartelera', () => {
    const usuario = { displayName: 'Paula Productora', email: 'paula@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'productor');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).not.toContain('Cartelera');
    expect(texto).toContain('Mis Eventos');
    expect(texto).not.toContain('Panel');
    expect(texto).not.toContain('Aprobaciones');
  });

  // Estas dos pruebas siguen vigentes sin cambios tras TODO.md Tarea 1 (T6):
  // "Eventos" pasó a exigir 'productor' (antes 'administrador'), pero el
  // invariante que se prueba aquí es otro — este componente (header) nunca
  // renderiza un enlace de NIVEL 2 para ningún rol, solo el link de grupo
  // "Mis Eventos" (nivel 1). El acceso real de un productor a "Eventos" se
  // prueba en mis-eventos.component.spec.ts (el hub que sí tiene nivel 2).
  it('regresión de autorización: un productor NUNCA tiene un enlace navegable a "Eventos" en el header, ni siquiera navegando a /mis-eventos/panel — el header ya no tiene nivel 2 (rediseño), solo el link de grupo "Mis Eventos"', async () => {
    const usuario = {
      displayName: 'Paula Productora',
      email: 'paula@letiende.co',
      photoURL: null,
    } as User;
    const { fixture } = configurarPrueba(usuario, 'productor', undefined, undefined, RUTAS_PERSONAL);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/mis-eventos/panel');
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Mis Eventos');
    // No se puede usar `texto.not.toContain('Eventos')`: el grupo se llama
    // literalmente "Mis Eventos", que contiene esa subcadena. Se prueba en
    // cambio que ningún `<a>` real de la nav tenga ese texto exacto ni ese
    // href — la prueba real de la regla de autorización.
    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('nav a') as NodeListOf<HTMLAnchorElement>,
    );
    expect(enlaces.map((a) => a.textContent?.trim())).not.toContain('Eventos');
    expect(enlaces.map((a) => a.getAttribute('href'))).not.toContain('/mis-eventos/eventos');
  });

  it('regresión de autorización (drawer móvil): un productor NUNCA tiene un enlace navegable a "Eventos" en el drawer móvil, ni siquiera navegando a /mis-eventos/panel — la barra es mobile-first (CLAUDE.md §1), esta rama del DOM es la que más importa proteger', async () => {
    const usuario = {
      displayName: 'Paula Productora',
      email: 'paula@letiende.co',
      photoURL: null,
    } as User;
    const { fixture } = configurarPrueba(usuario, 'productor', undefined, undefined, RUTAS_PERSONAL);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/mis-eventos/panel');
    fixture.detectChanges();

    const botonAbrirMenu = fixture.nativeElement.querySelector(
      'button[aria-label="Abrir menú de navegación"]',
    ) as HTMLButtonElement;
    expect(botonAbrirMenu).toBeTruthy();
    botonAbrirMenu.click();
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('.md\\:hidden nav[aria-label="Navegación principal"]');
    expect(drawer).toBeTruthy();
    const textoDrawer = (drawer as HTMLElement).textContent as string;
    expect(textoDrawer).toContain('Mis Eventos');

    const enlacesDrawer = Array.from(
      drawer!.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    );
    expect(enlacesDrawer.map((a) => a.textContent?.trim())).not.toContain('Eventos');
    expect(enlacesDrawer.map((a) => a.getAttribute('href'))).not.toContain('/mis-eventos/eventos');
  });

  it('muestra el avatar con photoURL con referrerpolicy="no-referrer"', () => {
    const usuario = {
      displayName: 'Ana Admin',
      email: 'ana@letiende.co',
      photoURL: 'https://lh3.googleusercontent.com/foto.jpg',
    } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');

    const img = fixture.nativeElement.querySelector('img[alt="Ana Admin"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('sin photoURL, muestra un avatar de respaldo con la inicial del nombre', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPrueba(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('A');
  });

  it('"Cerrar sesión" invoca servicioAuth.cerrarSesion() y navega a /login', async () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture, cerrarSesionMock } = configurarPrueba(usuario, 'administrador');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const botonCerrarSesion = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((boton) => boton.textContent?.includes('Cerrar sesión'));
    botonCerrarSesion?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(cerrarSesionMock).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('"Cerrar sesión" también limpia PanelService (datos personales de clientes, CLAUDE.md §5 A07)', async () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture, limpiarPanelMock } = configurarPrueba(usuario, 'administrador');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const botonCerrarSesion = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((boton) => boton.textContent?.includes('Cerrar sesión'));
    botonCerrarSesion?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(limpiarPanelMock).toHaveBeenCalledTimes(1);
  });
});

/** Configura la barra con `EmbebidoService.embebido` forzado a `true` (override de TestBed), simulando una petición servida a través del proxy de letiende.co. */
function configurarPruebaEmbebida(
  usuarioActual: User | null = null,
  rol: Rol | null = null,
) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ServicioAuth,
        useValue: {
          usuarioActual: () => usuarioActual,
          rol: () => rol,
          cerrarSesion: vi.fn().mockResolvedValue(undefined),
        },
      },
      { provide: PanelService, useValue: { limpiar: vi.fn() } },
      { provide: EmbebidoService, useValue: { embebido: true } },
    ],
  });

  const fixture: ComponentFixture<BarraNavegacionComponent> =
    TestBed.createComponent(BarraNavegacionComponent);
  fixture.detectChanges();

  return { fixture };
}

describe('embebido (letiende.co)', () => {
  it('renderiza la barra común del contenedor con los 5 enlaces planos (no routerLink), sin "Ingresar" ni contenido del panel autenticado, aunque haya sesión', () => {
    const usuario = { displayName: 'Ana Admin', email: 'ana@letiende.co', photoURL: null } as User;
    const { fixture } = configurarPruebaEmbebida(usuario, 'administrador');
    const texto = fixture.nativeElement.textContent as string;

    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    );
    const hrefsEsperados = [
      '/cartelera',
      '/libros',
      '/nosotros',
      '/contacto',
      '/preguntas-frecuentes',
    ];
    for (const href of hrefsEsperados) {
      const enlace = enlaces.find((a) => a.getAttribute('href') === href);
      expect(enlace).toBeTruthy();
      expect(enlace?.hasAttribute('routerLink')).toBe(false);
    }

    expect(texto).not.toContain('Ingresar');
    expect(texto).not.toContain('Cerrar sesión');
    expect(texto).not.toContain('Usuarios');
    expect(texto).not.toContain('Mis Eventos');
    expect(fixture.nativeElement.querySelector('a[aria-label="Ingresar"]')).toBeNull();
  });

  it('el panel móvil embebido abre y cierra, moviendo el foco al botón de cerrar y de vuelta al botón de menú', () => {
    const { fixture } = configurarPruebaEmbebida();

    const botonMenu = fixture.nativeElement.querySelector(
      'button[aria-controls="panel-menu-movil-embebido"]',
    ) as HTMLButtonElement;
    expect(botonMenu).toBeTruthy();

    botonMenu.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('#panel-menu-movil-embebido');
    expect(panel).toBeTruthy();
    const botonCerrar = fixture.nativeElement.querySelector(
      '#panel-menu-movil-embebido button[aria-label="Cerrar menú"]',
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(botonCerrar);

    botonCerrar.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#panel-menu-movil-embebido')).toBeNull();
    expect(document.activeElement).toBe(botonMenu);
  });
});
