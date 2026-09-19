import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  encryptCredential,
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

import { bearerToken, verifyWorkflowToken } from "../src/auth";
import { createRunServer } from "../src/http-server";
import { createRateLimiter } from "../src/rate-limit";
import { executeRun, type RunDeps } from "../src/run-client-task";
import type { OrbioClient } from "../src/orbio";

process.env.DATABASE_URL =
  "postgres://flowfuel:flowfuel@localhost:55432/flowfuel_test";

const { db, sql } = createDb(databaseUrl());
const clientStore = createClientStore(db);
const credentialStore = createCredentialStore(db);
const runStore = createRunStore(db);
const auditStore = createAuditStore(db);
const encryptionKey = randomBytes(32);
const WORKFLOW_TOKEN = "test-workflow-token";

function makeOrbio(): OrbioClient {
  let keyCalls = 0;
  return {
    listModels: async () => [],
    getKeyInfo: async () => {
      keyCalls += 1;
      const available = keyCalls === 1 ? "0.009726" : "0.009700";
      return {
        balance: {
          available,
          used: "0.000274",
          available_micro_usd: Math.round(Number(available) * 1e6),
          used_micro_usd: 274,
        },
      };
    },
    createChatCompletion: async (_credential, input) => ({
      upstreamStatus: 200,
      generationId: "gen-sec-1",
      model: "google/gemini-2.5-flash",
      provider: "google",
      content: input.tools
        ? null
        : JSON.stringify({ summary: "Lead", qualification: "medium", findings: [], risks: [], recommendedAction: "Review", confidence: 0.7, sources: [{ title: "Example", url: "https://example.com/" }] }),
      promptTokens: 10,
      completionTokens: 10,
      costUsd: 0.000013,
      balanceAfter: null,
      toolCalls: input.tools ? [{ id: "tool-1", name: "inspect_public_website", arguments: '{"url":"https://example.com"}' }] : [],
      webSearchRequests: 0,
    }),
  };
}

function deps(orbio: OrbioClient, rateLimiter?: RunDeps["rateLimiter"]): RunDeps {
  return {
    clients: clientStore,
    credentials: credentialStore,
    runs: runStore,
    audit: auditStore,
    orbio,
    encryptionKey,
    chainId: ROBINHOOD_CHAIN_ID,
    rateLimiter,
    inspectWebsite: async () => ({ url: "https://example.com/", title: "Example", text: "Example company" }),
    settleDelay: async () => {},
  };
}

let seq = 0;
async function makeClient(tag: string): Promise<ClientRow> {
  seq += 1;
  return clientStore.create({
    slug: `t13-${tag}-${Date.now()}-${seq}`,
    displayName: `T13 ${tag} ${seq}`,
    walletAddress: `0x${randomBytes(20).toString("hex")}`,
  });
}

async function storeCredential(client: ClientRow, plaintext: string) {
  await credentialStore.save({
    clientId: client.id,
    walletAddress: client.walletAddress,
    epoch: 0,
    ciphertext: encryptCredential(encryptionKey, plaintext, {
      clientId: client.id,
      walletAddress: client.walletAddress,
      chainId: ROBINHOOD_CHAIN_ID,
      epoch: 0,
    }).toString("base64"),
    fingerprint: `fp-${client.id}`,
  });
}

function runRequest(client: ClientRow, workflowRunId: string): RunRequest {
  return {
    clientId: client.id,
    workflowRunId,
    task: { type: "lead_intelligence", input: "Research https://example.com" },
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

describe("verifyWorkflowToken", () => {
  it("accepts the exact token only", () => {
    expect(verifyWorkflowToken(WORKFLOW_TOKEN, WORKFLOW_TOKEN)).toBe(true);
    expect(verifyWorkflowToken("test-workflow-tokex", WORKFLOW_TOKEN)).toBe(
      false,
    );
    expect(verifyWorkflowToken("short", WORKFLOW_TOKEN)).toBe(false);
    expect(
      verifyWorkflowToken(`${WORKFLOW_TOKEN}-suffix`, WORKFLOW_TOKEN),
    ).toBe(false);
    expect(verifyWorkflowToken(null, WORKFLOW_TOKEN)).toBe(false);
    expect(verifyWorkflowToken(undefined, WORKFLOW_TOKEN)).toBe(false);
    expect(verifyWorkflowToken("", WORKFLOW_TOKEN)).toBe(false);
  });
});

describe("bearerToken", () => {
  it("extracts only a Bearer scheme value", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("abc")).toBeNull();
    expect(bearerToken("Bearer ")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("rate limiter", () => {
  it("caps a client at the per-minute bound", () => {
    const limiter = createRateLimiter({
      perClientPerMinute: 2,
      globalPerMinute: 100,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  it("tracks clients independently", () => {
    const limiter = createRateLimiter({
      perClientPerMinute: 1,
      globalPerMinute: 100,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(false);
  });

  it("enforces the global cap across clients", () => {
    const limiter = createRateLimiter({
      perClientPerMinute: 10,
      globalPerMinute: 2,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("c")).toBe(false);
  });

  it("resets after the window passes", () => {
    let t = 1_000;
    const limiter = createRateLimiter({
      perClientPerMinute: 1,
      globalPerMinute: 100,
      now: () => t,
    });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    t += 60_001;
    expect(limiter.allow("a")).toBe(true);
  });
});

describe("executeRun rate limiting", () => {
  it("rejects a run past the client limit before creating a row", async () => {
    const client = await makeClient("limited");
    await storeCredential(client, "sk-orb-0-limited");
    const orbio = makeOrbio();
    const rateLimiter = createRateLimiter({
      perClientPerMinute: 1,
      globalPerMinute: 100,
    });

    const first = await executeRun(
      deps(orbio, rateLimiter),
      runRequest(client, "rl-1"),
    );
    expect(first.status).toBe("succeeded");

    await expect(
      executeRun(deps(orbio, rateLimiter), runRequest(client, "rl-2")),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });

    const rows = await sql.unsafe<{ count: string }[]>(
      "SELECT count(*)::text AS count FROM runs WHERE client_id = $1",
      [client.id],
    );
    expect(rows[0]?.count).toBe("1");
  });

  it("does not consume the window for an idempotent replay", async () => {
    const client = await makeClient("replay");
    await storeCredential(client, "sk-orb-0-replay");
    const orbio = makeOrbio();
    const rateLimiter = createRateLimiter({
      perClientPerMinute: 1,
      globalPerMinute: 100,
    });

    const first = await executeRun(
      deps(orbio, rateLimiter),
      runRequest(client, "rl-replay"),
    );
    expect(first.status).toBe("succeeded");

    const replay = await executeRun(
      deps(orbio, rateLimiter),
      runRequest(client, "rl-replay"),
    );
    expect(replay.status).toBe("succeeded");
    expect(replay.runId).toBe(first.runId);
  });
});

describe("tampered ciphertext", () => {
  it("fails closed when stored ciphertext is corrupted", async () => {
    const client = await makeClient("tampered");
    await storeCredential(client, "sk-orb-0-real-secret-value");
    // Corrupt the ciphertext at rest.
    const stored = await credentialStore.getForClient(client.id);
    const blob = Buffer.from(stored!.ciphertext, "base64");
    blob[blob.length - 1] = blob[blob.length - 1]! ^ 0xff;
    await sql.unsafe(
      "UPDATE client_credentials SET ciphertext = $1 WHERE client_id = $2",
      [blob.toString("base64"), client.id],
    );

    const res = await executeRun(deps(makeOrbio()), runRequest(client, "tp-1"));
    expect(res.status).toBe("provider_failed");
    const row = await runStore.getById(res.runId);
    expect(row?.status).toBe("provider_failed");
    expect(row?.generationId).toBeNull();
  });
});

describe("http boundary", () => {
  let server: ReturnType<typeof createRunServer>;
  let base: string;

  beforeAll(async () => {
    server = createRunServer(deps(makeOrbio()), WORKFLOW_TOKEN);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("rejects a missing or wrong workflow token", async () => {
    for (const auth of [undefined, "Bearer wrong", "Basic wrong"]) {
      const res = await fetch(`${base}/api/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(auth ? { authorization: auth } : {}),
        },
        body: "{}",
      });
      expect(res.status).toBe(401);
    }
  });

  it("rejects a body over the byte cap", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${WORKFLOW_TOKEN}`,
        "content-type": "application/json",
      },
      body: `{"pad":"${"x".repeat(70 * 1024)}"}`,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects malformed JSON", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${WORKFLOW_TOKEN}`,
        "content-type": "application/json",
      },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown route and unknown run", async () => {
    const token = { authorization: `Bearer ${WORKFLOW_TOKEN}` };
    const notFound = await fetch(`${base}/nope`, { headers: token });
    expect(notFound.status).toBe(404);
    const missingRun = await fetch(
      `${base}/api/runs/00000000-0000-0000-0000-000000000000`,
      { headers: token },
    );
    expect(missingRun.status).toBe(404);
  });

  it("rejects a schema-invalid run request", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${WORKFLOW_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ clientId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });
});
