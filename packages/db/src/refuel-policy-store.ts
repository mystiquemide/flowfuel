import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { clientRefuelPolicies, type ClientRefuelPolicyRow } from "./schema";

export interface SaveRefuelPolicyInput {
  clientId: string;
  enabled: boolean;
  thresholdUsd: string;
  refillAmountUsdg: string;
  weeklyCapUsdg: string;
  executorAddress: string;
  maxSlippageBps: number;
}

export function createRefuelPolicyStore(db: Db) {
  return {
    async getForClient(clientId: string): Promise<ClientRefuelPolicyRow | null> {
      const rows = await db
        .select()
        .from(clientRefuelPolicies)
        .where(eq(clientRefuelPolicies.clientId, clientId))
        .limit(1);
      return rows[0] ?? null;
    },

    async save(input: SaveRefuelPolicyInput): Promise<ClientRefuelPolicyRow> {
      const rows = await db
        .insert(clientRefuelPolicies)
        .values({
          clientId: input.clientId,
          enabled: input.enabled,
          thresholdUsd: input.thresholdUsd,
          refillAmountUsdg: input.refillAmountUsdg,
          weeklyCapUsdg: input.weeklyCapUsdg,
          executorAddress: input.executorAddress,
          maxSlippageBps: input.maxSlippageBps,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: clientRefuelPolicies.clientId,
          set: {
            enabled: input.enabled,
            thresholdUsd: input.thresholdUsd,
            refillAmountUsdg: input.refillAmountUsdg,
            weeklyCapUsdg: input.weeklyCapUsdg,
            executorAddress: input.executorAddress,
            maxSlippageBps: input.maxSlippageBps,
            updatedAt: new Date(),
          },
        })
        .returning();
      return rows[0]!;
    },
  };
}
