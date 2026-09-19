import { getAddress } from "viem";
import {
  FlowFuelError,
  decimalToUnits,
  unitsToDecimal,
  type RefuelExecutionStatus,
} from "@flowfuel/core";
import type {
  RefuelExecutionRow,
  createRefuelExecutionStore,
  createRefuelPolicyStore,
} from "@flowfuel/db";
import { RefuelUnknownOutcomeError, type RefuelVaultClient } from "./refuel-vault";

export interface RefuelPrepareInput {
  clientId: string;
  clientWallet: string;
  runId: string;
  workflowRunId: string;
  triggerBalance: string;
}

export type RefuelOutcome =
  | { kind: "disabled" | "not_needed" }
  | {
      kind:
        | "indexing"
        | "blocked_no_reserve"
        | "blocked_weekly_cap"
        | "blocked_policy"
        | "failed";
      executionId: string;
      status: RefuelExecutionStatus;
      transactionHash: string | null;
      creditOut: string | null;
    };

export interface RefuelCoordinator {
  prepare(input: RefuelPrepareInput): Promise<RefuelOutcome>;
  markIndexed(executionId: string): Promise<void>;
}

type PolicyStore = Pick<ReturnType<typeof createRefuelPolicyStore>, "getForClient">;
type ExecutionStore = Pick<
  ReturnType<typeof createRefuelExecutionStore>,
  "create" | "getActiveForClient" | "updateSubmitted" | "updateConfirmed" | "markIndexed" | "markBlocked" | "markFailed"
>;

interface RefuelCoordinatorDeps {
  policies: PolicyStore;
  executions: ExecutionStore;
  vault: RefuelVaultClient;
}

function amountUnits(value: string): bigint {
  try {
    return decimalToUnits(value);
  } catch {
    throw new FlowFuelError(
      "REFUEL_POLICY_BLOCKED",
      "The stored refuel policy contains an invalid amount",
      { action: "Review the client policy before enabling auto-refuel." },
    );
  }
}

function blockedOutcome(
  row: RefuelExecutionRow,
  kind: Extract<RefuelOutcome["kind"], "blocked_no_reserve" | "blocked_weekly_cap" | "blocked_policy">,
): RefuelOutcome {
  return {
    kind,
    executionId: row.id,
    status: row.status,
    transactionHash: row.transactionHash,
    creditOut: row.creditOut,
  };
}

export function createRefuelCoordinator(deps: RefuelCoordinatorDeps): RefuelCoordinator {
  return {
    async prepare(input: RefuelPrepareInput): Promise<RefuelOutcome> {
      const policy = await deps.policies.getForClient(input.clientId);
      if (!policy || !policy.enabled) return { kind: "disabled" };

      const trigger = amountUnits(input.triggerBalance);
      const threshold = amountUnits(policy.thresholdUsd);
      if (trigger >= threshold) return { kind: "not_needed" };

      const active = await deps.executions.getActiveForClient(input.clientId);
      if (active) {
        return {
          kind: "indexing",
          executionId: active.id,
          status: active.status,
          transactionHash: active.transactionHash,
          creditOut: active.creditOut,
        };
      }

      let state;
      try {
        state = await deps.vault.readState(input.clientWallet);
      } catch {
        const row = await deps.executions.create({
          clientId: input.clientId,
          runId: input.runId,
          workflowRunId: input.workflowRunId,
          triggerBalance: input.triggerBalance,
          threshold: policy.thresholdUsd,
          requestedAmount: policy.refillAmountUsdg,
          beneficiaryAddress: input.clientWallet,
        });
        const blocked = await deps.executions.markBlocked(
          row.id,
          "blocked_policy",
          "REFUEL_POLICY_BLOCKED",
          "The vault policy could not be read. No refuel was attempted.",
        );
        return blockedOutcome(blocked ?? { ...row, status: "blocked_policy" }, "blocked_policy");
      }

      const refill = amountUnits(policy.refillAmountUsdg);
      const weeklyCap = amountUnits(policy.weeklyCapUsdg);
      let executorMatches = false;
      try {
        executorMatches = getAddress(state.policy.executor) === getAddress(policy.executorAddress)
          && getAddress(state.policy.executor) === getAddress(deps.vault.executorAddress);
      } catch {
        executorMatches = false;
      }
      const policyMatches =
        state.policy.enabled &&
        executorMatches &&
        state.policy.refillAmount === refill &&
        state.policy.weeklyCap === weeklyCap &&
        state.policy.maxSlippageBps === policy.maxSlippageBps;

      const row = await deps.executions.create({
        clientId: input.clientId,
        runId: input.runId,
        workflowRunId: input.workflowRunId,
        triggerBalance: input.triggerBalance,
        threshold: policy.thresholdUsd,
        requestedAmount: policy.refillAmountUsdg,
        beneficiaryAddress: input.clientWallet,
      });

      if (!policyMatches) {
        const blocked = await deps.executions.markBlocked(
          row.id,
          "blocked_policy",
          "REFUEL_POLICY_BLOCKED",
          "The stored client policy does not match the vault policy. No refuel was attempted.",
        );
        return blockedOutcome(blocked ?? { ...row, status: "blocked_policy" }, "blocked_policy");
      }

      if (state.reserve < refill) {
        const blocked = await deps.executions.markBlocked(
          row.id,
          "blocked_no_reserve",
          "REFUEL_POLICY_BLOCKED",
          `Reserve ${unitsToDecimal(state.reserve)} USDG is below the ${policy.refillAmountUsdg} USDG refill amount.`,
        );
        return blockedOutcome(blocked ?? { ...row, status: "blocked_no_reserve" }, "blocked_no_reserve");
      }

      if (state.weekSpent > weeklyCap || refill > weeklyCap - state.weekSpent) {
        const blocked = await deps.executions.markBlocked(
          row.id,
          "blocked_weekly_cap",
          "REFUEL_POLICY_BLOCKED",
          `Weekly cap ${policy.weeklyCapUsdg} USDG has no room for the configured refill.`,
        );
        return blockedOutcome(blocked ?? { ...row, status: "blocked_weekly_cap" }, "blocked_weekly_cap");
      }

      let chain;
      try {
        chain = await deps.vault.refuel(input.clientWallet);
      } catch (error) {
        if (error instanceof RefuelUnknownOutcomeError) {
          try {
            await deps.executions.updateSubmitted(row.id, error.transactionHash);
          } catch {
            // Keep the requested row active. A later run must not retry an
            // onchain call whose transaction outcome is unknown.
          }
          return {
            kind: "indexing",
            executionId: row.id,
            status: "submitted",
            transactionHash: error.transactionHash,
            creditOut: null,
          };
        }
        const mapped = error instanceof FlowFuelError
          ? error
          : new FlowFuelError("REFUEL_FAILED", "The refuel transaction did not complete");
        const failed = await deps.executions.markFailed(
          row.id,
          mapped.code,
          mapped.message,
        );
        return {
          kind: "failed",
          executionId: row.id,
          status: failed?.status ?? "failed",
          transactionHash: failed?.transactionHash ?? null,
          creditOut: null,
        };
      }
      try {
        await deps.executions.updateSubmitted(row.id, chain.transactionHash);
        const confirmed = await deps.executions.updateConfirmed(row.id, {
          transactionHash: chain.transactionHash,
          quoteCreditOut: chain.quoteCreditOut.toString(),
          quoteUsdgSpent: chain.quoteUsdgSpent.toString(),
          minCreditOut: chain.minCreditOut.toString(),
          usdgSpent: chain.usdgSpent.toString(),
          creditOut: chain.creditOut.toString(),
          activationId: chain.activationId.toString(),
          quoteFeeAtoms: chain.quoteFeeAtoms.toString(),
          quoteFills: chain.quoteFills.toString(),
          quoteReason: chain.quoteReason,
        });
        return {
          kind: "indexing",
          executionId: row.id,
          status: confirmed?.status ?? "indexing",
          transactionHash: chain.transactionHash,
          creditOut: chain.creditOut.toString(),
        };
      } catch {
        // The chain result is known, but persistence is not. Keep the row
        // active so a retry cannot submit a second refuel.
        return {
          kind: "indexing",
          executionId: row.id,
          status: "submitted",
          transactionHash: chain.transactionHash,
          creditOut: chain.creditOut.toString(),
        };
      }
    },

    async markIndexed(executionId: string): Promise<void> {
      await deps.executions.markIndexed(executionId);
    },
  };
}
