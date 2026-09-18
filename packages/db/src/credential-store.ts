import { eq } from "drizzle-orm";
import type { Db } from "./client";
import {
  clientCredentials,
  type ClientCredentialRow,
} from "./schema";

export interface SaveCredentialInput {
  clientId: string;
  walletAddress: string;
  epoch: number;
  ciphertext: string;
  fingerprint: string;
}

export function createCredentialStore(db: Db) {
  return {
    /**
     * Inserts or replaces the client's credential. Rotation reuses this path:
     * the row key is clientId, so a higher epoch overwrites the old ciphertext
     * in place and stamps rotatedAt.
     */
    async save(
      input: SaveCredentialInput,
      rotated = false,
    ): Promise<ClientCredentialRow> {
      const rows = await db
        .insert(clientCredentials)
        .values({
          clientId: input.clientId,
          walletAddress: input.walletAddress,
          epoch: input.epoch,
          ciphertext: input.ciphertext,
          fingerprint: input.fingerprint,
          rotatedAt: rotated ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: clientCredentials.clientId,
          set: {
            walletAddress: input.walletAddress,
            epoch: input.epoch,
            ciphertext: input.ciphertext,
            fingerprint: input.fingerprint,
            verifiedBalance: null,
            verifiedAt: null,
            rotatedAt: new Date(),
          },
        })
        .returning();
      return rows[0]!;
    },

    /**
     * Tenant-bound read. Resolves credentials strictly by the caller's own
     * clientId. There is deliberately no lookup by wallet or fingerprint so a
     * request can never resolve another tenant's row.
     */
    async getForClient(clientId: string): Promise<ClientCredentialRow | null> {
      const rows = await db
        .select()
        .from(clientCredentials)
        .where(eq(clientCredentials.clientId, clientId))
        .limit(1);
      return rows[0] ?? null;
    },

    async markVerified(clientId: string, balance: string) {
      const rows = await db
        .update(clientCredentials)
        .set({ verifiedBalance: balance, verifiedAt: new Date() })
        .where(eq(clientCredentials.clientId, clientId))
        .returning();
      return rows[0] ?? null;
    },

    async remove(clientId: string): Promise<boolean> {
      const rows = await db
        .delete(clientCredentials)
        .where(eq(clientCredentials.clientId, clientId))
        .returning({ clientId: clientCredentials.clientId });
      return rows.length > 0;
    },
  };
}
