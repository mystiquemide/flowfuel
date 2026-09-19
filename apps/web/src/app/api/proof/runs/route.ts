import { createClientStore, createDb, createRunStore } from "@flowfuel/db";
import { databaseUrlFromEnv, publicProofRunIds } from "../../../../lib/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const allowed = publicProofRunIds();
  const { db } = createDb(databaseUrlFromEnv());
  const runs = createRunStore(db);
  const clients = createClientStore(db);
  const rows = (await Promise.all([...allowed].map((id) => runs.getById(id))))
    .filter((row) => row !== null)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const names = new Map<string, string>();
  await Promise.all([...new Set(rows.map((row) => row.clientId))].map(async (id) => {
    const client = await clients.getById(id);
    if (client) names.set(id, client.displayName);
  }));
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
      generations: run.generations,
      balanceBefore: run.balanceBefore,
      balanceAfter: run.balanceAfter,
      costUsd: run.costUsd,
      errorCode: run.errorCode,
      upstreamStatus: run.upstreamStatus,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
    })),
  });
}
