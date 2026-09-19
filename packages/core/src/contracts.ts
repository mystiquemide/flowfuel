import { z } from "zod";
import {
  decimalStringSchema,
  generationEvidenceSchema,
  MAX_OUTPUT_TOKENS,
  modelSchema,
  noncePurposeSchema,
  sha256HexSchema,
  taskSchema,
  transactionHashSchema,
  uuidSchema,
  walletAddressSchema,
} from "./schemas";
import { errorCodeSchema } from "./errors";

export const signatureSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{130}$/, "Invalid wallet signature");

export const nonceRequestSchema = z.strictObject({
  clientId: uuidSchema,
  purpose: noncePurposeSchema,
});
export type NonceRequest = z.infer<typeof nonceRequestSchema>;

export const nonceResponseSchema = z.strictObject({
  nonce: uuidSchema,
  message: z.string().min(1).max(2_000),
});
export type NonceResponse = z.infer<typeof nonceResponseSchema>;

export const verifyWalletRequestSchema = z.strictObject({
  clientId: uuidSchema,
  nonce: uuidSchema,
  walletAddress: walletAddressSchema,
  signature: signatureSchema,
});
export type VerifyWalletRequest = z.infer<typeof verifyWalletRequestSchema>;

export const ORBIO_CREDENTIAL_PATTERN = /^sk-orb-[0-9]+-[A-Za-z0-9+/=]{40,}$/;

export const registerCredentialRequestSchema = z.strictObject({
  walletAddress: walletAddressSchema,
  epoch: z.number().int().nonnegative(),
  orbioCredential: z
    .string()
    .min(1)
    .max(512)
    .regex(ORBIO_CREDENTIAL_PATTERN, "Invalid Orbio credential shape"),
  consent: z.literal(true),
  nonce: uuidSchema,
  signature: signatureSchema,
});
export type RegisterCredentialRequest = z.infer<
  typeof registerCredentialRequestSchema
>;

export const credentialStatusResponseSchema = z.strictObject({
  status: z.enum(["ready", "unfunded"]),
  balance: decimalStringSchema.nullable(),
});
export type CredentialStatusResponse = z.infer<
  typeof credentialStatusResponseSchema
>;

export const createClientRequestSchema = z.strictObject({
  displayName: z.string().min(1).max(120),
  walletAddress: walletAddressSchema,
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with dashes")
    .optional(),
});
export type CreateClientRequest = z.infer<typeof createClientRequestSchema>;

export const recordActivationRequestSchema = z.strictObject({
  transactionHash: transactionHashSchema,
});
export type RecordActivationRequest = z.infer<
  typeof recordActivationRequestSchema
>;

export const updateClientStatusRequestSchema = z.strictObject({
  status: z.enum(["paused", "ready"]),
  nonce: uuidSchema,
  signature: signatureSchema,
});
export type UpdateClientStatusRequest = z.infer<
  typeof updateClientStatusRequestSchema
>;

export const revokeCredentialRequestSchema = z.strictObject({
  nonce: uuidSchema,
  signature: signatureSchema,
});
export type RevokeCredentialRequest = z.infer<
  typeof revokeCredentialRequestSchema
>;

export const runRequestSchema = z.strictObject({
  clientId: uuidSchema,
  workflowRunId: z.string().min(1).max(128),
  task: taskSchema,
  model: modelSchema,
  maxOutputTokens: z.number().int().min(1).max(MAX_OUTPUT_TOKENS),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runReceiptSummarySchema = z.strictObject({
  clientWallet: walletAddressSchema,
  generationId: z.string().min(1).max(128).nullable(),
  model: modelSchema,
  taskHash: sha256HexSchema,
  costUsd: decimalStringSchema.nullable(),
  balanceBefore: decimalStringSchema.nullable(),
  balanceAfter: decimalStringSchema.nullable(),
  generations: z.array(generationEvidenceSchema),
});
export type RunReceiptSummary = z.infer<typeof runReceiptSummarySchema>;

export const apiErrorSchema = z.strictObject({
  code: errorCodeSchema,
  upstreamStatus: z.number().int().nullable(),
  action: z.string().min(1).max(500),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const runSuccessResponseSchema = z.strictObject({
  runId: uuidSchema,
  status: z.literal("succeeded"),
  result: z.string().max(100_000),
  receipt: runReceiptSummarySchema,
});
export type RunSuccessResponse = z.infer<typeof runSuccessResponseSchema>;

export const runFailureStatusSchema = z.enum([
  "refuel_pending",
  "client_unfunded",
  "quota_exceeded",
  "provider_failed",
  "validation_failed",
  "reconciliation_failed",
]);

export const runFailureResponseSchema = z.strictObject({
  runId: uuidSchema,
  status: runFailureStatusSchema,
  taskHash: sha256HexSchema,
  error: apiErrorSchema,
});
export type RunFailureResponse = z.infer<typeof runFailureResponseSchema>;

export const runResponseSchema = z.union([
  runSuccessResponseSchema,
  runFailureResponseSchema,
]);
export type RunResponse = z.infer<typeof runResponseSchema>;
