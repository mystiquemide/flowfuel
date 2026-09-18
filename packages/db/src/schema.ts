import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const clientStatusEnum = pgEnum("client_status", [
  "pending",
  "ready",
  "unfunded",
  "paused",
  "revoked",
]);

export const noncePurposeEnum = pgEnum("nonce_purpose", [
  "connect",
  "register_credential",
  "rotate_credential",
]);

export const activationStatusEnum = pgEnum("activation_status", [
  "pending",
  "confirmed",
  "failed",
]);

export const runStatusEnum = pgEnum("run_status", [
  "running",
  "succeeded",
  "client_unfunded",
  "quota_exceeded",
  "provider_failed",
  "validation_failed",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "client",
  "agency",
  "workflow",
  "system",
]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    walletAddress: text("wallet_address").notNull(),
    chainId: integer("chain_id").notNull().default(4663),
    status: clientStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("clients_slug_unique").on(t.slug),
    uniqueIndex("clients_wallet_unique").on(t.walletAddress),
  ],
);

export const walletNonces = pgTable(
  "wallet_nonces",
  {
    nonce: uuid("nonce").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    purpose: noncePurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("wallet_nonces_client_idx").on(t.clientId)],
);

export const clientCredentials = pgTable("client_credentials", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id),
  walletAddress: text("wallet_address").notNull(),
  epoch: integer("epoch").notNull(),
  ciphertext: text("ciphertext").notNull(),
  fingerprint: text("fingerprint").notNull(),
  verifiedBalance: numeric("verified_balance", {
    precision: 20,
    scale: 6,
  }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

export const activations = pgTable(
  "activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    transactionHash: text("transaction_hash").notNull(),
    activationId: integer("activation_id"),
    amountUsd: numeric("amount_usd", { precision: 20, scale: 6 }).notNull(),
    blockNumber: bigint("block_number", { mode: "number" }),
    status: activationStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("activations_tx_unique").on(t.transactionHash),
    index("activations_client_idx").on(t.clientId),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    workflowRunId: text("workflow_run_id"),
    taskType: text("task_type").notNull(),
    model: text("model").notNull(),
    status: runStatusEnum("status").notNull().default("running"),
    generationId: text("generation_id"),
    balanceBefore: numeric("balance_before", { precision: 20, scale: 6 }),
    balanceAfter: numeric("balance_after", { precision: 20, scale: 6 }),
    costUsd: numeric("cost_usd", { precision: 20, scale: 6 }),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    errorCode: text("error_code"),
    upstreamStatus: integer("upstream_status"),
    taskHash: text("task_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("runs_idempotency_unique").on(t.idempotencyKey),
    index("runs_client_idx").on(t.clientId),
    index("runs_client_started_idx").on(t.clientId, t.startedAt),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => clients.id),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    eventType: text("event_type").notNull(),
    publicData: jsonb("public_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_events_client_idx").on(t.clientId)],
);

export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
export type WalletNonceRow = typeof walletNonces.$inferSelect;
export type ClientCredentialRow = typeof clientCredentials.$inferSelect;
export type ActivationRow = typeof activations.$inferSelect;
export type RunRow = typeof runs.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
