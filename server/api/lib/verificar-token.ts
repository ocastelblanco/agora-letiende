import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Error tipado de autenticación: el handler que lo capture debe traducirlo
 * a 401, nunca filtrar el mensaje interno de Firebase (CLAUDE.md §5, A05).
 */
export type MotivoAutenticacion = 'sin_token' | 'token_invalido';

export class ErrorAutenticacion extends Error {
  readonly motivo: MotivoAutenticacion;

  constructor(mensaje: string, motivo: MotivoAutenticacion = 'token_invalido') {
    super(mensaje);
    this.motivo = motivo;
  }
}

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
 * La revisión de revocación (`checkRevoked`) es una llamada a Firebase que
 * en staging sumó 150–380 ms por petición. Su resultado se guarda en memoria
 * del contenedor, por token, durante 5 minutos: en una ráfaga de escaneos
 * en la puerta solo la primera petición la paga. Revocar o deshabilitar una
 * cuenta corta el acceso en ≤ 5 minutos.
 */
export const VIGENCIA_REVISION_REVOCACION_MS = 5 * 60_000;
const MAX_TOKENS_EN_CACHE = 500;
const revisionesVigentes = new Map<string, number>();

function revocacionRevisadaHace(token: string, ahora: number): boolean {
  const revisadoEn = revisionesVigentes.get(token);
  return revisadoEn !== undefined && ahora - revisadoEn < VIGENCIA_REVISION_REVOCACION_MS;
}

function recordarRevision(token: string, ahora: number): void {
  if (revisionesVigentes.size >= MAX_TOKENS_EN_CACHE) {
    for (const [llave, revisadoEn] of revisionesVigentes) {
      if (ahora - revisadoEn >= VIGENCIA_REVISION_REVOCACION_MS) {
        revisionesVigentes.delete(llave);
      }
    }
    if (revisionesVigentes.size >= MAX_TOKENS_EN_CACHE) {
      revisionesVigentes.clear();
    }
  }
  revisionesVigentes.set(token, ahora);
}

/** Solo para pruebas: vacía el caché de revisiones de revocación. */
export function reiniciarCacheRevocacion(): void {
  revisionesVigentes.clear();
}

/**
 * Verifica el header `Authorization: Bearer <token>` con `verifyIdToken` y
 * devuelve el correo verificado. Valida firma y expiración siempre, y con
 * `checkRevoked` que la sesión no fue revocada ni la cuenta deshabilitada
 * (ver el caché de arriba). Exige `email_verified`: el proyecto Firebase es
 * compartido y un proveedor que no verifique el correo permitiría usar el
 * de otra persona.
 * Estar autenticado en el proyecto Firebase compartido no implica ninguna
 * autorización en Ágora — eso lo resuelve `resolver-permisos.ts`.
 */
export async function verificarToken(encabezadoAuthorization: string | undefined): Promise<string> {
  if (!encabezadoAuthorization?.startsWith('Bearer ')) {
    throw new ErrorAutenticacion('Falta el encabezado Authorization', 'sin_token');
  }

  const token = encabezadoAuthorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new ErrorAutenticacion('Falta el encabezado Authorization', 'sin_token');
  }

  // Fuera del try: un error de configuración (credencial ausente/inválida)
  // no es un token inválido — el handler debe traducirlo a 500, no a 401.
  const auth = getAuth(obtenerAppFirebase());

  try {
    const ahora = Date.now();
    const revisarRevocacion = !revocacionRevisadaHace(token, ahora);
    const tokenDecodificado = await auth.verifyIdToken(token, revisarRevocacion);
    if (!tokenDecodificado.email || tokenDecodificado.email_verified !== true) {
      throw new ErrorAutenticacion('El token no contiene un correo verificado');
    }
    if (revisarRevocacion) {
      recordarRevision(token, ahora);
    }
    return tokenDecodificado.email;
  } catch (error) {
    if (error instanceof ErrorAutenticacion) {
      throw error;
    }
    throw new ErrorAutenticacion('Token inválido o expirado');
  }
}
