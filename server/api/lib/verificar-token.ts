import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Error tipado de autenticación: el handler que lo capture debe traducirlo
 * a 401, nunca filtrar el mensaje interno de Firebase (CLAUDE.md §5, A05).
 */
export class ErrorAutenticacion extends Error {}

/**
 * Inicializa la app de `firebase-admin` una sola vez por contenedor de
 * Lambda (cold start), reutilizándola en invocaciones posteriores. Usa la
 * cuenta de servicio propia de Ágora (`FIREBASE_SERVICE_ACCOUNT_AGORA`),
 * nunca la de Comandante ni la de Babel (tech-specs.md §8.1).
 */
function obtenerAppFirebase() {
  const appsExistentes = getApps();
  if (appsExistentes.length > 0) {
    return appsExistentes[0]!;
  }

  const credencialJson = process.env['FIREBASE_SERVICE_ACCOUNT_AGORA'];
  if (!credencialJson) {
    throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_AGORA');
  }

  return initializeApp({
    credential: cert(JSON.parse(credencialJson)),
  });
}

/**
 * Verifica el header `Authorization: Bearer <token>` con `verifyIdToken`
 * (valida firma, expiración y revocación) y devuelve el correo verificado.
 * Estar autenticado en el proyecto Firebase compartido no implica ninguna
 * autorización en Ágora — eso lo resuelve `resolver-permisos.ts`.
 */
export async function verificarToken(encabezadoAuthorization: string | undefined): Promise<string> {
  if (!encabezadoAuthorization?.startsWith('Bearer ')) {
    throw new ErrorAutenticacion('Falta el encabezado Authorization');
  }

  const token = encabezadoAuthorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new ErrorAutenticacion('Falta el encabezado Authorization');
  }

  // Fuera del try: un error de configuración (credencial ausente/inválida)
  // no es un token inválido — el handler debe traducirlo a 500, no a 401.
  const auth = getAuth(obtenerAppFirebase());

  try {
    const tokenDecodificado = await auth.verifyIdToken(token);
    if (!tokenDecodificado.email) {
      throw new ErrorAutenticacion('El token no contiene un correo verificado');
    }
    return tokenDecodificado.email;
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      throw error;
    }
    throw new ErrorAutenticacion('Token inválido o expirado');
  }
}
