import { describe, expect, it } from "vitest";
import type { RefuelExecutionStatus } from "@flowfuel/core";
import type {
  ClientRefuelPolicyRow,
  ConfirmRefuelInput,
  RefuelExecutionRow,
} from "@flowfuel/db";
import { createRefuelCoordinator } from "../src/refuel";
import type { RefuelVaultClient, VaultState } from "../src/refuel-vault";

const CLIENT = "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d";
const WALLET = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const EXECUTOR = "0x00000000000000000000000000000000000000e1";

const policy: ClientRefuelPolicyRow = {
  clientId: CLIENT,
  enabled: true,
  thresholdUsd: "0.500000",
  refillAmountUsdg: "1.000000",
  weeklyCapUsdg: "3.000000",
  executorAddress: EXECUTOR,
  maxSlippageBps: 200,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeVault(overrides: Partial<VaultState> = {}) {
  let refuelCalls = 0;
  const state: VaultState = {
    reserve: 5_000_000n,
    policy: {
      enabled: true,
      executor: EXECUTOR,
      refillAmount: 1_000_000n,
      weeklyCap: 3_000_000n,
      maxSlippageBps: 200,
    },
    weekEpoch: 10n,
    weekSpent: 0n,
    ...overrides,
  };
  const vault: RefuelVaultClient = {
    executorAddress: EXECUTOR,
    readState: async () => state,
    refuel: async () => {
      refuelCalls += 1;
      return {
        transactionHash: `0x${"ab".repeat(32)}`,
        beneficiary: WALLET,
        usdgSpent: 1_000_000n,
        creditOut: 1_400_000n,
        activationId: 12n,
        quoteCreditOut: 1_400_000n,
        quoteUsdgSpent: 1_000_000n,
        minCreditOut: 1_372_000n,
        quoteFeeAtoms: 20_000n,
        quoteFills: 1n,
        quoteReason: 0,
        week: 10n,
        weekSpentAfter: 1_000_000n,
      };
    },
  };
  return {
    vault,
    get refuelCalls() {
      return refuelCalls;
    },
  };
}

function makeCoordinator(
  vault: RefuelVaultClient,
  policyOverride: Partial<ClientRefuelPolicyRow> = {},
) {
  const rows: RefuelExecutionRow[] = [];
  const activeStatuses: RefuelExecutionStatus[] = ["requested", "submitted", "confirmed", "indexing"];
  const executions = {
    create: async (input: {
      clientId: string;
      runId: string;
      workflowRunId: string;
      triggerBalance: string;
      threshold: string;
      requestedAmount: string;
      beneficiaryAddress: string;
      status?: RefuelExecutionStatus;
      errorCode?: string | null;
      errorMessage?: string | null;
    }) => {
      const row = {
        ...input,
        id: `refuel-${rows.length + 1}`,
        transactionHash: null,
        status: input.status ?? "requested",
        quoteCreditOut: null,
        quoteUsdgSpent: null,
        quoteFeeAtoms: null,
        quoteFills: null,
        quoteReason: null,
        minCreditOut: null,
        usdgSpent: null,
        creditOut: null,
        activationId: null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        startedAt: new Date(),
        submittedAt: null,
        confirmedAt: null,
        indexedAt: null,
      } as unknown as RefuelExecutionRow;
      rows.push(row);
      return row;
    },
    getActiveForClient: async (clientId: string) =>
      rows.find((row) => row.clientId === clientId && activeStatuses.includes(row.status)) ?? null,
    updateSubmitted: async (id: string, transactionHash: string) => {
      const row = rows.find((item) => item.id === id)!;
      row.transactionHash = transactionHash;
      row.status = "submitted";
      return row;
    },
    updateConfirmed: async (id: string, input: ConfirmRefuelInput) => {
      const row = rows.find((item) => item.id === id)!;
      Object.assign(row, input, { status: "indexing" });
      return row;
    },
    markIndexed: async (id: string) => {
      const row = rows.find((item) => item.id === id)!;
      row.status = "indexed";
      return row;
    },
    markBlocked: async (id: string, status: RefuelExecutionStatus, errorCode: string, errorMessage: string) => {
      const row = rows.find((item) => item.id === id)!;
      Object.assign(row, { status, errorCode, errorMessage });
      return row;
    },
    markFailed: async (id: string, errorCode: string, errorMessage: string) => {
      const row = rows.find((item) => item.id === id)!;
      Object.assign(row, { status: "failed", errorCode, errorMessage });
      return row;
    },
  };
  const coordinator = createRefuelCoordinator({
    policies: { getForClient: async () => ({ ...policy, ...policyOverride }) },
    executions,
    vault,
  });
  return { coordinator, rows };
}

describe("refuel coordinator", () => {
  it("submits one refuel and reuses the active indexing record", async () => {
    const vault = makeVault();
    const { coordinator } = makeCoordinator(vault.vault);
    const input = {
      clientId: CLIENT,
      clientWallet: WALLET,
      runId: "run-1",
      workflowRunId: "workflow-1",
      triggerBalance: "0.180000",
    };
    const first = await coordinator.prepare(input);
    const second = await coordinator.prepare({ ...input, runId: "run-2", workflowRunId: "workflow-2" });
    expect(first.kind).toBe("indexing");
    expect(second.kind).toBe("indexing");
    expect(first.kind === "indexing" && second.kind === "indexing" && first.executionId).toBe(second.kind === "indexing" ? second.executionId : "");
    expect(vault.refuelCalls).toBe(1);
  });

  it("blocks before the transaction when reserve is empty", async () => {
    const vault = makeVault({ reserve: 0n });
    const { coordinator } = makeCoordinator(vault.vault);
    const result = await coordinator.prepare({
      clientId: CLIENT,
      clientWallet: WALLET,
      runId: "run-3",
      workflowRunId: "workflow-3",
      triggerBalance: "0.180000",
    });
    expect(result.kind).toBe("blocked_no_reserve");
    expect(vault.refuelCalls).toBe(0);
  });

  it("blocks before the transaction when the weekly cap has no room", async () => {
    const vault = makeVault({
      weekSpent: 2_500_000n,
      policy: {
        enabled: true,
        executor: EXECUTOR,
        refillAmount: 1_000_000n,
        weeklyCap: 3_000_000n,
        maxSlippageBps: 200,
      },
    });
    const { coordinator } = makeCoordinator(vault.vault);
    const result = await coordinator.prepare({
      clientId: CLIENT,
      clientWallet: WALLET,
      runId: "run-4",
      workflowRunId: "workflow-4",
      triggerBalance: "0.180000",
    });
    expect(result.kind).toBe("blocked_weekly_cap");
    expect(vault.refuelCalls).toBe(0);
  });

  it("blocks a stale or unauthorized keeper policy", async () => {
    const stateVault = makeVault();
    const baseline = await stateVault.vault.readState(CLIENT);
    stateVault.vault.readState = async () => ({
      ...baseline,
      policy: {
        enabled: true,
        executor: "0x00000000000000000000000000000000000000e2",
        refillAmount: 1_000_000n,
        weeklyCap: 3_000_000n,
        maxSlippageBps: 200,
      },
    });
    const { coordinator } = makeCoordinator(stateVault.vault);
    const result = await coordinator.prepare({
      clientId: CLIENT,
      clientWallet: WALLET,
      runId: "run-5",
      workflowRunId: "workflow-5",
      triggerBalance: "0.180000",
    });
    expect(result.kind).toBe("blocked_policy");
    expect(stateVault.refuelCalls).toBe(0);
  });
});
