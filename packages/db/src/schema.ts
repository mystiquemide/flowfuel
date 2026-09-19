import {
  bigint,
  boolean,
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
  "pause_client",
  "revoke_credential",
]);

export const activationStatusEnum = pgEnum("activation_status", [
  "pending",
  "confirmed",
  "failed",
]);

export const runStatusEnum = pgEnum("run_status", [
  "running",
  "succeeded",
  "refuel_pending",
  "client_unfunded",
  "quota_exceeded",
  "provider_failed",
  "validation_failed",
  "reconciliation_failed",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "client",
  "agency",
  "workflow",
  "system",
]);

export const refuelExecutionStatusEnum = pgEnum("refuel_execution_status", [
  "requested",
  "submitted",
  "confirmed",
  "indexing",
  "indexed",
  "failed",
  "blocked_no_reserve",
  "blocked_weekly_cap",
  "blocked_policy",
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
    generations: jsonb("generations").notNull().default([]),
    resultCiphertext: text("result_ciphertext"),
    activationTxHash: text("activation_tx_hash"),
    balanceBefore: numeric("balance_before", { precision: 20, scale: 6 }),
    balanceAfter: numeric("balance_after", { precision: 20, scale: 6 }),
    costUsd: numeric("cost_usd", { precision: 24, scale: 12 }),
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

export const clientRefuelPolicies = pgTable("client_refuel_policies", {
  clientId: uuid("client_id")
    .primaryKey()
    .references(() => clients.id),
  enabled: boolean("enabled").notNull().default(false),
  thresholdUsd: numeric("threshold_usd", { precision: 20, scale: 6 }).notNull(),
  refillAmountUsdg: numeric("refill_amount_usdg", {
    precision: 20,
    scale: 6,
  }).notNull(),
  weeklyCapUsdg: numeric("weekly_cap_usdg", { precision: 20, scale: 6 }).notNull(),
  executorAddress: text("executor_address").notNull(),
  maxSlippageBps: integer("max_slippage_bps").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refuelExecutions = pgTable(
  "refuel_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    runId: uuid("run_id").references(() => runs.id),
    workflowRunId: text("workflow_run_id"),
    triggerBalance: numeric("trigger_balance", { precision: 20, scale: 6 }).notNull(),
    threshold: numeric("threshold", { precision: 20, scale: 6 }).notNull(),
    requestedAmount: numeric("requested_amount", { precision: 20, scale: 6 }).notNull(),
    transactionHash: text("transaction_hash"),
    status: refuelExecutionStatusEnum("status").notNull().default("requested"),
    quoteCreditOut: numeric("quote_credit_out", { precision: 30, scale: 0 }),
    quoteUsdgSpent: numeric("quote_usdg_spent", { precision: 30, scale: 0 }),
    quoteFeeAtoms: numeric("quote_fee_atoms", { precision: 30, scale: 0 }),
    quoteFills: numeric("quote_fills", { precision: 30, scale: 0 }),
    quoteReason: integer("quote_reason"),
    minCreditOut: numeric("min_credit_out", { precision: 30, scale: 0 }),
    usdgSpent: numeric("usdg_spent", { precision: 30, scale: 0 }),
    creditOut: numeric("credit_out", { precision: 30, scale: 0 }),
    activationId: text("activation_id"),
    beneficiaryAddress: text("beneficiary_address").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("refuel_executions_tx_unique").on(t.transactionHash),
    index("refuel_executions_client_idx").on(t.clientId, t.startedAt),
    index("refuel_executions_active_idx").on(t.clientId, t.status),
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
export type ClientRefuelPolicyRow = typeof clientRefuelPolicies.$inferSelect;
export type RefuelExecutionRow = typeof refuelExecutions.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
