import { z } from "zod";
import {
  decimalStringSchema,
  isoTimestampSchema,
  modelSchema,
  runStatusSchema,
  sha256HexSchema,
  transactionHashSchema,
  uuidSchema,
  walletAddressSchema,
} from "./schemas.js";

/**
 * Public-safe receipt projection.
 *
 * This schema is the explicit allowlist for judge-facing proof data. It is
 * strict on purpose: any secret-shaped or unexpected field fails parsing so a
 * credential, prompt, or upstream payload can never leak into a public page.
 */
export const publicReceiptSchema = z.strictObject({
  runId: uuidSchema,
  status: runStatusSchema,
  clientWallet: walletAddressSchema,
  workflowRunId: z.string().min(1).max(128).nullable(),
  taskHash: sha256HexSchema,
  model: modelSchema,
  generationId: z.string().min(1).max(128).nullable(),
  balanceBefore: decimalStringSchema.nullable(),
  costUsd: decimalStringSchema.nullable(),
  balanceAfter: decimalStringSchema.nullable(),
  upstreamStatus: z.number().int().nullable(),
  activationTxHash: transactionHashSchema.nullable(),
  startedAt: isoTimestampSchema,
  completedAt: isoTimestampSchema.nullable(),
  source: z.literal("live"),
});
export type PublicReceipt = z.infer<typeof publicReceiptSchema>;

export interface ReceiptSource {
  id: string;
  clientWallet: string;
  workflowRunId: string | null;
  taskHash: string;
  model: string;
  status: string;
  generationId: string | null;
  balanceBefore: string | null;
  costUsd: string | null;
  balanceAfter: string | null;
  upstreamStatus: number | null;
  startedAt: string;
  completedAt: string | null;
}

/**
 * Builds a public receipt from a run record plus optional activation hash.
 * Only allowlisted fields are copied. The result is validated against the
 * strict schema so a malformed record fails closed instead of leaking data.
 */
export function toPublicReceipt(
  run: ReceiptSource,
  activationTxHash: string | null = null,
): PublicReceipt {
  return publicReceiptSchema.parse({
    runId: run.id,
    status: run.status,
    clientWallet: run.clientWallet,
    workflowRunId: run.workflowRunId,
    taskHash: run.taskHash,
    model: run.model,
    generationId: run.generationId,
    balanceBefore: run.balanceBefore,
    costUsd: run.costUsd,
    balanceAfter: run.balanceAfter,
    upstreamStatus: run.upstreamStatus,
    activationTxHash,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    source: "live",
  });
}
