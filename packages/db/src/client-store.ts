import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { FlowFuelError } from "@flowfuel/core";
import type { Db } from "./client";
import {
  clients,
  walletNonces,
  type ClientRow,
  type WalletNonceRow,
} from "./schema";

export interface CreateClientInput {
  slug: string;
  displayName: string;
  walletAddress: string;
}

export function createClientStore(db: Db) {
  return {
    async create(input: CreateClientInput): Promise<ClientRow> {
      try {
        const rows = await db
          .insert(clients)
          .values({
            slug: input.slug,
            displayName: input.displayName,
            walletAddress: input.walletAddress,
          })
          .returning();
        return rows[0]!;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new FlowFuelError(
            "CONFLICT",
            "A client with this slug or wallet already exists",
          );
        }
        throw err;
      }
    },

    async getById(clientId: string): Promise<ClientRow | null> {
      const rows = await db
        .select()
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      return rows[0] ?? null;
    },

    async getBySlug(slug: string): Promise<ClientRow | null> {
      const rows = await db
        .select()
        .from(clients)
        .where(eq(clients.slug, slug))
        .limit(1);
      return rows[0] ?? null;
    },

    async list(): Promise<ClientRow[]> {
      return db.select().from(clients).orderBy(desc(clients.createdAt));
    },

    async setStatus(clientId: string, status: ClientRow["status"]) {
      const rows = await db
        .update(clients)
        .set({ status, updatedAt: new Date() })
        .where(eq(clients.id, clientId))
        .returning();
      return rows[0] ?? null;
    },

    async createNonce(
      clientId: string,
      purpose: WalletNonceRow["purpose"],
      ttlSeconds = 300,
    ): Promise<WalletNonceRow> {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const rows = await db
        .insert(walletNonces)
        .values({ clientId, purpose, expiresAt })
        .returning();
      return rows[0]!;
    },

    /**
     * Consumes a nonce exactly once. Returns the row when it is fresh,
     * unexpired, unconsumed, bound to the right client, and issued for the
     * right purpose. Returns null in every other case.
     */
    async consumeNonce(
      nonce: string,
      clientId: string,
      purpose: WalletNonceRow["purpose"],
    ): Promise<WalletNonceRow | null> {
      const now = new Date();
      const rows = await db
        .update(walletNonces)
        .set({ consumedAt: now })
        .where(
          and(
            eq(walletNonces.nonce, nonce),
            eq(walletNonces.clientId, clientId),
            eq(walletNonces.purpose, purpose),
            isNull(walletNonces.consumedAt),
            gt(walletNonces.expiresAt, now),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
  };
}

export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (
      typeof cur === "object" &&
      cur !== null &&
      "code" in cur &&
      (cur as { code?: string }).code === "23505"
    ) {
      return true;
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}
