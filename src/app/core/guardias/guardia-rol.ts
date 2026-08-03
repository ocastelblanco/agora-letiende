import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { ServicioAuth } from '../auth/servicio-auth';
import { Rol, cumpleRolMinimo } from '../models/usuario.model';

/**
 * Guardia de ruta — **solo experiencia de usuario, no seguridad**
 * (CLAUDE.md §5, A01): verifica que el rol resuelto por `ServicioAuth`
 * cumpla el rol mínimo declarado en `data: { rolMinimo }` de la ruta
 * (`tech-specs.md` §4.2, ej. `data: { rolMinimo: 'productor' }`), usando la
 * misma jerarquía `administrador > productor > portero` que
 * `server/api/lib/resolver-permisos.ts` — nunca la vuelve a inventar
 * (`src/app/core/models/usuario.model.ts` es la única copia del lado del
 * cliente). El backend siempre revalida el rol real por su cuenta.
 *
 * Sin sesión autorizada, sin `rolMinimo` declarado, o con rol insuficiente,
 * redirige a `/login` — todavía no existe una pantalla de "acceso
 * denegado" propia, se revisará cuando haya rutas protegidas reales que la
 * necesiten.
 */
export const guardiaRol: CanActivateFn = async (ruta: ActivatedRouteSnapshot) => {
  const servicioAuth = inject(ServicioAuth);
  const router = inject(Router);

  await servicioAuth.esperarListo();

  const rolMinimo = ruta.data['rolMinimo'] as Rol | undefined;
  const rolActual = servicioAuth.rol();

  if (
    rolMinimo &&
    servicioAuth.usuarioActual() &&
    rolActual &&
    cumpleRolMinimo(rolActual, rolMinimo)
  ) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
