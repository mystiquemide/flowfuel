import {
  FlowFuelError,
  refuelPolicyThresholdRequestSchema,
  unitsToDecimal,
  uuidSchema,
} from "@flowfuel/core";
import {
  createClientStore,
  createDb,
  createRefuelPolicyStore,
} from "@flowfuel/db";

import { databaseUrlFromEnv, refuelVaultAddressFromEnv } from "../../../../../lib/env";
import { errorResponse, parseJson } from "../../../../../lib/http";
import { refuelVaultState } from "../../../../../lib/chain";
import { assertClientSession } from "../../../../../lib/client-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Persists the offchain trigger only after reading the wallet-owned policy
 * from the vault. Refill amount, executor, cap, and slippage remain onchain.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    assertClientSession(request, clientId);
    const vaultAddress = refuelVaultAddressFromEnv();
    if (!vaultAddress) {
      throw new FlowFuelError("CONFLICT", "Auto-refuel vault is not configured");
    }
    const input = refuelPolicyThresholdRequestSchema.parse(await parseJson(request));
    const { db } = createDb(databaseUrlFromEnv());
    const client = await createClientStore(db).getById(clientId);
    if (!client) throw new FlowFuelError("NOT_FOUND", "Client not found");
    const onchain = await refuelVaultState(vaultAddress, client.walletAddress);
    if (onchain.policy.refillAmount === BigInt(0) || onchain.policy.weeklyCap === BigInt(0)) {
      throw new FlowFuelError(
        "CONFLICT",
        "Configure the onchain refill policy before saving its threshold",
        { action: "Set the vault policy from the client wallet, then save again." },
      );
    }
    const row = await createRefuelPolicyStore(db).save({
      clientId,
      enabled: onchain.policy.enabled,
      thresholdUsd: input.thresholdUsd,
      refillAmountUsdg: unitsToDecimal(onchain.policy.refillAmount),
      weeklyCapUsdg: unitsToDecimal(onchain.policy.weeklyCap),
      executorAddress: onchain.policy.executor,
      maxSlippageBps: onchain.policy.maxSlippageBps,
    });
    return Response.json({
      enabled: row.enabled,
      thresholdUsd: row.thresholdUsd,
      refillAmountUsdg: row.refillAmountUsdg,
      weeklyCapUsdg: row.weeklyCapUsdg,
      executorAddress: row.executorAddress,
      maxSlippageBps: row.maxSlippageBps,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
