import { describe, expect, it } from "vitest";
import {
  FlowFuelError,
  publicReceiptSchema,
  reconcileBalances,
  toMicroUsd,
  toPublicReceipt,
  type ReceiptSource,
} from "../src/index";

const NOW = "2026-09-18T18:00:00.000Z";
const TX = "0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed";

const sourceRun: ReceiptSource = {
  id: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
  clientWallet: "0x78a4e72c413b1a91a25d253988bb61258d9c8c2f",
  workflowRunId: "n8n-exec-246",
  taskHash: "a".repeat(64),
  model: "google/gemini-2.5-flash",
  status: "succeeded",
  generationId: "gen-1789751867",
  generations: [
    {
      generationId: "gen-1789751867",
      phase: "analysis",
      model: "google/gemini-2.5-flash",
      costUsd: "0.000026",
      promptTokens: 20,
      completionTokens: 10,
    },
  ],
  balanceBefore: "0.009801",
  costUsd: "0.000026",
  balanceAfter: "0.009775",
  upstreamStatus: 200,
  startedAt: NOW,
  completedAt: NOW,
};

describe("toPublicReceipt", () => {
  it("builds a valid public receipt", () => {
    const receipt = toPublicReceipt(sourceRun, TX);
    expect(receipt.status).toBe("succeeded");
    expect(receipt.reconciled).toBe(true);
    expect(receipt.clientWallet).toBe(
      "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
    );
    expect(receipt.activationTxHash).toBe(TX);
    expect(receipt.activationExplorerUrl).toBe(
      `https://robin.etherscan.io/tx/${TX}`,
    );
    expect(receipt.source).toBe("live");
  });

  it("emits only allowlisted keys", () => {
    const allowed = new Set([
      "runId",
      "status",
      "reconciled",
      "clientWallet",
      "workflowRunId",
      "taskHash",
      "model",
      "generationId",
      "generations",
      "balanceBefore",
      "costUsd",
      "balanceAfter",
      "upstreamStatus",
      "activationTxHash",
      "activationExplorerUrl",
      "activationContext",
      "startedAt",
      "completedAt",
      "source",
    ]);
    const receipt = toPublicReceipt(sourceRun);
    for (const key of Object.keys(receipt)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it("throws reconciliation_failed when a succeeded run's arithmetic is off", () => {
    expect(() =>
      toPublicReceipt({ ...sourceRun, balanceAfter: "0.009500" }),
    ).toThrowError(FlowFuelError);
    try {
      toPublicReceipt({ ...sourceRun, balanceAfter: "0.009500" });
    } catch (error) {
      expect((error as FlowFuelError).code).toBe("RECONCILIATION_FAILED");
    }
  });

  it("throws when a succeeded run lacks a generation ID or cost", () => {
    expect(() =>
      toPublicReceipt({ ...sourceRun, generationId: null }),
    ).toThrowError(FlowFuelError);
    expect(() => toPublicReceipt({ ...sourceRun, costUsd: null })).toThrowError(
      FlowFuelError,
    );
    expect(() =>
      toPublicReceipt({ ...sourceRun, balanceAfter: null }),
    ).toThrowError(FlowFuelError);
  });

  it("projects a failed run as unreconciled without throwing", () => {
    const receipt = toPublicReceipt({
      ...sourceRun,
      status: "client_unfunded",
      generationId: null,
      balanceBefore: null,
      costUsd: null,
      balanceAfter: null,
      upstreamStatus: 401,
    });
    expect(receipt.status).toBe("client_unfunded");
    expect(receipt.reconciled).toBe(false);
    expect(receipt.generationId).toBeNull();
  });

  it("projects a reconciliation_failed run honestly", () => {
    const receipt = toPublicReceipt({
      ...sourceRun,
      status: "reconciliation_failed",
      balanceAfter: "0.009500",
    });
    expect(receipt.status).toBe("reconciliation_failed");
    expect(receipt.reconciled).toBe(false);
  });
});

describe("reconcileBalances", () => {
  it("accepts an exact micro-USD match", () => {
    expect(reconcileBalances("0.009801", "0.009775", "0.000026")).toBe(true);
    expect(reconcileBalances("0.009801", "0.009775", 0.000026)).toBe(true);
  });

  it("accepts rounding drift inside the tolerance", () => {
    // delta 27 vs cost 26: one micro-USD of gateway rounding.
    expect(reconcileBalances("0.009801", "0.009774", "0.000026")).toBe(true);
    expect(reconcileBalances("0.009801", "0.009777", "0.000026")).toBe(true);
  });

  it("rejects imbalances beyond the tolerance", () => {
    // delta 31 vs cost 26: five micro-USD off.
    expect(reconcileBalances("0.009801", "0.009770", "0.000026")).toBe(false);
    // No charge at all.
    expect(reconcileBalances("0.009801", "0.009801", "0.000026")).toBe(false);
    // A doubled charge.
    expect(reconcileBalances("0.009801", "0.009749", "0.000026")).toBe(false);
  });

  it("converts decimal USD to integer micro-USD", () => {
    expect(toMicroUsd("0.009801")).toBe(9801);
    expect(toMicroUsd(0.000026)).toBe(26);
    expect(toMicroUsd("1.000000")).toBe(1_000_000);
  });
});

describe("publicReceiptSchema", () => {
  const valid = {
    runId: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
    status: "succeeded",
    reconciled: true,
    clientWallet: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
    workflowRunId: "n8n-exec-246",
    taskHash: "a".repeat(64),
    model: "google/gemini-2.5-flash",
    generationId: "gen-1789751867",
    generations: sourceRun.generations,
    balanceBefore: "0.009801",
    costUsd: "0.000026",
    balanceAfter: "0.009775",
    upstreamStatus: 200,
    activationTxHash: TX,
    activationExplorerUrl: `https://robin.etherscan.io/tx/${TX}`,
    activationContext: "recorded_at_run_start",
    startedAt: NOW,
    completedAt: NOW,
    source: "live",
  };

  it("accepts a fully populated receipt", () => {
    expect(publicReceiptSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    "orbioCredential",
    "credential",
    "privateKey",
    "apiKey",
    "authorization",
    "secret",
    "prompt",
    "input",
    "ciphertext",
  ])("rejects secret-shaped field %s", (field) => {
    const res = publicReceiptSchema.safeParse({ ...valid, [field]: "x" });
    expect(res.success).toBe(false);
  });
});
