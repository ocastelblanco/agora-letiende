import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ServicioAuth } from '../auth/servicio-auth';

/**
 * Guardia de ruta — **solo experiencia de usuario, no seguridad**
 * (CLAUDE.md §5, A01): redirige a `/login` si no hay sesión autorizada en
 * Ágora. La autorización real siempre se revalida en la Lambda `api`
 * (`server/api/lib/resolver-permisos.ts`); este guard nunca es el
 * mecanismo que protege un endpoint, solo evita mostrar una pantalla vacía
 * o rota a quien no tiene sesión.
 *
 * Espera `servicioAuth.esperarListo()` antes de decidir: leer los Signals
 * antes de que Firebase resuelva el estado inicial expulsaría a un usuario
 * con sesión real solo por preguntar demasiado pronto.
 */
export const guardiaAuth: CanActivateFn = async () => {
  const servicioAuth = inject(ServicioAuth);
  const router = inject(Router);

  await servicioAuth.esperarListo();

  if (servicioAuth.usuarioActual() && servicioAuth.rol()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
