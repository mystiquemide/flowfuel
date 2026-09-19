import {
  FlowFuelError,
  toPublicReceipt,
  unitsToDecimal,
  walletAddressSchema,
  uuidSchema,
  type ReceiptSource,
} from "@flowfuel/core";

import { errorResponse } from "../../../../../lib/http";
import { runDeps } from "../../../../../lib/services";
import { publicProofRunIds } from "../../../../../lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public proof receipt. The response body passes through toPublicReceipt,
 * whose strict allowlist is the only thing between a run row and the
 * outside world, so no workflow token is required.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const id = uuidSchema.parse(runId);
    if (!publicProofRunIds().has(id)) {
      throw new FlowFuelError("NOT_FOUND", "Public receipt not found");
    }
    const deps = runDeps();
    const run = await deps.runs.getById(id);
    if (!run) throw new FlowFuelError("NOT_FOUND", "Unknown runId");
    const client = await deps.clients.getById(run.clientId);
    if (!client) throw new FlowFuelError("NOT_FOUND", "Unknown client");
    const refuelRow = await deps.refuels?.getByRunId(id);
    const refuel =
      refuelRow?.transactionHash &&
      refuelRow.usdgSpent &&
      refuelRow.creditOut &&
      refuelRow.activationId
        ? {
            transactionHash: refuelRow.transactionHash,
            beneficiary: walletAddressSchema.parse(refuelRow.beneficiaryAddress),
            usdgSpent: unitsToDecimal(BigInt(refuelRow.usdgSpent)),
            creditOut: unitsToDecimal(BigInt(refuelRow.creditOut)),
            activationId: refuelRow.activationId,
            status: refuelRow.status,
          }
        : null;

    const source: ReceiptSource = {
      id: run.id,
      clientWallet: client.walletAddress,
      workflowRunId: run.workflowRunId,
      taskHash: run.taskHash,
      model: run.model,
      status: run.status,
      generationId: run.generationId,
      generations: run.generations,
      balanceBefore: run.balanceBefore,
      costUsd: run.costUsd,
      balanceAfter: run.balanceAfter,
      upstreamStatus: run.upstreamStatus,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      refuel,
    };
    return Response.json(toPublicReceipt(source, run.activationTxHash));
  } catch (error) {
    return errorResponse(error);
  }
}
