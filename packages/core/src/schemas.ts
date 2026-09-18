import { z } from "zod";
import { getAddress } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./constants";

export const uuidSchema = z.uuid();

export const isoTimestampSchema = z.iso.datetime();

export const walletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid wallet address")
  .transform((value) => getAddress(value));

export const transactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");

export const sha256HexSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Expected a lowercase SHA-256 hex digest");

export const decimalStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Expected a non-negative decimal string");

export const chainIdSchema = z.literal(ROBINHOOD_CHAIN_ID);

export const clientSlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with dashes");

export const clientStatusSchema = z.enum([
  "pending",
  "ready",
  "unfunded",
  "paused",
  "revoked",
]);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const clientSchema = z.object({
  id: uuidSchema,
  slug: clientSlugSchema,
  displayName: z.string().min(1).max(120),
  walletAddress: walletAddressSchema,
  chainId: chainIdSchema,
  status: clientStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type Client = z.infer<typeof clientSchema>;

export const noncePurposeSchema = z.enum([
  "connect",
  "register_credential",
  "rotate_credential",
]);
export type NoncePurpose = z.infer<typeof noncePurposeSchema>;

export const credentialRecordSchema = z.object({
  clientId: uuidSchema,
  walletAddress: walletAddressSchema,
  epoch: z.number().int().nonnegative(),
  ciphertext: z.string().min(1),
  fingerprint: sha256HexSchema,
  verifiedBalance: decimalStringSchema.nullable(),
  verifiedAt: isoTimestampSchema.nullable(),
  rotatedAt: isoTimestampSchema.nullable(),
});
export type CredentialRecord = z.infer<typeof credentialRecordSchema>;

export const activationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "failed",
]);

export const activationSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema,
  transactionHash: transactionHashSchema,
  activationId: z.number().int().nonnegative().nullable(),
  amountUsd: decimalStringSchema,
  blockNumber: z.number().int().nonnegative().nullable(),
  status: activationStatusSchema,
  createdAt: isoTimestampSchema,
});
export type Activation = z.infer<typeof activationSchema>;

export const TASK_TYPES = ["lead_summary"] as const;
export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const MODEL_ALLOWLIST = ["google/gemini-2.5-flash"] as const;
export const modelSchema = z.enum(MODEL_ALLOWLIST);
export type AllowedModel = z.infer<typeof modelSchema>;

export const MAX_TASK_INPUT_CHARS = 8_000;
/**
 * Hard contract bound on run output size. The n8n reference workflow clamps
 * tighter (1024) as the task-level bound; this bound keeps any direct broker
 * call finite while still letting Orbio's own balance pre-authorization
 * reject a request that exceeds the client's allowance (upstream 402).
 */
export const MAX_OUTPUT_TOKENS = 8_192;

export const taskSchema = z.object({
  type: taskTypeSchema,
  input: z.string().min(1).max(MAX_TASK_INPUT_CHARS),
});
export type Task = z.infer<typeof taskSchema>;

export const runStatusSchema = z.enum([
  "running",
  "succeeded",
  "client_unfunded",
  "quota_exceeded",
  "provider_failed",
  "validation_failed",
  "reconciliation_failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema,
  workflowRunId: z.string().min(1).max(128).nullable(),
  taskType: taskTypeSchema,
  model: modelSchema,
  status: runStatusSchema,
  generationId: z.string().min(1).max(128).nullable(),
  balanceBefore: decimalStringSchema.nullable(),
  balanceAfter: decimalStringSchema.nullable(),
  costUsd: decimalStringSchema.nullable(),
  promptTokens: z.number().int().nonnegative().nullable(),
  completionTokens: z.number().int().nonnegative().nullable(),
  errorCode: z.string().max(64).nullable(),
  upstreamStatus: z.number().int().nullable(),
  taskHash: sha256HexSchema,
  idempotencyKey: z.string().min(1).max(128),
  startedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema.nullable(),
});
export type Run = z.infer<typeof runSchema>;

export const auditActorTypeSchema = z.enum([
  "client",
  "agency",
  "workflow",
  "system",
]);

export const AUDIT_EVENT_TYPES = [
  "client_created",
  "nonce_issued",
  "wallet_verified",
  "credential_registered",
  "credential_rotated",
  "activation_recorded",
  "run_succeeded",
  "run_unfunded",
  "run_quota_exceeded",
  "run_provider_failed",
  "run_validation_failed",
  "run_reconciliation_failed",
] as const;
export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const auditEventSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema.nullable(),
  actorType: auditActorTypeSchema,
  eventType: auditEventTypeSchema,
  publicData: z.record(z.string(), z.unknown()),
  createdAt: isoTimestampSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
