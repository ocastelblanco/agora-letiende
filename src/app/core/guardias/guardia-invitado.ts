import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ServicioAuth } from '../auth/servicio-auth';
import { SECCIONES_NAVEGACION } from '../../shared/navegacion/secciones-navegacion';
import { cumpleRolMinimo } from '../models/usuario.model';

/**
 * Guardia de ruta de `/login` — **solo experiencia de usuario, no
 * seguridad** (CLAUDE.md §5, A01): si ya hay sesión autorizada en Ágora,
 * redirige a una sección accesible en vez de mostrar de nuevo la pantalla
 * de ingreso.
 *
 * Usa `findLast` (no `find`) sobre `SECCIONES_NAVEGACION` para elegir el
 * destino: con `find`, "Cartelera" (la primera del arreglo, accesible para
 * cualquier rol) siempre ganaría, rebotando incluso a un administrador
 * hacia `/`. `findLast` prioriza la sección más específica que el rol
 * actual cumple (administrador → `/admin/usuarios`, portero → `/`).
 */
export const guardiaInvitado: CanActivateFn = async () => {
  const servicioAuth = inject(ServicioAuth);
  const router = inject(Router);

  await servicioAuth.esperarListo();

  const rolActual = servicioAuth.rol();
  if (!servicioAuth.usuarioActual() || !rolActual) {
    return true;
  }

  const seccionDestino = SECCIONES_NAVEGACION.findLast((seccion) =>
    cumpleRolMinimo(rolActual, seccion.rolMinimo),
  );

  return router.createUrlTree([seccionDestino ? seccionDestino.ruta : '/']);
};
