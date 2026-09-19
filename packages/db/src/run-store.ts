import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { isUniqueViolation } from "./client-store";
import { runs, type RunRow } from "./schema";
import type { GenerationEvidence } from "@flowfuel/core";

export interface CreateRunInput {
  clientId: string;
  workflowRunId: string | null;
  taskType: string;
  model: string;
  taskHash: string;
  idempotencyKey: string;
  activationTxHash?: string | null;
}

export interface CompleteRunInput {
  status: Exclude<RunRow["status"], "running">;
  generationId?: string | null;
  balanceBefore?: string | null;
  balanceAfter?: string | null;
  costUsd?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorCode?: string | null;
  upstreamStatus?: number | null;
  generations?: GenerationEvidence[];
  resultCiphertext?: string | null;
}

export function createRunStore(db: Db) {
  const store = {
    /**
     * Creates a run in `running` state. The idempotency key is unique, so a
     * retried n8n execution either returns the in-flight row or the original
     * terminal receipt instead of charging twice.
     */
    async create(input: CreateRunInput): Promise<RunRow> {
      try {
        const rows = await db
          .insert(runs)
          .values({
            clientId: input.clientId,
            workflowRunId: input.workflowRunId,
            taskType: input.taskType,
            model: input.model,
            taskHash: input.taskHash,
            idempotencyKey: input.idempotencyKey,
            startedAt: new Date(),
            activationTxHash: input.activationTxHash ?? null,
          })
          .returning();
        return rows[0]!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          const existing = await store.getByIdempotencyKey(
            input.idempotencyKey,
          );
          if (existing) return existing;
        }
        throw err;
      }
    },

    async getById(runId: string): Promise<RunRow | null> {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      return rows[0] ?? null;
    },

    async getByIdempotencyKey(key: string): Promise<RunRow | null> {
      const rows = await db
        .select()
        .from(runs)
        .where(eq(runs.idempotencyKey, key))
        .limit(1);
      return rows[0] ?? null;
    },

    async listByClient(clientId: string, limit = 50): Promise<RunRow[]> {
      return db
        .select()
        .from(runs)
        .where(eq(runs.clientId, clientId))
        .orderBy(desc(runs.startedAt))
        .limit(limit);
    },

    async listByWorkflowRunId(workflowRunId: string): Promise<RunRow[]> {
      return db
        .select()
        .from(runs)
        .where(eq(runs.workflowRunId, workflowRunId))
        .orderBy(desc(runs.startedAt));
    },

    async listRecent(limit = 50, clientId?: string): Promise<RunRow[]> {
      const query = db
        .select()
        .from(runs)
        .orderBy(desc(runs.startedAt))
        .limit(limit);
      if (clientId) {
        return query.where(eq(runs.clientId, clientId));
      }
      return query;
    },

    /**
     * Total real spend for the client: every run that produced a charge,
     * regardless of terminal status. A reconciliation_failed run still moved
     * money off the balance, so it counts toward what the client spent.
     */
    async sumChargedCost(clientId: string): Promise<number> {
      const rows = await db
        .select({ total: sql<string>`coalesce(sum(${runs.costUsd}), 0)` })
        .from(runs)
        .where(and(eq(runs.clientId, clientId), isNotNull(runs.costUsd)));
      return Number(rows[0]?.total ?? 0);
    },

    /**
     * Completes a run. The WHERE status='running' clause makes terminal
     * states immutable: a succeeded, unfunded, or failed run can never be
     * rewritten or reverted to running.
     */
    async complete(
      runId: string,
      input: CompleteRunInput,
    ): Promise<RunRow | null> {
      const rows = await db
        .update(runs)
        .set({
          status: input.status,
          generationId: input.generationId ?? null,
          balanceBefore: input.balanceBefore ?? null,
          balanceAfter: input.balanceAfter ?? null,
          costUsd: input.costUsd ?? null,
          promptTokens: input.promptTokens ?? null,
          completionTokens: input.completionTokens ?? null,
          errorCode: input.errorCode ?? null,
          upstreamStatus: input.upstreamStatus ?? null,
          generations: input.generations ?? [],
          resultCiphertext: input.resultCiphertext ?? null,
          completedAt: new Date(),
        })
        .where(and(eq(runs.id, runId), eq(runs.status, "running")))
        .returning();
      return rows[0] ?? null;
    },
  };
  return store;
}
