import { S3Client } from '@aws-sdk/client-s3';

/**
 * Instancia única del cliente de S3, reutilizada entre invocaciones de una
 * misma Lambda (fuera del handler) — mismo patrón que
 * `server/api/services/dynamodb.ts`. Sin credenciales hardcodeadas: el rol
 * IAM de ejecución de cada función las provee.
 */
export const clienteS3 = new S3Client({});
