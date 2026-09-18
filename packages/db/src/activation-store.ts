import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { activations, type ActivationRow } from "./schema";

export function createActivationStore(db: Db) {
  return {
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
}
