import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  encryptCredential,
  FlowFuelError,
  ROBINHOOD_CHAIN_ID,
  type RunRequest,
} from "@flowfuel/core";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  databaseUrl,
  type ClientRow,
} from "@flowfuel/db";
import { migrateDb } from "@flowfuel/db/migrate";

import { executeRun, type RunDeps } from "../src/run-client-task";
import { bearerToken, verifyWorkflowToken } from "../src/auth";
import type { OrbioClient } from "../src/orbio";

// Integration tests run against a dedicated database so the dev data survives.
process.env.DATABASE_URL =
  "postgres://flowfuel:flowfuel@localhost:55432/flowfuel_test";

const { db, sql } = createDb(databaseUrl());
const clientStore = createClientStore(db);
const credentialStore = createCredentialStore(db);
const runStore = createRunStore(db);
const auditStore = createAuditStore(db);
const encryptionKey = randomBytes(32);

const CLIENT_A_SECRET = `sk-orb-0-${Buffer.alloc(65, 1).toString("base64")}`;

interface OrbioSpy {
  client: OrbioClient;
  keyInfoCredentials: string[];
  completionCredentials: string[];
  completions: number;
}

function makeOrbio(overrides: Partial<{
  keyInfoError: FlowFuelError;
  keyInfoErrorOnCall: number;
  completionError: FlowFuelError;
  balances: string[];
  delay: number;
}> = {}): OrbioSpy {
  let keyInfoCalls = 0;
  const balances = overrides.balances ?? ["0.009726", "0.009700"];
  const spy: OrbioSpy = {
    keyInfoCredentials: [],
    completionCredentials: [],
    completions: 0,
    client: {
      listModels: async () => [],
      getKeyInfo: async (credential: string) => {
        spy.keyInfoCredentials.push(credential);
        keyInfoCalls += 1;
        if (overrides.keyInfoError) throw overrides.keyInfoError;
        if (overrides.keyInfoErrorOnCall === keyInfoCalls) {
          throw new FlowFuelError("PROVIDER_FAILED", "key read failed", {
            upstreamStatus: 503,
          });
        }
        if (overrides.delay) {
          await new Promise((r) => setTimeout(r, overrides.delay));
        }
        const available =
          balances[Math.min(keyInfoCalls - 1, balances.length - 1)]!;
        return {
          balance: {
            available,
            used: "0.000274",
            available_micro_usd: Math.round(Number(available) * 1e6),
            used_micro_usd: 274,
          },
        };
      },
      createChatCompletion: async (credential: string, input) => {
        spy.completionCredentials.push(credential);
        spy.completions += 1;
        if (overrides.completionError) throw overrides.completionError;
        return {
          upstreamStatus: 200,
          generationId: `gen-test-${spy.completions}`,
          model: "google/gemini-2.5-flash",
          provider: "google",
          content: input.tools
            ? null
            : JSON.stringify({
                summary: "Qualified lead",
                qualification: "high",
                findings: ["Clear automation need"],
                risks: [],
                recommendedAction: "Book discovery call",
                confidence: 0.9,
                sources: [{ title: "ACME", url: "https://example.com/" }],
              }),
          promptTokens: 42,
          completionTokens: 17,
          costUsd: 0.000013,
          balanceAfter: null,
          toolCalls: input.tools
            ? [{ id: "tool-1", name: "inspect_public_website", arguments: '{"url":"https://example.com"}' }]
            : [],
          webSearchRequests: 0,
        };
      },
    },
  };
  return spy;
}

function deps(orbio: OrbioClient): RunDeps {
  return {
    clients: clientStore,
    credentials: credentialStore,
    runs: runStore,
    audit: auditStore,
    orbio,
    encryptionKey,
    chainId: ROBINHOOD_CHAIN_ID,
    inspectWebsite: async () => ({ url: "https://example.com/", title: "Example", text: "Example company" }),
  };
}

let seq = 0;
async function makeClient(tag: string): Promise<ClientRow> {
  seq += 1;
  const wallet = `0x${randomBytes(20).toString("hex")}`;
  return clientStore.create({
    slug: `t07-${tag}-${Date.now()}-${seq}`,
    displayName: `T07 ${tag} ${seq}`,
    walletAddress: wallet,
  });
}

async function storeCredential(
  client: ClientRow,
  plaintext: string,
  epoch = 0,
) {
  const aad = {
    clientId: client.id,
    walletAddress: client.walletAddress,
    chainId: ROBINHOOD_CHAIN_ID,
    epoch,
  };
  await credentialStore.save({
    clientId: client.id,
    walletAddress: client.walletAddress,
    epoch,
    ciphertext: encryptCredential(encryptionKey, plaintext, aad).toString("base64"),
    fingerprint: `fp-${client.id}`,
  });
}

function runRequest(client: ClientRow, workflowRunId: string): RunRequest {
  return {
    clientId: client.id,
    workflowRunId,
    task: { type: "lead_intelligence", input: "Research ACME at https://example.com" },
    model: "google/gemini-2.5-flash",
    maxOutputTokens: 128,
  };
}

beforeAll(async () => {
  await migrateDb(db);
});

beforeEach(async () => {
  await sql.unsafe(
    "TRUNCATE audit_events, runs, activations, client_credentials, wallet_nonces, clients RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await sql.end();
});

describe("executeRun", () => {
  it("succeeds for a funded client and returns a receipt", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-1"));

    expect(res.status).toBe("succeeded");
    if (res.status !== "succeeded") return;
    expect(JSON.parse(res.result).qualification).toBe("high");
    expect(res.receipt.clientWallet).toBe(clientA.walletAddress);
    expect(res.receipt.generationId).toBe("gen-test-2");
    expect(res.receipt.balanceBefore).toBe("0.009726");
    expect(res.receipt.balanceAfter).toBe("0.009700");
    expect(res.receipt.costUsd).toBe("0.000026");

    const row = await runStore.getById(res.runId);
    expect(row?.status).toBe("succeeded");
    expect(row?.taskHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves only the requesting client's credential", async () => {
    const clientA = await makeClient("a");
    const clientB = await makeClient("b");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();

    const res = await executeRun(deps(orbio.client), runRequest(clientB, "exec-b1"));

    expect(res.status).toBe("client_unfunded");
    // Client B's request never touched the gateway: zero credential use.
    expect(orbio.keyInfoCredentials).toHaveLength(0);
    expect(orbio.completionCredentials).toHaveLength(0);
    expect(orbio.completions).toBe(0);
  });

  it("never uses Client A's credential for Client B", async () => {
    const clientA = await makeClient("a");
    const clientB = await makeClient("b");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();

    await executeRun(deps(orbio.client), runRequest(clientB, "exec-b2"));
    expect(orbio.completionCredentials).not.toContain(CLIENT_A_SECRET);
    expect(orbio.keyInfoCredentials).not.toContain(CLIENT_A_SECRET);
  });

  it("returns the stored receipt for a duplicate workflowRunId without recharging", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();
    const d = deps(orbio.client);

    const first = await executeRun(d, runRequest(clientA, "exec-dup"));
    const second = await executeRun(d, runRequest(clientA, "exec-dup"));

    expect(orbio.completions).toBe(2);
    expect(second.status === "succeeded" && second.result).toBe(
      first.status === "succeeded" ? first.result : "",
    );
    expect(second.runId).toBe(first.runId);
    expect(second.status).toBe("succeeded");
  });

  it("concurrent duplicate execution IDs produce one gateway charge", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();
    const d = deps(orbio.client);

    const [r1, r2, r3] = await Promise.all([
      executeRun(d, runRequest(clientA, "exec-par")),
      executeRun(d, runRequest(clientA, "exec-par")),
      executeRun(d, runRequest(clientA, "exec-par")),
    ]);

    expect(orbio.completions).toBe(2);
    expect(new Set([r1.runId, r2.runId, r3.runId]).size).toBe(1);
    const rows = await runStore.listByClient(clientA.id);
    expect(rows).toHaveLength(1);
  });

  it("serializes concurrent runs for the same client", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    let concurrent = 0;
    let maxConcurrent = 0;
    const orbio = makeOrbio();
    const baseCompletion = orbio.client.createChatCompletion;
    orbio.client.createChatCompletion = async (cred, input, ctx) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 25));
      try {
        return await baseCompletion(cred, input, ctx);
      } finally {
        concurrent -= 1;
      }
    };
    const d = deps(orbio.client);

    await Promise.all([
      executeRun(d, runRequest(clientA, "exec-s1")),
      executeRun(d, runRequest(clientA, "exec-s2")),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(orbio.completions).toBe(4);
  });

  it("marks quota errors terminal with no charge recorded", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio({
      completionError: new FlowFuelError("QUOTA_EXCEEDED", "insufficient_quota", {
        upstreamStatus: 402,
      }),
    });

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-q"));

    expect(res.status).toBe("quota_exceeded");
    if (res.status === "succeeded") return;
    expect(res.error.code).toBe("QUOTA_EXCEEDED");
    expect(res.error.upstreamStatus).toBe(402);
    const row = await runStore.getById(res.runId);
    expect(row?.status).toBe("quota_exceeded");
    expect(row?.generationId).toBeNull();
    expect(row?.costUsd).toBeNull();
    expect(row?.balanceAfter).toBeNull();
    // The balance read before the rejected call is kept as evidence that
    // the rejection left the client's balance untouched.
    expect(row?.balanceBefore).toBe("0.009726");
  });

  it("treats a 401 on a stored credential as revoked", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    await credentialStore.markVerified(clientA.id, "0.010000");
    const orbio = makeOrbio({
      keyInfoError: new FlowFuelError("CREDENTIAL_REVOKED", "Orbio rejected the credential", {
        upstreamStatus: 401,
      }),
    });

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-r"));

    expect(res.status).toBe("provider_failed");
    if (res.status === "succeeded") return;
    expect(res.error.code).toBe("CREDENTIAL_REVOKED");
    expect(orbio.completions).toBe(0);
  });

  it("rejects an unknown clientId without touching stores", async () => {
    const orbio = makeOrbio();
    await expect(
      executeRun(deps(orbio.client), {
        clientId: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
        workflowRunId: "exec-x",
        task: { type: "lead_intelligence", input: "x" },
        model: "google/gemini-2.5-flash",
        maxOutputTokens: 64,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(orbio.completions).toBe(0);
  });

  it("marks a balance mismatch as reconciliation_failed, not success", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    // Delta is 40 micro-USD but the reported cost is 26: the receipt cannot
    // reconcile, so the run must not present as succeeded.
    const orbio = makeOrbio({ balances: ["0.009726", "0.009686"] });

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-rec1"));

    expect(res.status).toBe("reconciliation_failed");
    if (res.status === "succeeded") return;
    expect(res.error.code).toBe("RECONCILIATION_FAILED");
    const row = await runStore.getById(res.runId);
    expect(row?.status).toBe("reconciliation_failed");
    // The charge evidence is preserved for investigation.
    expect(row?.generationId).toBe("gen-test-2");
    expect(row?.costUsd).toBe("0.000026");
  });

  it("marks a failed balance-after read as reconciliation_failed", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio({ keyInfoErrorOnCall: 2 });

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-rec2"));

    expect(res.status).toBe("reconciliation_failed");
    if (res.status === "succeeded") return;
    expect(res.error.code).toBe("RECONCILIATION_FAILED");
    expect(res.error.upstreamStatus).toBe(503);
    const row = await runStore.getById(res.runId);
    expect(row?.status).toBe("reconciliation_failed");
  });

  it("keeps every terminal run's receipt consistent through toPublicReceipt", async () => {
    const { toPublicReceipt } = await import("@flowfuel/core");
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio({ balances: ["0.009726", "0.009686"] });

    const res = await executeRun(deps(orbio.client), runRequest(clientA, "exec-rec3"));
    const row = await runStore.getById(res.runId);
    const receipt = toPublicReceipt({
      id: row!.id,
      clientWallet: clientA.walletAddress,
      workflowRunId: row!.workflowRunId,
      taskHash: row!.taskHash,
      model: row!.model,
      status: row!.status,
      generationId: row!.generationId,
      generations: row!.generations,
      balanceBefore: row!.balanceBefore,
      costUsd: row!.costUsd,
      balanceAfter: row!.balanceAfter,
      upstreamStatus: row!.upstreamStatus,
      startedAt: row!.startedAt.toISOString(),
      completedAt: row!.completedAt?.toISOString() ?? null,
    });
    expect(receipt.status).toBe("reconciliation_failed");
    expect(receipt.reconciled).toBe(false);
  });

  it("writes an audit event for every terminal run", async () => {
    const clientA = await makeClient("a");
    await storeCredential(clientA, CLIENT_A_SECRET);
    const orbio = makeOrbio();

    await executeRun(deps(orbio.client), runRequest(clientA, "exec-audit"));

    const events = await sql.unsafe(
      "SELECT event_type, public_data FROM audit_events ORDER BY created_at",
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.event_type).toBe("run_succeeded");
    const data = events[0]!.public_data as Record<string, unknown>;
    expect(data.generationId).toBe("gen-test-2");
    expect(JSON.stringify(data)).not.toContain(CLIENT_A_SECRET);
  });
});

describe("workflow token auth", () => {
  it("accepts the matching bearer token", () => {
    expect(verifyWorkflowToken("tok-secret", "tok-secret")).toBe(true);
    expect(verifyWorkflowToken(bearerToken("Bearer tok-secret"), "tok-secret")).toBe(true);
  });

  it("rejects wrong, missing, and malformed tokens", () => {
    expect(verifyWorkflowToken("nope", "tok-secret")).toBe(false);
    expect(verifyWorkflowToken(null, "tok-secret")).toBe(false);
    expect(verifyWorkflowToken(bearerToken("Basic dG9r"), "tok-secret")).toBe(false);
    expect(verifyWorkflowToken(bearerToken(undefined), "tok-secret")).toBe(false);
    expect(bearerToken("Bearer")).toBeNull();
  });
});
