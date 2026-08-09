import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ServicioAuth } from '../auth/servicio-auth';
import { rutaDestinoParaRol } from '../../shared/navegacion/secciones-navegacion';

/**
 * Guardia de ruta de `/login` — **solo experiencia de usuario, no
 * seguridad** (CLAUDE.md §5, A01): si ya hay sesión autorizada en Ágora,
 * redirige a una sección accesible en vez de mostrar de nuevo la pantalla
 * de ingreso. `rutaDestinoParaRol` (única fuente de esta decisión, ver su
 * docstring) prioriza la sección más específica que el rol actual cumple
 * (administrador → `/admin/usuarios`, portero → `/puerta`).
 */
export const guardiaInvitado: CanActivateFn = async () => {
  const servicioAuth = inject(ServicioAuth);
  const router = inject(Router);

  await servicioAuth.esperarListo();

  const rolActual = servicioAuth.rol();
  if (!servicioAuth.usuarioActual() || !rolActual) {
    return true;
  }

  return router.createUrlTree([rutaDestinoParaRol(rolActual)]);
};
