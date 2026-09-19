import {
  FlowFuelError,
  recordActivationRequestSchema,
  uuidSchema,
} from "@flowfuel/core";
import {
  createActivationStore,
  createAuditStore,
  createClientStore,
  createDb,
} from "@flowfuel/db";

import { databaseUrlFromEnv } from "../../../../../lib/env";
import { errorResponse, parseJson } from "../../../../../lib/http";
import { verifyActivationTransaction } from "../../../../../lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CREDIT_DECIMALS = 6;

function unitsToUsd(units: bigint): string {
  const whole = units / BigInt(10 ** CREDIT_DECIMALS);
  const frac = (units % BigInt(10 ** CREDIT_DECIMALS))
    .toString()
    .padStart(CREDIT_DECIMALS, "0");
  return `${whole}.${frac}`;
}

/**
 * Records an activation the client just sent from their own wallet. The chain
 * is the authority: the receipt must be a successful call to the CREDIT or
 * Exchange contract, sent by the client's wallet and emitting an Activation
 * event for that wallet. Idempotent on the transaction hash, so a retried
 * submission returns the same record.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    const { transactionHash } = recordActivationRequestSchema.parse(
      await parseJson(request),
    );

    const { db } = createDb(databaseUrlFromEnv());
    const clients = createClientStore(db);
    const activations = createActivationStore(db);
    const audit = createAuditStore(db);

    const client = await clients.getById(clientId);
    if (!client) {
      throw new FlowFuelError("NOT_FOUND", "Client not found");
    }

    const existing = await activations.getByTxHash(transactionHash);
    if (existing) {
      if (existing.clientId !== clientId) {
        throw new FlowFuelError(
          "CONFLICT",
          "This transaction is already recorded for another client",
        );
      }
      return Response.json({
        activationId: existing.activationId,
        transactionHash: existing.transactionHash,
        amountUsd: existing.amountUsd,
        blockNumber: existing.blockNumber,
        status: existing.status,
        duplicate: true,
      });
    }

    const verified = await verifyActivationTransaction(
      transactionHash,
      client.walletAddress,
    );

    const row = await activations.create({
      clientId,
      transactionHash,
      activationId: verified.activationId,
      amountUsd: unitsToUsd(verified.amountUnits),
      blockNumber: verified.blockNumber,
      status: "confirmed",
    });

    await audit.append({
      clientId,
      actorType: "client",
      eventType: "activation_recorded",
      publicData: {
        transactionHash,
        activationId: verified.activationId,
        amountUsd: row.amountUsd,
        blockNumber: verified.blockNumber,
      },
    });

    return Response.json(
      {
        activationId: row.activationId,
        transactionHash: row.transactionHash,
        amountUsd: row.amountUsd,
        blockNumber: row.blockNumber,
        status: row.status,
        duplicate: false,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
