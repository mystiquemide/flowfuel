import { createOrbioClient } from "@flowfuel/broker";
import {
  FlowFuelError,
  unitsToDecimal,
  updateClientStatusRequestSchema,
  uuidSchema,
} from "@flowfuel/core";
import {
  createActivationStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  createRefuelExecutionStore,
  createRefuelPolicyStore,
} from "@flowfuel/db";

import {
  credentialEncryptionKey,
  databaseUrlFromEnv,
  orbioBaseUrlFromEnv,
  refuelExecutorAddressFromEnv,
  refuelVaultAddressFromEnv,
} from "../../../../lib/env";
import { errorResponse, parseJson } from "../../../../lib/http";
import { creditBalanceOf, refuelVaultState, usdgBalanceOf } from "../../../../lib/chain";
import { liveActivatedBalance } from "../../../../lib/live";
import { updateClientStatus } from "../../../../lib/registration";
import { registrationDeps } from "../../../../lib/services";
import {
  assertClientSession,
  clientAccessFromRequest,
} from "../../../../lib/client-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireDetailAccess(request: Request, clientId: string): void {
  const access = clientAccessFromRequest(request, clientId);
  if (access === "forbidden") {
    throw new FlowFuelError(
      "FORBIDDEN",
      "This client session cannot access another client",
    );
  }
  if (!access) {
    throw new FlowFuelError("UNAUTHORIZED", "Client authentication required");
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    const { db } = createDb(databaseUrlFromEnv());
    const clients = createClientStore(db);
    // Pages pass either the UUID or the slug; both identify the same client.
    const client = uuidSchema.safeParse(clientId).success
      ? await clients.getById(clientId)
      : await clients.getBySlug(clientId);
    if (!client) {
      throw new FlowFuelError("NOT_FOUND", "Client not found");
    }
    requireDetailAccess(request, client.id);
    const credentials = createCredentialStore(db);
    const runs = createRunStore(db);
    const activations = createActivationStore(db);
    const refuelPolicies = createRefuelPolicyStore(db);
    const refuelExecutions = createRefuelExecutionStore(db);
    const credential = await credentials.getForClient(client.id);
    const vaultAddress = refuelVaultAddressFromEnv();

    const [balance, transferable, usdg, totalSpent, activation, recent, refuelPolicy, activeRefuel, vaultState] =
      await Promise.all([
        liveActivatedBalance({
          orbio: createOrbioClient({ baseUrl: orbioBaseUrlFromEnv() }),
          encryptionKey: credentialEncryptionKey(),
          client,
          credential,
        }),
        creditBalanceOf(client.walletAddress).catch(() => null),
        usdgBalanceOf(client.walletAddress).catch(() => null),
        runs.sumChargedCost(client.id),
        activations.latestForClient(client.id),
        runs.listByClient(client.id, 20),
        refuelPolicies.getForClient(client.id),
        refuelExecutions.getActiveForClient(client.id),
        vaultAddress
          ? refuelVaultState(vaultAddress, client.walletAddress).catch(() => null)
          : Promise.resolve(null),
      ]);

    return Response.json({
      id: client.id,
      slug: client.slug,
      displayName: client.displayName,
      walletAddress: client.walletAddress,
      chainId: client.chainId,
      status: client.status,
      credentialRegistered: credential !== null,
      epoch: credential?.epoch ?? null,
      verifiedBalance: credential?.verifiedBalance ?? null,
      activatedBalance: balance.available,
      activatedUsed: balance.used,
      balanceReadAt: balance.readAt,
      balanceUnavailableReason: balance.reason ?? null,
      transferableCreditUnits: transferable?.toString() ?? null,
      usdgBalanceUnits: usdg?.toString() ?? null,
      totalSpentUsd: totalSpent.toFixed(6),
      latestActivation: activation
        ? {
            transactionHash: activation.transactionHash,
            amountUsd: activation.amountUsd,
            activationId: activation.activationId,
            blockNumber: activation.blockNumber,
          }
        : null,
      recentRuns: recent.map((run) => ({
        runId: run.id,
        status: run.status,
        taskHash: run.taskHash,
        costUsd: run.costUsd,
        generationId: run.generationId,
        workflowRunId: run.workflowRunId,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      })),
      autoRefuel: vaultAddress
        ? {
            vaultAddress,
            enabled: vaultState?.policy.enabled ?? refuelPolicy?.enabled ?? false,
            thresholdUsd: refuelPolicy?.thresholdUsd ?? "0.500000",
            refillAmountUsdg:
              vaultState ? unitsToDecimal(vaultState.policy.refillAmount) : refuelPolicy?.refillAmountUsdg ?? "1.000000",
            weeklyCapUsdg:
              vaultState ? unitsToDecimal(vaultState.policy.weeklyCap) : refuelPolicy?.weeklyCapUsdg ?? "3.000000",
            executorAddress:
              vaultState?.policy.executor ?? refuelPolicy?.executorAddress ?? refuelExecutorAddressFromEnv(),
            maxSlippageBps:
              vaultState?.policy.maxSlippageBps ?? refuelPolicy?.maxSlippageBps ?? 200,
            reserveUsdg: vaultState ? unitsToDecimal(vaultState.reserve) : "0.000000",
            weeklySpentUsdg: vaultState ? unitsToDecimal(vaultState.weekSpent) : "0.000000",
            weekEpoch: vaultState?.weekEpoch.toString() ?? null,
            activeRefuel: activeRefuel
              ? {
                  id: activeRefuel.id,
                  status: activeRefuel.status,
                  transactionHash: activeRefuel.transactionHash,
                  startedAt: activeRefuel.startedAt.toISOString(),
                }
              : null,
          }
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Signed status change. The wallet owner signs a pause_client nonce; only
 * `paused` and `ready` are reachable this way, since pending, unfunded, and
 * revoked are driven by credential state rather than wallet intent.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    assertClientSession(request, clientId);
    const input = updateClientStatusRequestSchema.parse(
      await parseJson(request),
    );
    const result = await updateClientStatus(
      registrationDeps(),
      clientId,
      input,
    );
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
