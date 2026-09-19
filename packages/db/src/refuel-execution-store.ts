import { and, desc, eq, inArray } from "drizzle-orm";
import type { RefuelExecutionStatus } from "@flowfuel/core";
import type { Db } from "./client";
import { refuelExecutions, type RefuelExecutionRow } from "./schema";

export interface CreateRefuelExecutionInput {
  clientId: string;
  runId: string;
  workflowRunId: string;
  triggerBalance: string;
  threshold: string;
  requestedAmount: string;
  beneficiaryAddress: string;
  status?: RefuelExecutionStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ConfirmRefuelInput {
  transactionHash: string;
  quoteCreditOut?: string | null;
  quoteUsdgSpent?: string | null;
  quoteFeeAtoms?: string | null;
  quoteFills?: string | null;
  quoteReason?: number | null;
  minCreditOut?: string | null;
  usdgSpent?: string | null;
  creditOut?: string | null;
  activationId?: string | null;
}

const ACTIVE_STATUSES: RefuelExecutionStatus[] = ["requested", "submitted", "confirmed", "indexing"];

export function createRefuelExecutionStore(db: Db) {
  const store = {
    async create(input: CreateRefuelExecutionInput): Promise<RefuelExecutionRow> {
      const rows = await db
        .insert(refuelExecutions)
        .values({
          clientId: input.clientId,
          runId: input.runId,
          workflowRunId: input.workflowRunId,
          triggerBalance: input.triggerBalance,
          threshold: input.threshold,
          requestedAmount: input.requestedAmount,
          beneficiaryAddress: input.beneficiaryAddress,
          status: input.status ?? "requested",
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        })
        .returning();
      return rows[0]!;
    },

    async getByRunId(runId: string): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .select()
        .from(refuelExecutions)
        .where(eq(refuelExecutions.runId, runId))
        .limit(1);
      return rows[0] ?? null;
    },

    async getActiveForClient(clientId: string): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .select()
        .from(refuelExecutions)
        .where(
          and(
            eq(refuelExecutions.clientId, clientId),
            inArray(refuelExecutions.status, ACTIVE_STATUSES),
          ),
        )
        .orderBy(desc(refuelExecutions.startedAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async updateSubmitted(id: string, transactionHash: string): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .update(refuelExecutions)
        .set({ transactionHash, status: "submitted", submittedAt: new Date() })
        .where(eq(refuelExecutions.id, id))
        .returning();
      return rows[0] ?? null;
    },

    async updateConfirmed(
      id: string,
      input: ConfirmRefuelInput,
    ): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .update(refuelExecutions)
        .set({
          transactionHash: input.transactionHash,
          status: "indexing",
          confirmedAt: new Date(),
          quoteCreditOut: input.quoteCreditOut ?? null,
          quoteUsdgSpent: input.quoteUsdgSpent ?? null,
          quoteFeeAtoms: input.quoteFeeAtoms ?? null,
          quoteFills: input.quoteFills ?? null,
          quoteReason: input.quoteReason ?? null,
          minCreditOut: input.minCreditOut ?? null,
          usdgSpent: input.usdgSpent ?? null,
          creditOut: input.creditOut ?? null,
          activationId: input.activationId ?? null,
        })
        .where(eq(refuelExecutions.id, id))
        .returning();
      return rows[0] ?? null;
    },

    async markIndexed(id: string): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .update(refuelExecutions)
        .set({ status: "indexed", indexedAt: new Date() })
        .where(eq(refuelExecutions.id, id))
        .returning();
      return rows[0] ?? null;
    },

    async markBlocked(
      id: string,
      status: Extract<RefuelExecutionStatus, "blocked_no_reserve" | "blocked_weekly_cap" | "blocked_policy">,
      errorCode: string,
      errorMessage: string,
    ): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .update(refuelExecutions)
        .set({ status, errorCode, errorMessage })
        .where(eq(refuelExecutions.id, id))
        .returning();
      return rows[0] ?? null;
    },

    async markFailed(
      id: string,
      errorCode: string,
      errorMessage: string,
    ): Promise<RefuelExecutionRow | null> {
      const rows = await db
        .update(refuelExecutions)
        .set({ status: "failed", errorCode, errorMessage })
        .where(eq(refuelExecutions.id, id))
        .returning();
      return rows[0] ?? null;
    },
  };
  return store;
}
