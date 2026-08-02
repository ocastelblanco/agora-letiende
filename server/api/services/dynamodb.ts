import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Instancia única del cliente de documentos de DynamoDB, reutilizada entre
 * invocaciones de una misma Lambda (fuera del handler). Sin credenciales
 * hardcodeadas: el rol IAM de ejecución de cada función las provee.
 */
const clienteDynamoDB = new DynamoDBClient({});

export const documentoDynamoDB = DynamoDBDocumentClient.from(clienteDynamoDB, {
  marshallOptions: { removeUndefinedValues: true },
});
