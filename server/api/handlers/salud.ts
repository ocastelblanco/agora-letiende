import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

/**
 * Endpoint mínimo de verificación (`GET /api/salud`).
 *
 * Placeholder sin lógica de negocio ni dependencias de DynamoDB: solo
 * confirma que la Lambda `salud` y el API Gateway están correctamente
 * desplegados de punta a punta (tech-specs.md §5.1, TODO.md Tarea 2).
 */
export const handler: APIGatewayProxyHandlerV2 = async (): Promise<APIGatewayProxyResultV2> => {
  const cuerpoRespuesta = {
    estado: 'ok',
    stage: process.env['STAGE'] ?? 'desconocido',
    version: process.env['VERSION'] ?? '0.0.0',
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpoRespuesta),
  };
};
