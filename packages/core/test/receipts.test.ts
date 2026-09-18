import { describe, expect, it } from "vitest";
import {
  publicReceiptSchema,
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
    expect(receipt.clientWallet).toBe(
      "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
    );
    expect(receipt.activationTxHash).toBe(TX);
    expect(receipt.source).toBe("live");
  });

  it("emits only allowlisted keys", () => {
    const allowed = new Set([
      "runId",
      "status",
      "clientWallet",
      "workflowRunId",
      "taskHash",
      "model",
      "generationId",
      "balanceBefore",
      "costUsd",
      "balanceAfter",
      "upstreamStatus",
      "activationTxHash",
      "startedAt",
      "completedAt",
      "source",
    ]);
    const receipt = toPublicReceipt(sourceRun);
    for (const key of Object.keys(receipt)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("publicReceiptSchema", () => {
  const valid = {
    runId: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
    status: "succeeded",
    clientWallet: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
    workflowRunId: "n8n-exec-246",
    taskHash: "a".repeat(64),
    model: "google/gemini-2.5-flash",
    generationId: "gen-1789751867",
    balanceBefore: "0.009801",
    costUsd: "0.000026",
    balanceAfter: "0.009775",
    upstreamStatus: 200,
    activationTxHash: TX,
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
