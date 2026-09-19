import {
  bearerToken,
  executeRun,
  verifyWorkflowToken,
} from "@flowfuel/broker";
import {
  FlowFuelError,
  runRequestSchema,
} from "@flowfuel/core";
import {
  createClientStore,
  createDb,
  createRunStore,
} from "@flowfuel/db";

import { databaseUrlFromEnv, workflowTokenFromEnv } from "../../../lib/env";
import { errorResponse, parseJson } from "../../../lib/http";
import { runDeps } from "../../../lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public run listing. Every field is already exposed on the per-run receipt
 * route, so this read carries no secrets. Optional filters: clientId and
 * workflowRunId (the proof page groups sibling runs by it).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const workflowRunId = url.searchParams.get("workflowRunId");
    const clientId = url.searchParams.get("clientId") ?? undefined;
    const limitParam = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitParam)
      ? Math.min(Math.max(limitParam, 1), 100)
      : 50;

    const { db } = createDb(databaseUrlFromEnv());
    const runs = createRunStore(db);
    const rows = workflowRunId
      ? await runs.listByWorkflowRunId(workflowRunId)
      : await runs.listRecent(limit, clientId);

    const clients = createClientStore(db);
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(rows.map((row) => row.clientId))].map(async (id) => {
        const client = await clients.getById(id);
        if (client) names.set(id, client.displayName);
      }),
    );

    return Response.json({
      runs: rows.map((run) => ({
        runId: run.id,
        clientId: run.clientId,
        clientName: names.get(run.clientId) ?? null,
        status: run.status,
        taskType: run.taskType,
        taskHash: run.taskHash,
        model: run.model,
        workflowRunId: run.workflowRunId,
        generationId: run.generationId,
        balanceBefore: run.balanceBefore,
        balanceAfter: run.balanceAfter,
        costUsd: run.costUsd,
        errorCode: run.errorCode,
        upstreamStatus: run.upstreamStatus,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    if (
      !verifyWorkflowToken(
        bearerToken(request.headers.get("authorization")),
        workflowTokenFromEnv(),
      )
    ) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid workflow token");
    }

    const parsed = runRequestSchema.safeParse(await parseJson(request));
    if (!parsed.success) {
      throw new FlowFuelError(
        "VALIDATION_FAILED",
        "Run request failed schema validation",
      );
    }

    const response = await executeRun(runDeps(), parsed.data);
    return Response.json(response, {
      status: response.status === "succeeded" ? 200 : 422,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
