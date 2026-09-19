import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql as dsql } from "drizzle-orm";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  createRefuelExecutionStore,
  createRefuelPolicyStore,
  databaseUrl,
} from "../src/index";

// Integration tests run against a dedicated database so the dev data survives.
process.env.DATABASE_URL =
  "postgres://flowfuel:flowfuel@localhost:55432/flowfuel_test";

const { db, sql } = createDb(databaseUrl());
const clientStore = createClientStore(db);
const credentialStore = createCredentialStore(db);
const runStore = createRunStore(db);
const auditStore = createAuditStore(db);
const refuelPolicyStore = createRefuelPolicyStore(db);
const refuelExecutionStore = createRefuelExecutionStore(db);

const WALLET_A = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const WALLET_B = "0xA0234103102008dCf310182a829Cd18408373CEC";

async function makeClient(slug: string, wallet: string) {
  return clientStore.create({ slug, displayName: slug, walletAddress: wallet });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

beforeEach(async () => {
  await db.execute(dsql`
    TRUNCATE audit_events, runs, activations, client_credentials,
             wallet_nonces, clients RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await sql.end();
});

describe("client store", () => {
  it("creates and resolves a client", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    expect(c.chainId).toBe(4663);
    expect((await clientStore.getById(c.id))?.slug).toBe("acme-labs");
    expect((await clientStore.getBySlug("acme-labs"))?.id).toBe(c.id);
  });

  it("rejects a duplicate wallet", async () => {
    await makeClient("acme-labs", WALLET_A);
    await expect(makeClient("other", WALLET_A)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects a duplicate slug", async () => {
    await makeClient("acme-labs", WALLET_A);
    await expect(makeClient("acme-labs", WALLET_B)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("credential store isolation", () => {
  it("resolves only the caller's own credential", async () => {
    const a = await makeClient("acme-labs", WALLET_A);
    const b = await makeClient("northstar", WALLET_B);

    await credentialStore.save({
      clientId: a.id,
      walletAddress: WALLET_A,
      epoch: 0,
      ciphertext: "deadbeef",
      fingerprint: "f".repeat(64),
    });

    const forA = await credentialStore.getForClient(a.id);
    expect(forA?.clientId).toBe(a.id);
    expect(forA?.ciphertext).toBe("deadbeef");

    const forB = await credentialStore.getForClient(b.id);
    expect(forB).toBeNull();
  });

  it("exposes no lookup path by wallet or fingerprint", () => {
    const keys = Object.keys(credentialStore);
    expect(keys).not.toContain("getByWallet");
    expect(keys).not.toContain("getByFingerprint");
  });

  it("each tenant resolves only its own row after both register", async () => {
    const a = await makeClient("acme-labs", WALLET_A);
    const b = await makeClient("northstar", WALLET_B);
    await credentialStore.save({
      clientId: a.id,
      walletAddress: WALLET_A,
      epoch: 0,
      ciphertext: "aaaa",
      fingerprint: "f".repeat(64),
    });
    await credentialStore.save({
      clientId: b.id,
      walletAddress: WALLET_B,
      epoch: 0,
      ciphertext: "bbbb",
      fingerprint: "e".repeat(64),
    });
    expect((await credentialStore.getForClient(a.id))?.ciphertext).toBe("aaaa");
    expect((await credentialStore.getForClient(b.id))?.ciphertext).toBe("bbbb");
  });
});

describe("run store", () => {
  it("keeps the activation context captured when the run was created", async () => {
    const c = await makeClient("activation-context", WALLET_A);
    const txA = `0x${"a".repeat(64)}`;
    const txB = `0x${"b".repeat(64)}`;
    const run = await runStore.create({
      clientId: c.id,
      workflowRunId: "activation-stability",
      taskType: "lead_intelligence",
      model: "google/gemini-2.5-flash",
      taskHash: "a".repeat(64),
      idempotencyKey: "activation-stability".padEnd(64, "0"),
      activationTxHash: txA,
    });
    await db.insert((await import("../src/schema")).activations).values({
      clientId: c.id,
      transactionHash: txB,
      amountUsd: "1.000000",
      status: "confirmed",
    });
    expect((await runStore.getById(run.id))?.activationTxHash).toBe(txA);
  });

  it("is idempotent on the workflow execution key", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    const input = {
      clientId: c.id,
      workflowRunId: "exec-246",
      taskType: "lead_intelligence",
      model: "google/gemini-2.5-flash",
      taskHash: "a".repeat(64),
      idempotencyKey: "k".repeat(64),
    };
    const r1 = await runStore.create(input);
    const r2 = await runStore.create(input);
    expect(r2.id).toBe(r1.id);
    const all = await runStore.listByClient(c.id);
    expect(all.length).toBe(1);
  });

  it("terminal states cannot return to running or be rewritten", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    const run = await runStore.create({
      clientId: c.id,
      workflowRunId: "exec-246",
      taskType: "lead_intelligence",
      model: "google/gemini-2.5-flash",
      taskHash: "a".repeat(64),
      idempotencyKey: "k".repeat(64),
    });
    const done = await runStore.complete(run.id, {
      status: "succeeded",
      generationId: "gen-1",
      balanceBefore: "0.009801",
      balanceAfter: "0.009775",
      costUsd: "0.000026",
      upstreamStatus: 200,
    });
    expect(done?.status).toBe("succeeded");

    const second = await runStore.complete(run.id, {
      status: "provider_failed",
      errorCode: "PROVIDER_FAILED",
    });
    expect(second).toBeNull();

    const fresh = await runStore.getById(run.id);
    expect(fresh?.status).toBe("succeeded");
    expect(fresh?.generationId).toBe("gen-1");
  });

  it("sumChargedCost counts every run that produced a charge", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    const make = (key: string) =>
      runStore.create({
        clientId: c.id,
        workflowRunId: `exec-${key}`,
        taskType: "lead_intelligence",
        model: "google/gemini-2.5-flash",
        taskHash: "a".repeat(64),
        idempotencyKey: key.padEnd(64, "0"),
      });

    const ok = await make("ok");
    await runStore.complete(ok.id, {
      status: "succeeded",
      costUsd: "0.000100",
      upstreamStatus: 200,
    });

    const failed = await make("failed");
    await runStore.complete(failed.id, {
      status: "reconciliation_failed",
      costUsd: "0.000085",
      upstreamStatus: 200,
    });

    const free = await make("free");
    await runStore.complete(free.id, {
      status: "client_unfunded",
      upstreamStatus: 401,
    });

    expect(await runStore.sumChargedCost(c.id)).toBeCloseTo(0.000185, 6);
  });
});

describe("nonce store", () => {
  it("consumes a nonce exactly once", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    const n = await clientStore.createNonce(c.id, "register_credential");
    const first = await clientStore.consumeNonce(
      n.nonce,
      c.id,
      "register_credential",
    );
    expect(first?.nonce).toBe(n.nonce);
    const second = await clientStore.consumeNonce(
      n.nonce,
      c.id,
      "register_credential",
    );
    expect(second).toBeNull();
  });

  it("rejects expired, wrong-purpose, and wrong-client nonces", async () => {
    const a = await makeClient("acme-labs", WALLET_A);
    const b = await makeClient("northstar", WALLET_B);

    const expired = await clientStore.createNonce(
      a.id,
      "register_credential",
      -60,
    );
    expect(
      await clientStore.consumeNonce(expired.nonce, a.id, "register_credential"),
    ).toBeNull();

    const n = await clientStore.createNonce(a.id, "register_credential");
    expect(await clientStore.consumeNonce(n.nonce, a.id, "connect")).toBeNull();
    expect(await clientStore.consumeNonce(n.nonce, b.id, "register_credential")).toBeNull();
    expect(
      await clientStore.consumeNonce(n.nonce, a.id, "register_credential"),
    ).not.toBeNull();
  });
});

describe("audit store", () => {
  it("appends secret-free audit events", async () => {
    const c = await makeClient("acme-labs", WALLET_A);
    const ev = await auditStore.append({
      clientId: c.id,
      actorType: "client",
      eventType: "credential_registered",
      publicData: { epoch: 0, fingerprint: "f".repeat(16) },
    });
    expect(ev.publicData).toMatchObject({ epoch: 0 });
  });
});

describe("refuel stores", () => {
  it("keeps policy records tenant-bound and updates the client policy", async () => {
    const a = await makeClient("refuel-a", WALLET_A);
    const b = await makeClient("refuel-b", WALLET_B);
    await refuelPolicyStore.save({
      clientId: a.id,
      enabled: true,
      thresholdUsd: "0.500000",
      refillAmountUsdg: "1.000000",
      weeklyCapUsdg: "3.000000",
      executorAddress: "0x00000000000000000000000000000000000000e1",
      maxSlippageBps: 200,
    });
    expect((await refuelPolicyStore.getForClient(a.id))?.thresholdUsd).toBe("0.500000");
    expect(await refuelPolicyStore.getForClient(b.id)).toBeNull();

    const updated = await refuelPolicyStore.save({
      clientId: a.id,
      enabled: false,
      thresholdUsd: "0.250000",
      refillAmountUsdg: "1.000000",
      weeklyCapUsdg: "3.000000",
      executorAddress: "0x00000000000000000000000000000000000000e1",
      maxSlippageBps: 200,
    });
    expect(updated.enabled).toBe(false);
    expect((await refuelPolicyStore.getForClient(a.id))?.thresholdUsd).toBe("0.250000");
  });

  it("tracks an active refuel through indexing without crossing clients", async () => {
    const a = await makeClient("refuel-exec-a", WALLET_A);
    const b = await makeClient("refuel-exec-b", WALLET_B);
    const run = await runStore.create({
      clientId: a.id,
      workflowRunId: "refuel-workflow",
      taskType: "lead_intelligence",
      model: "google/gemini-2.5-flash",
      taskHash: "a".repeat(64),
      idempotencyKey: "refuel-idempotency".padEnd(64, "0"),
    });
    const row = await refuelExecutionStore.create({
      clientId: a.id,
      runId: run.id,
      workflowRunId: "refuel-workflow",
      triggerBalance: "0.180000",
      threshold: "0.500000",
      requestedAmount: "1.000000",
      beneficiaryAddress: WALLET_A,
    });
    expect((await refuelExecutionStore.getActiveForClient(a.id))?.id).toBe(row.id);
    expect(await refuelExecutionStore.getActiveForClient(b.id)).toBeNull();

    await refuelExecutionStore.updateSubmitted(row.id, `0x${"b".repeat(64)}`);
    const confirmed = await refuelExecutionStore.updateConfirmed(row.id, {
      transactionHash: `0x${"b".repeat(64)}`,
      quoteCreditOut: "1400560",
      quoteUsdgSpent: "980392",
      minCreditOut: "1372548",
      usdgSpent: "980392",
      creditOut: "1400560",
      activationId: "241",
    });
    expect(confirmed?.status).toBe("indexing");
    await refuelExecutionStore.markIndexed(row.id);
    expect((await refuelExecutionStore.getByRunId(run.id))?.status).toBe("indexed");
  });
});
