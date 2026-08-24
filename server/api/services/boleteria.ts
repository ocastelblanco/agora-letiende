import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { documentoDynamoDB } from './dynamodb';

export type EstadoBoleta = 'valida' | 'usada' | 'anulada';

export interface BoletaEmitida {
  boletaId: string;
  eventoId: string;
  compraId: string;
  numeroEnCompra: number;
  // v2 (roadmap #24) — ausente cuando la compra es de un evento sin etapas
  // de boletería (boletería opcional sin cobro).
  etapaId?: string;
  valorUnitario: number;
  estado: EstadoBoleta;
  emitidaEn: string;
}

export interface CompraParaEmision {
  compraId: string;
  eventoId: string;
  etapaId?: string;
  montoTotal: number;
  cantidad: number;
}

/**
 * Emite `compra.cantidad` boletas en `agora-boletas`, una por silla
 * comprada (`tech-specs.md` §5.5, `TODO.md` Tarea 2) — primer y único
 * consumidor por ahora es `aprobarCompra()` en `handlers/aprobaciones.ts`;
 * Venta en efectivo (roadmap #14) la reutilizará sin recrearla.
 *
 * `valorUnitario` se deriva de `montoTotal / cantidad` en vez de recibirse
 * aparte — división exacta porque `montoTotal` siempre es
 * `etapa.precio * cantidad` (calculado en el servidor, `CLAUDE.md` §5,
 * A08), así que no hace falta persistir un campo redundante.
 *
 * Cada `boletaId` es un UUID v4 (`CLAUDE.md` §5, A02) — nunca consecutivo
 * ni derivado de datos del cliente. `ConditionExpression:
 * attribute_not_exists(boletaId)` es el mismo criterio ya usado en
 * `compras.ts`/`eventos.ts`: astronómicamente improbable que colisione,
 * pero la escritura condicional es gratis y elimina la duda.
 */
export async function emitirBoletas(compra: CompraParaEmision): Promise<BoletaEmitida[]> {
  const valorUnitario = compra.montoTotal / compra.cantidad;
  const emitidaEn = new Date().toISOString();

  const boletas: BoletaEmitida[] = Array.from({ length: compra.cantidad }, (_, indice) => ({
    boletaId: randomUUID(),
    eventoId: compra.eventoId,
    compraId: compra.compraId,
    numeroEnCompra: indice + 1,
    etapaId: compra.etapaId,
    valorUnitario,
    estado: 'valida',
    emitidaEn,
  }));

  await Promise.all(
    boletas.map((boleta) =>
      documentoDynamoDB.send(
        new PutCommand({
          TableName: process.env['TABLA_BOLETAS'],
          Item: boleta,
          ConditionExpression: 'attribute_not_exists(boletaId)',
        }),
      ),
    ),
  );

  return boletas;
}
