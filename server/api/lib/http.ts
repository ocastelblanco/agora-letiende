import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export function respuestaJson(statusCode: number, cuerpo: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    body: JSON.stringify(cuerpo),
  };
}

export function obtenerEncabezadoAuthorization(evento: APIGatewayProxyEventV2): string | undefined {
  const encabezados = evento.headers ?? {};
  return encabezados['authorization'] ?? encabezados['Authorization'];
}
