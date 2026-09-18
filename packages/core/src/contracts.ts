import { z } from "zod";
import {
  decimalStringSchema,
  MAX_OUTPUT_TOKENS,
  modelSchema,
  noncePurposeSchema,
  taskSchema,
  uuidSchema,
  walletAddressSchema,
} from "./schemas.js";
import { errorCodeSchema } from "./errors.js";

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
});
export type RegisterCredentialRequest = z.infer<
  typeof registerCredentialRequestSchema
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
  costUsd: decimalStringSchema.nullable(),
  balanceBefore: decimalStringSchema.nullable(),
  balanceAfter: decimalStringSchema.nullable(),
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
  "client_unfunded",
  "quota_exceeded",
  "provider_failed",
  "validation_failed",
]);

export const runFailureResponseSchema = z.strictObject({
  runId: uuidSchema,
  status: runFailureStatusSchema,
  error: apiErrorSchema,
});
export type RunFailureResponse = z.infer<typeof runFailureResponseSchema>;

export const runResponseSchema = z.union([
  runSuccessResponseSchema,
  runFailureResponseSchema,
]);
export type RunResponse = z.infer<typeof runResponseSchema>;
