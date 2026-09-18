import type { Db } from "./client";
import {
  auditEvents,
  type AuditEventRow,
} from "./schema";

export interface AppendAuditInput {
  clientId: string | null;
  actorType: AuditEventRow["actorType"];
  eventType: string;
  publicData: Record<string, unknown>;
}

export function createAuditStore(db: Db) {
  return {
    async append(input: AppendAuditInput): Promise<AuditEventRow> {
      const rows = await db
        .insert(auditEvents)
        .values({
          clientId: input.clientId,
          actorType: input.actorType,
          eventType: input.eventType,
          publicData: input.publicData,
        })
        .returning();
      return rows[0]!;
    },
  };
}
