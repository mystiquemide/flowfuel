import {
  bearerToken,
  verifyWorkflowToken,
} from "@flowfuel/broker";
import {
  FlowFuelError,
  uuidSchema,
} from "@flowfuel/core";
import { workflowTokenFromEnv } from "../../../../lib/env";
import { errorResponse } from "../../../../lib/http";
import { runDeps } from "../../../../lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    if (
      !verifyWorkflowToken(
        bearerToken(request.headers.get("authorization")),
        workflowTokenFromEnv(),
      )
    ) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid workflow token");
    }

    const { runId } = await params;
    const id = uuidSchema.parse(runId);
    const run = await runDeps().runs.getById(id);
    if (!run) throw new FlowFuelError("NOT_FOUND", "Unknown runId");
    return Response.json({
      runId: run.id,
      status: run.status,
      clientId: run.clientId,
      taskHash: run.taskHash,
      generationId: run.generationId,
      costUsd: run.costUsd,
      balanceBefore: run.balanceBefore,
      balanceAfter: run.balanceAfter,
      errorCode: run.errorCode,
      upstreamStatus: run.upstreamStatus,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
