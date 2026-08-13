import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { absoluteUrlInterceptor } from './core/api/absolute-url.interceptor';
import { ServicioAuth } from './core/auth/servicio-auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding(): el Router asigna los parámetros de ruta a
    // Signal inputs del componente en CADA navegación, incluso cuando
    // Angular reutiliza la misma instancia por coincidir la misma
    // definición de ruta (ej. navegar de /mis-eventos/eventos/nuevo a
    // /mis-eventos/eventos/{eventoId} tras crear un evento) — sin esto, un
    // componente reutilizado queda con el parámetro "congelado" en su valor
    // de construcción (gotcha real, ver MEMORY.md §7).
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(),
    provideAnimationsAsync(),
    // withFetch(): usa la Fetch API en vez de XHR, compatible con SSR sin
    // polyfill. absoluteUrlInterceptor: ver core/api/absolute-url.interceptor.ts
    // — necesario para que las URLs relativas (`/api/...`) funcionen en SSR.
    provideHttpClient(withFetch(), withInterceptors([absoluteUrlInterceptor])),
    // Instancia ServicioAuth al arrancar la app para que el listener de
    // sesión de Firebase (onAuthStateChanged) arranque antes de que
    // GuardiaAuth/GuardiaRol evalúen sus Signals en la primera navegación.
    provideAppInitializer(() => {
      inject(ServicioAuth);
    }),
  ],
};
