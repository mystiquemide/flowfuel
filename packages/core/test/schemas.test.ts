import { describe, expect, it } from "vitest";
import {
  auditEventSchema,
  clientSchema,
  decimalStringSchema,
  modelSchema,
  runSchema,
  taskSchema,
  walletAddressSchema,
} from "../src/index";

const CLIENT_A_WALLET = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const NOW = "2026-09-18T18:00:00.000Z";

const validClient = {
  id: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
  slug: "acme-labs",
  displayName: "Acme Labs",
  walletAddress: CLIENT_A_WALLET,
  chainId: 4663,
  status: "ready",
  createdAt: NOW,
  updatedAt: NOW,
};

describe("walletAddressSchema", () => {
  it("accepts a checksummed address", () => {
    expect(walletAddressSchema.parse(CLIENT_A_WALLET)).toBe(CLIENT_A_WALLET);
  });

  it("normalizes a lowercase address to checksum form", () => {
    const parsed = walletAddressSchema.parse(CLIENT_A_WALLET.toLowerCase());
    expect(parsed).toBe(CLIENT_A_WALLET);
  });

  it.each([
    "0x123",
    "notanaddress",
    "0xZZA4e72C413B1A91A25D253988BB61258d9C8c2F",
    "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F00",
    "",
  ])("rejects invalid wallet %s", (bad) => {
    expect(walletAddressSchema.safeParse(bad).success).toBe(false);
  });
});

describe("clientSchema", () => {
  it("accepts a valid client", () => {
    expect(clientSchema.parse(validClient).slug).toBe("acme-labs");
  });

  it("rejects a non-Robinhood chain id", () => {
    const res = clientSchema.safeParse({ ...validClient, chainId: 1 });
    expect(res.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const res = clientSchema.safeParse({ ...validClient, status: "hacked" });
    expect(res.success).toBe(false);
  });

  it("rejects a bad wallet", () => {
    const res = clientSchema.safeParse({ ...validClient, walletAddress: "0x1" });
    expect(res.success).toBe(false);
  });
});

describe("taskSchema", () => {
  it("accepts the allowlisted task", () => {
    const res = taskSchema.safeParse({
      type: "lead_summary",
      input: "Summarize this lead.",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown task type", () => {
    const res = taskSchema.safeParse({ type: "shell", input: "x" });
    expect(res.success).toBe(false);
  });

  it("rejects empty input", () => {
    const res = taskSchema.safeParse({ type: "lead_summary", input: "" });
    expect(res.success).toBe(false);
  });

  it("rejects input over the bound", () => {
    const res = taskSchema.safeParse({
      type: "lead_summary",
      input: "x".repeat(8_001),
    });
    expect(res.success).toBe(false);
  });
});

describe("modelSchema", () => {
  it("accepts the allowlisted model", () => {
    expect(modelSchema.safeParse("google/gemini-2.5-flash").success).toBe(true);
  });

  it.each(["gpt-4o", "claude-sonnet", "anything"])(
    "rejects non-allowlisted model %s",
    (m) => {
      expect(modelSchema.safeParse(m).success).toBe(false);
    },
  );
});

describe("decimalStringSchema", () => {
  it.each(["0", "0.009775", "1", "123.456"])("accepts %s", (v) => {
    expect(decimalStringSchema.safeParse(v).success).toBe(true);
  });

  it.each(["-1", "abc", "1.2.3", "", "NaN", "0x1"])("rejects %s", (v) => {
    expect(decimalStringSchema.safeParse(v).success).toBe(false);
  });
});

describe("runSchema", () => {
  const validRun = {
    id: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
    clientId: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
    workflowRunId: "n8n-exec-246",
    taskType: "lead_summary",
    model: "google/gemini-2.5-flash",
    status: "succeeded",
    generationId: "gen-1789751867",
    balanceBefore: "0.009801",
    balanceAfter: "0.009775",
    costUsd: "0.000026",
    promptTokens: 41,
    completionTokens: 17,
    errorCode: null,
    upstreamStatus: 200,
    taskHash: "a".repeat(64),
    idempotencyKey: "b".repeat(64),
    startedAt: NOW,
    completedAt: NOW,
  };

  it("accepts a valid run", () => {
    expect(runSchema.safeParse(validRun).success).toBe(true);
  });

  it("rejects a malformed task hash", () => {
    const res = runSchema.safeParse({ ...validRun, taskHash: "A".repeat(64) });
    expect(res.success).toBe(false);
  });

  it("strips unknown fields instead of crashing", () => {
    const res = runSchema.safeParse({
      ...validRun,
      unexpectedUpstreamField: { nested: true },
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect("unexpectedUpstreamField" in res.data).toBe(false);
    }
  });
});

describe("auditEventSchema", () => {
  it("accepts a valid event", () => {
    const res = auditEventSchema.safeParse({
      id: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
      clientId: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
      actorType: "workflow",
      eventType: "run_succeeded",
      publicData: { runId: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e" },
      createdAt: NOW,
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const res = auditEventSchema.safeParse({
      id: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e",
      clientId: null,
      actorType: "system",
      eventType: "secret_logged",
      publicData: {},
      createdAt: NOW,
    });
    expect(res.success).toBe(false);
  });
});
