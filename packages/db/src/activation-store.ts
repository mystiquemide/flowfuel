import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { isUniqueViolation } from "./client-store";
import { activations, type ActivationRow } from "./schema";

export interface CreateActivationInput {
  clientId: string;
  transactionHash: string;
  activationId: number | null;
  amountUsd: string;
  blockNumber: number | null;
  status: "pending" | "confirmed" | "failed";
}

export function createActivationStore(db: Db) {
  const store = {
    /**
     * Records a verified onchain activation. The transaction hash is unique,
     * so a retried submission returns the existing row.
     */
    async create(input: CreateActivationInput): Promise<ActivationRow> {
      try {
        const rows = await db
          .insert(activations)
          .values({
            clientId: input.clientId,
            transactionHash: input.transactionHash,
            activationId: input.activationId,
            amountUsd: input.amountUsd,
            blockNumber: input.blockNumber,
            status: input.status,
          })
          .returning();
        return rows[0]!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          const existing = await store.getByTxHash(input.transactionHash);
          if (existing) return existing;
        }
        throw err;
      }
    },

    async getByTxHash(transactionHash: string): Promise<ActivationRow | null> {
      const rows = await db
        .select()
        .from(activations)
        .where(eq(activations.transactionHash, transactionHash))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * Latest confirmed activation for the client. Receipts link the
     * activation transaction so judges can verify the funding on chain.
     */
    async latestForClient(clientId: string): Promise<ActivationRow | null> {
      const rows = await db
        .select()
        .from(activations)
        .where(
          and(
            eq(activations.clientId, clientId),
            eq(activations.status, "confirmed"),
          ),
        )
        .orderBy(desc(activations.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },
  };
  return store;
}
