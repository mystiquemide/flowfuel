import { z } from "zod";
import { explorerTxUrl } from "./constants";
import { FlowFuelError } from "./errors";
import {
  decimalStringSchema,
  isoTimestampSchema,
  modelSchema,
  runStatusSchema,
  sha256HexSchema,
  transactionHashSchema,
  uuidSchema,
  walletAddressSchema,
} from "./schemas";

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
  reconciled: z.boolean(),
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
  activationExplorerUrl: z.string().nullable(),
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

const MICRO_USD = 1_000_000;

/** Converts a USD decimal string or number to integer micro-USD. */
export function toMicroUsd(value: string | number): number {
  return Math.round(Number(value) * MICRO_USD);
}

/**
 * Reconciles a run's arithmetic at micro-USD precision. The charged balance
 * delta must equal the reported cost exactly; concurrent spend on the same
 * credential or a drifted balance read makes the check fail.
 */
export function reconcileBalances(
  balanceBefore: string,
  balanceAfter: string,
  costUsd: string | number,
): boolean {
  const before = toMicroUsd(balanceBefore);
  const after = toMicroUsd(balanceAfter);
  const cost = toMicroUsd(costUsd);
  return before - after === cost;
}

/**
 * Builds a public receipt from a run record plus optional activation hash.
 * Only allowlisted fields are copied. The result is validated against the
 * strict schema so a malformed record fails closed instead of leaking data.
 * A run marked succeeded must re-verify its own arithmetic: generation ID,
 * cost, and a matching balance delta are all required, and a failed run can
 * never project as reconciled.
 */
export function toPublicReceipt(
  run: ReceiptSource,
  activationTxHash: string | null = null,
): PublicReceipt {
  const reconciled =
    run.status === "succeeded" &&
    run.generationId !== null &&
    run.costUsd !== null &&
    run.balanceBefore !== null &&
    run.balanceAfter !== null &&
    reconcileBalances(run.balanceBefore, run.balanceAfter, run.costUsd);
  if (run.status === "succeeded" && !reconciled) {
    throw new FlowFuelError(
      "RECONCILIATION_FAILED",
      "Run is marked succeeded but its receipt does not reconcile",
      { action: "Investigate the run. Do not treat it as successful." },
    );
  }
  return publicReceiptSchema.parse({
    runId: run.id,
    status: run.status,
    reconciled,
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
    activationExplorerUrl: activationTxHash
      ? explorerTxUrl(activationTxHash)
      : null,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    source: "live",
  });
}
