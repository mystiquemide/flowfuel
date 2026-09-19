import { describe, expect, it } from "vitest";
import {
  idempotencyKey,
  nonceRequestSchema,
  registerCredentialRequestSchema,
  runRequestSchema,
  taskHash,
  verifyWalletRequestSchema,
} from "../src/index";

const CLIENT_ID = "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d";
const WALLET = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const SIG = `0x${"ab".repeat(65)}`;

describe("runRequestSchema", () => {
  const valid = {
    clientId: CLIENT_ID,
    workflowRunId: "n8n-exec-246",
    task: { type: "lead_intelligence", input: "Research this lead at https://example.com." },
    model: "google/gemini-2.5-flash",
    maxOutputTokens: 200,
  };

  it("accepts a valid request", () => {
    expect(runRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-allowlisted model", () => {
    const res = runRequestSchema.safeParse({ ...valid, model: "gpt-4o" });
    expect(res.success).toBe(false);
  });

  it.each([0, -1, 8193, 20000])("rejects maxOutputTokens %i", (n) => {
    const res = runRequestSchema.safeParse({ ...valid, maxOutputTokens: n });
    expect(res.success).toBe(false);
  });

  it("accepts the output bound", () => {
    const res = runRequestSchema.safeParse({ ...valid, maxOutputTokens: 8192 });
    expect(res.success).toBe(true);
  });

  it("rejects a missing workflowRunId", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.workflowRunId;
    expect(runRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    const res = runRequestSchema.safeParse({ ...valid, apiKey: "sk-x" });
    expect(res.success).toBe(false);
  });
});

describe("registerCredentialRequestSchema", () => {
  const valid = {
    walletAddress: WALLET,
    epoch: 0,
    orbioCredential: `sk-orb-0-${"QUJD".repeat(12)}`,
    consent: true,
    nonce: CLIENT_ID,
    signature: SIG,
  };

  it("accepts a valid registration", () => {
    expect(registerCredentialRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing consent", () => {
    const res = registerCredentialRequestSchema.safeParse({
      ...valid,
      consent: false,
    });
    expect(res.success).toBe(false);
  });

  it.each(["sk-other-abc", "notakey", "sk-orb-x-QUJD", ""])(
    "rejects credential shape %s",
    (cred) => {
      const res = registerCredentialRequestSchema.safeParse({
        ...valid,
        orbioCredential: cred,
      });
      expect(res.success).toBe(false);
    },
  );

  it("rejects a negative epoch", () => {
    const res = registerCredentialRequestSchema.safeParse({
      ...valid,
      epoch: -1,
    });
    expect(res.success).toBe(false);
  });
});

describe("nonceRequestSchema", () => {
  it("accepts a valid purpose", () => {
    const res = nonceRequestSchema.safeParse({
      clientId: CLIENT_ID,
      purpose: "register_credential",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown purpose", () => {
    const res = nonceRequestSchema.safeParse({
      clientId: CLIENT_ID,
      purpose: "admin",
    });
    expect(res.success).toBe(false);
  });
});

describe("verifyWalletRequestSchema", () => {
  it("accepts a 65-byte signature", () => {
    const res = verifyWalletRequestSchema.safeParse({
      clientId: CLIENT_ID,
      nonce: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
      walletAddress: WALLET,
      signature: SIG,
    });
    expect(res.success).toBe(true);
  });

  it("rejects a short signature", () => {
    const res = verifyWalletRequestSchema.safeParse({
      clientId: CLIENT_ID,
      nonce: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
      walletAddress: WALLET,
      signature: `0x${"ab".repeat(64)}`,
    });
    expect(res.success).toBe(false);
  });
});

describe("taskHash", () => {
  const task = { type: "lead_intelligence" as const, input: "Research this lead at https://example.com." };

  it("is deterministic for the same task", () => {
    expect(taskHash(task)).toBe(taskHash(task));
  });

  it("produces a lowercase sha256 hex", () => {
    expect(taskHash(task)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the input changes", () => {
    const other = { ...task, input: "Different lead." };
    expect(taskHash(other)).not.toBe(taskHash(task));
  });
});

describe("idempotencyKey", () => {
  it("is deterministic per client and execution", () => {
    expect(idempotencyKey(CLIENT_ID, "exec-1")).toBe(
      idempotencyKey(CLIENT_ID, "exec-1"),
    );
  });

  it("differs across clients and executions", () => {
    const a = idempotencyKey(CLIENT_ID, "exec-1");
    expect(idempotencyKey(CLIENT_ID, "exec-2")).not.toBe(a);
    expect(
      idempotencyKey("9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e", "exec-1"),
    ).not.toBe(a);
  });
});
