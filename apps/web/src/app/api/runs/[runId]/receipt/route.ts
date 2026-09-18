import {
  FlowFuelError,
  toPublicReceipt,
  uuidSchema,
  type ReceiptSource,
} from "@flowfuel/core";

import { errorResponse } from "../../../../../lib/http";
import { runDeps } from "../../../../../lib/services";

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
    const deps = runDeps();
    const run = await deps.runs.getById(id);
    if (!run) throw new FlowFuelError("NOT_FOUND", "Unknown runId");
    const client = await deps.clients.getById(run.clientId);
    if (!client) throw new FlowFuelError("NOT_FOUND", "Unknown client");

    const activation = await deps.activations
      .latestForClient(run.clientId)
      .catch(() => null);
    const source: ReceiptSource = {
      id: run.id,
      clientWallet: client.walletAddress,
      workflowRunId: run.workflowRunId,
      taskHash: run.taskHash,
      model: run.model,
      status: run.status,
      generationId: run.generationId,
      balanceBefore: run.balanceBefore,
      costUsd: run.costUsd,
      balanceAfter: run.balanceAfter,
      upstreamStatus: run.upstreamStatus,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    };
    return Response.json(toPublicReceipt(source, activation?.transactionHash ?? null));
  } catch (error) {
    return errorResponse(error);
  }
}
