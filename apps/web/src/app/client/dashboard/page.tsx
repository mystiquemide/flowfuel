"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAddress } from "viem";
import { ROBINHOOD_CHAIN_ID, explorerTxUrl } from "@flowfuel/core";
import { FlowFuelLogo } from "@/components/flowfuel-logo";
import {
  authenticateClient,
  activateCredit,
  approveUsdgForVault,
  connectInjected,
  depositUsdg,
  disableRefuelPolicy,
  injectedChainId,
  injectedProvider,
  issueNonce,
  readApiError,
  requestRobinhoodChain,
  setRefuelPolicy,
  signNonceMessage,
  truncateMiddle,
  unitsToUsd,
  withdrawUsdg,
  usdToUnits,
} from "@/lib/browser";

interface ClientDetail {
  id: string;
  slug: string;
  displayName: string;
  walletAddress: string;
  status: string;
  credentialRegistered: boolean;
  epoch: number | null;
  activatedBalance: string | null;
  activatedUsed: string | null;
  balanceReadAt: string;
  balanceUnavailableReason: string | null;
  transferableCreditUnits: string | null;
  totalSpentUsd: string;
  latestActivation: {
    transactionHash: string;
    amountUsd: string;
    activationId: number | null;
    blockNumber: number | null;
  } | null;
  recentRuns: Array<{
    runId: string;
    status: string;
    taskHash: string;
    costUsd: string | null;
    generationId: string | null;
    startedAt: string;
  }>;
  autoRefuel: {
    vaultAddress: string;
    enabled: boolean;
    thresholdUsd: string;
    refillAmountUsdg: string;
    weeklyCapUsdg: string;
    executorAddress: string | null;
    maxSlippageBps: number;
    reserveUsdg: string;
    weeklySpentUsdg: string;
    weekEpoch: string | null;
    activeRefuel: {
      id: string;
      status: string;
      transactionHash: string | null;
      startedAt: string;
    } | null;
  } | null;
}

interface ClientBootstrap {
  id: string;
  displayName: string;
  walletAddress: string;
  chainId: number;
}

interface ClientListEntry {
  id: string;
  slug: string;
  displayName: string;
  status: string;
}

type ActionPhase =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "error"; message: string };

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  ready: { label: "ACTIVE & FUNDED", color: "var(--success)" },
  unfunded: { label: "UNFUNDED", color: "var(--danger)" },
  paused: { label: "PAUSED", color: "var(--warning)" },
  revoked: { label: "REVOKED", color: "var(--danger)" },
  pending: { label: "PENDING SETUP", color: "var(--ink-muted)" },
};

const RUN_LABEL: Record<string, string> = {
  succeeded: "succeeded",
  refuel_pending: "refuel pending",
  client_unfunded: "blocked · unfunded",
  quota_exceeded: "quota stop",
  provider_failed: "provider failed",
  reconciliation_failed: "reconciliation flagged",
  validation_failed: "validation failed",
  running: "running",
};

function DashboardInner() {
  const searchParams = useSearchParams();
  const clientParam = searchParams.get("client");

  const [clients, setClients] = useState<ClientListEntry[] | null>(null);
  const [bootstrap, setBootstrap] = useState<ClientBootstrap | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [phase, setPhase] = useState<ActionPhase>({ kind: "idle" });

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [showKeyDetails, setShowKeyDetails] = useState(false);
  const [refuelThreshold, setRefuelThreshold] = useState("0.500000");
  const [refuelAmount, setRefuelAmount] = useState("1.000000");
  const [refuelWeeklyCap, setRefuelWeeklyCap] = useState("3.000000");
  const [refuelExecutor, setRefuelExecutor] = useState("");
  const [refuelSlippage, setRefuelSlippage] = useState("200");
  const [refuelDepositAmount, setRefuelDepositAmount] = useState("");
  const [refuelWithdrawAmount, setRefuelWithdrawAmount] = useState("");

  const loadDetail = useCallback(async (idOrSlug: string) => {
    try {
      const res = await fetch(`/api/clients/${idOrSlug}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as ClientDetail;
      setDetail(body);
      if (body.autoRefuel) {
        setRefuelThreshold(body.autoRefuel.thresholdUsd);
        setRefuelAmount(body.autoRefuel.refillAmountUsdg);
        setRefuelWeeklyCap(body.autoRefuel.weeklyCapUsdg);
        setRefuelExecutor(body.autoRefuel.executorAddress ?? "");
        setRefuelSlippage(String(body.autoRefuel.maxSlippageBps));
      }
      setLoadError(null);
      return body;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load this client. Try again.");
      return null;
    }
  }, []);

  const loadBootstrap = useCallback(async (idOrSlug: string) => {
    try {
      const res = await fetch(`/api/clients/${idOrSlug}/bootstrap`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as ClientBootstrap;
      setBootstrap(body);
      setLoadError(null);
      return body;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load this client link. Try again.");
      return null;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (clientParam) {
        void loadBootstrap(clientParam);
        return;
      }
      setClients([]);
      setLoadError("Open the client-specific dashboard link sent by your agency.");
    });
  }, [clientParam, loadBootstrap]);

  async function handleConnect() {
    setPhase({ kind: "working", label: "Connecting wallet" });
    try {
      const addr = await connectInjected();
      setAccount(addr);
      setChainId(await injectedChainId().catch(() => null));
      if (!bootstrap) throw new Error("Client link is still loading. Try again.");
      if (getAddress(addr) !== getAddress(bootstrap.walletAddress)) {
        setPhase({ kind: "idle" });
        return;
      }
      setPhase({ kind: "working", label: "Verifying wallet ownership" });
      await authenticateClient(bootstrap.id, addr);
      await loadDetail(bootstrap.id);
      setPhase({ kind: "idle" });
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Couldn't connect the wallet. Try again." });
    }
  }

  async function handleDisconnect() {
    const eth = injectedProvider();
    setAccount(null);
    setChainId(null);
    setDetail(null);
    setPhase({ kind: "idle" });
    try {
      await eth?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallets without revokePermissions still get their local state cleared.
    }
  }

  const expectedWallet = detail?.walletAddress ?? bootstrap?.walletAddress ?? null;
  const walletMismatch =
    account !== null &&
    expectedWallet !== null &&
    getAddress(account) !== getAddress(expectedWallet);
  const wrongChain = account !== null && chainId !== null && chainId !== ROBINHOOD_CHAIN_ID;
  const walletReady = account !== null && !walletMismatch && !wrongChain;
  const busy = phase.kind === "working";

  async function ensureWallet(): Promise<`0x${string}`> {
    if (account && walletReady) return account;
    const addr = await connectInjected();
    setAccount(addr);
    const chain = await injectedChainId().catch(() => null);
    setChainId(chain);
    if (detail && getAddress(addr) !== getAddress(detail.walletAddress)) {
      throw new Error(`This wallet isn't the registered client wallet. Switch to ${truncateMiddle(detail.walletAddress, 6, 4)} to continue.`);
    }
    if (chain !== null && chain !== ROBINHOOD_CHAIN_ID) {
      await requestRobinhoodChain();
      setChainId(await injectedChainId());
    }
    return addr;
  }

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    const units = usdToUnits(topUpAmount || "0");
    if (units <= BigInt(0)) {
      setPhase({ kind: "error", message: "Enter an amount above 0 to top up." });
      return;
    }
    setPhase({ kind: "working", label: `Confirm activate(${topUpAmount} CREDIT) in your wallet` });
    try {
      const addr = await ensureWallet();
      const txHash = await activateCredit(addr, units);
      setPhase({ kind: "working", label: "Verifying activation on chain" });
      const res = await fetch(`/api/clients/${detail.id}/activation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash: txHash }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as { amountUsd: string };
      setShowTopUp(false);
      setTopUpAmount("");
      setNotice(`Activated $${body.amountUsd} on Robinhood Chain · tx ${truncateMiddle(txHash, 10, 8)}. The gateway index updates within a minute.`);
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 8000);
      setTimeout(() => void loadDetail(detail.slug), 10_000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The top up didn't finish. Try again." });
    }
  }

  async function handleDepositReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!detail?.autoRefuel) return;
    const units = usdToUnits(refuelDepositAmount || "0");
    if (units <= BigInt(0)) {
      setPhase({ kind: "error", message: "Enter a USDG deposit amount above 0." });
      return;
    }
    setPhase({ kind: "working", label: "Confirm USDG approval for the refuel vault" });
    try {
      const addr = await ensureWallet();
      await approveUsdgForVault(addr, detail.autoRefuel.vaultAddress, units);
      setPhase({ kind: "working", label: "Confirm USDG deposit in your wallet" });
      await depositUsdg(addr, detail.autoRefuel.vaultAddress, units);
      setRefuelDepositAmount("");
      setNotice("USDG deposited into your client-owned refuel reserve. Unused reserve remains withdrawable.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 7000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The USDG deposit did not finish." });
    }
  }

  async function handleWithdrawReserve(withdrawAll = false) {
    if (!detail?.autoRefuel) return;
    const amount = withdrawAll ? detail.autoRefuel.reserveUsdg : refuelWithdrawAmount;
    const units = usdToUnits(amount || "0");
    if (units <= BigInt(0)) {
      setPhase({ kind: "error", message: "Enter a USDG withdrawal amount above 0." });
      return;
    }
    setPhase({ kind: "working", label: "Confirm reserve withdrawal in your wallet" });
    try {
      const addr = await ensureWallet();
      await withdrawUsdg(addr, detail.autoRefuel.vaultAddress, units);
      setRefuelWithdrawAmount("");
      setNotice(withdrawAll ? "All unused USDG was withdrawn to your wallet." : "Unused USDG was withdrawn to your wallet.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 6000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The USDG withdrawal did not finish." });
    }
  }

  async function handleSaveRefuelPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!detail?.autoRefuel) return;
    const refillUnits = usdToUnits(refuelAmount || "0");
    const weeklyUnits = usdToUnits(refuelWeeklyCap || "0");
    const thresholdUnits = usdToUnits(refuelThreshold || "0");
    const slippage = Number(refuelSlippage);
    if (
      refillUnits <= BigInt(0) ||
      weeklyUnits < refillUnits ||
      thresholdUnits < BigInt(0) ||
      !Number.isInteger(slippage) ||
      slippage < 0 ||
      slippage > 1_000
    ) {
      setPhase({ kind: "error", message: "Use positive refill and weekly values, with weekly maximum at least the refill and slippage from 0 to 1000 bps." });
      return;
    }
    let executor: `0x${string}`;
    try {
      executor = getAddress(refuelExecutor) as `0x${string}`;
    } catch {
      setPhase({ kind: "error", message: "Enter the authorized FlowFuel keeper address." });
      return;
    }
    setPhase({ kind: "working", label: "Confirm the bounded refuel policy in your wallet" });
    try {
      const addr = await ensureWallet();
      await setRefuelPolicy(
        addr,
        detail.autoRefuel.vaultAddress,
        executor,
        refillUnits,
        weeklyUnits,
        slippage,
      );
      setPhase({ kind: "working", label: "Saving the live Orbio balance threshold" });
      const res = await fetch(`/api/clients/${detail.id}/refuel-policy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thresholdUsd: refuelThreshold }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setNotice("Auto-refuel is enabled. The threshold is read from live Orbio state and spending limits are enforced by the vault.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 8000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The refuel policy did not finish." });
    }
  }

  async function handleDisableRefuel() {
    if (!detail?.autoRefuel) return;
    setPhase({ kind: "working", label: "Confirm disabling auto-refuel in your wallet" });
    try {
      const addr = await ensureWallet();
      await disableRefuelPolicy(addr, detail.autoRefuel.vaultAddress);
      const res = await fetch(`/api/clients/${detail.id}/refuel-policy`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thresholdUsd: refuelThreshold }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setNotice("Auto-refuel disabled. Your unused USDG reserve remains yours and can still be withdrawn.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 7000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Auto-refuel could not be disabled." });
    }
  }

  async function handlePauseToggle() {
    if (!detail) return;
    const target = detail.status === "paused" ? "ready" : "paused";
    setPhase({ kind: "working", label: `Sign the ${target === "paused" ? "pause" : "resume"} message in your wallet` });
    try {
      const addr = await ensureWallet();
      const { nonce, message } = await issueNonce(detail.id, "pause_client");
      const signature = await signNonceMessage(addr, message);
      setPhase({ kind: "working", label: "Submitting signed status change" });
      const res = await fetch(`/api/clients/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: target, nonce, signature }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setNotice(target === "paused" ? "Automation paused. The broker rejects runs before any gateway call." : "Automation resumed.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 5000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The status change didn't finish. Try again." });
    }
  }

  async function handleRevoke() {
    if (!detail) return;
    setPhase({ kind: "working", label: "Sign the revocation message in your wallet" });
    try {
      const addr = await ensureWallet();
      const { nonce, message } = await issueNonce(detail.id, "revoke_credential");
      const signature = await signNonceMessage(addr, message);
      setPhase({ kind: "working", label: "Revoking credential" });
      const res = await fetch(`/api/clients/${detail.id}/credential`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce, signature }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setConfirmingRevoke(false);
      setNotice("Credential revoked and deleted. This client can no longer run inference until a new credential is registered.");
      setPhase({ kind: "idle" });
      setTimeout(() => setNotice(null), 8000);
      await loadDetail(detail.slug);
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "The revocation didn't finish. Try again." });
    }
  }

  const balance = detail?.activatedBalance !== null && detail?.activatedBalance !== undefined
    ? Number(detail.activatedBalance)
    : null;
  const spent = detail
    ? detail.activatedUsed !== null
      ? Number(detail.activatedUsed)
      : Number(detail.totalSpentUsd)
    : 0;
  const status = detail ? STATUS_LABEL[detail.status] ?? { label: detail.status.toUpperCase(), color: "var(--ink-muted)" } : null;
  const cap = balance !== null ? balance + spent : spent;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)", color: "var(--ink)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--canvas)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center" }}>
              <FlowFuelLogo size={28} />
            </Link>
            <span
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                color: "var(--ink-muted)",
                backgroundColor: "var(--surface)",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
              }}
            >
              Robinhood Chain 4663
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Link href="/" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Home
            </Link>
            <Link href="/agency" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Agency Workspace
            </Link>
            <Link href="/proof" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Live Proof
            </Link>
            {detail && (
              <div
                style={{
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  backgroundColor: "var(--surface)",
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: "1px solid var(--border)",
                  color: "var(--ink)",
                }}
              >
                {detail.displayName}: {truncateMiddle(detail.walletAddress, 6, 4)}
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="workspace-page-fade" style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 24px 60px" }}>
        {notice && (
          <div
            style={{
              padding: "12px 18px",
              backgroundColor: "rgba(22, 163, 74, 0.08)",
              border: "1px solid rgba(22, 163, 74, 0.25)",
              borderRadius: 6,
              color: "var(--success)",
              fontSize: "0.875rem",
              fontWeight: 500,
              marginBottom: 20,
            }}
          >
            {notice}
          </div>
        )}
        {phase.kind === "error" && (
          <div
            style={{
              padding: "12px 18px",
              backgroundColor: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.25)",
              borderRadius: 6,
              color: "var(--danger)",
              fontSize: "0.875rem",
              fontFamily: "var(--font-mono)",
              marginBottom: 20,
            }}
          >
            {phase.message}
          </div>
        )}
        {busy && (
          <div
            style={{
              padding: "12px 18px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--ink-muted)",
              fontSize: "0.875rem",
              fontFamily: "var(--font-mono)",
              marginBottom: 20,
            }}
          >
            {phase.label}…
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6875rem",
              letterSpacing: "0.06em",
              color: "var(--fuel)",
              fontWeight: 600,
              display: "inline-block",
              marginBottom: 4,
            }}
          >
            CLIENT DASHBOARD
          </span>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 550,
              letterSpacing: "-0.025em",
              margin: "0 0 4px",
              color: "var(--ink)",
              lineHeight: 1.25,
            }}
          >
            AI Spending and Activity
          </h1>
          {detail && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              <div>
                <span>Client:</span>{" "}
                <strong style={{ color: "var(--ink)", fontWeight: 500 }}>{detail.displayName}</strong>
              </div>
              <span>·</span>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                {detail.walletAddress}
              </div>
              {detail.activatedBalance !== null && (
                <>
                  <span>·</span>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                    live · read {new Date(detail.balanceReadAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Client picker */}
        {!clientParam && !detail && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--canvas)",
              padding: "14px 18px",
              marginBottom: 14,
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
              Select a client
            </h2>
            {clients === null && !loadError && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>Loading clients…</p>
            )}
            {clients !== null && clients.length === 0 && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                No clients registered yet. Create one in the agency workspace.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clients?.map((c) => (
                <Link
                  key={c.id}
                  href={`/client/dashboard?client=${c.slug}`}
                  className="btn-quiet-action"
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 6,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>{c.displayName}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>{c.status}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {clientParam && !detail && !bootstrap && !loadError && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>Loading client…</p>
        )}
        {loadError && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--danger)" }}>{loadError}</p>
        )}

        {clientParam && !detail && bootstrap && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
              padding: "18px 20px",
              marginBottom: 16,
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--fuel)", letterSpacing: "0.06em", marginBottom: 6 }}>
              CLIENT SESSION
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem", fontWeight: 550 }}>{bootstrap.displayName}</h2>
            <p style={{ margin: "0 0 4px", color: "var(--ink-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
              Expected wallet: {truncateMiddle(bootstrap.walletAddress, 8, 6)}
            </p>
            <p style={{ margin: "0 0 14px", color: "var(--ink-muted)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
              Robinhood Chain {bootstrap.chainId}
            </p>
            {account && walletMismatch && (
              <p style={{ margin: "0 0 12px", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                Wrong wallet connected. Switch to the expected client wallet.
              </p>
            )}
            <button
              onClick={() => void handleConnect()}
              disabled={phase.kind === "working"}
              className="btn-primary-action"
              style={{ backgroundColor: "var(--fuel)", color: "#ffffff", border: "none", padding: "8px 14px", borderRadius: 6, fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", opacity: phase.kind === "working" ? 0.55 : 1 }}
            >
              {account && !walletMismatch ? "Verify wallet and continue" : "Connect wallet"}
            </button>
          </div>
        )}

        {detail && (
          <>
            {/* Wallet bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginBottom: 16,
                fontSize: "0.8125rem",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                {account
                  ? walletMismatch
                    ? `Connected ${truncateMiddle(account, 6, 4)} does not match this client`
                    : wrongChain
                      ? "Connected · wrong network"
                      : `Wallet connected ${truncateMiddle(account, 6, 4)}`
                  : "Connect the client wallet for top-ups and controls"}
              </span>
              {account && wrongChain ? (
                <button
                  onClick={() => void requestRobinhoodChain().then(() => injectedChainId().then(setChainId))}
                  className="btn-quiet-action"
                  style={{ padding: "5px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer", color: "var(--warning)" }}
                >
                  Switch to Robinhood Chain 4663
                </button>
              ) : account ? (
                <button
                  onClick={() => void handleDisconnect()}
                  className="btn-quiet-action"
                  style={{ padding: "5px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer" }}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => void handleConnect()}
                  className="btn-quiet-action"
                  style={{ padding: "5px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer" }}
                >
                  Connect Wallet
                </button>
              )}
            </div>

            {/* Stat cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  padding: "11px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  backgroundColor: "var(--surface)",
                }}
              >
                <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  ACTIVATED BALANCE
                </div>
                <div
                  style={{
                    fontSize: "1.625rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: balance !== null ? "var(--success)" : "var(--ink-muted)",
                    margin: "2px 0 6px",
                  }}
                >
                  {balance !== null ? `$${balance.toFixed(6)}` : detail.credentialRegistered ? "unavailable" : "$0.000000"}
                </div>
                <button
                  onClick={() => setShowTopUp(!showTopUp)}
                  className="btn-primary-action"
                  style={{
                    backgroundColor: "var(--fuel)",
                    color: "#ffffff",
                    border: "none",
                    padding: "3px 10px",
                    borderRadius: 5,
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    lineHeight: 1.35,
                  }}
                >
                  + Activate More CREDIT
                </button>
              </div>

              <div
                style={{
                  padding: "11px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  backgroundColor: "var(--surface)",
                }}
              >
                <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  TOTAL SPENT
                </div>
                <div
                  style={{
                    fontSize: "1.625rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink)",
                    margin: "2px 0 4px",
                  }}
                >
                  ${spent.toFixed(6)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
                  {detail.recentRuns.filter((r) => r.status === "succeeded").length} succeeded run(s)
                </div>
              </div>

              <div
                style={{
                  padding: "11px 16px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  backgroundColor: "var(--surface)",
                }}
              >
                <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  ORBIO BALANCE STATUS
                </div>
                <div
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    color: status!.color,
                    margin: "4px 0 4px",
                  }}
                >
                  {status!.label}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowKeyDetails(!showKeyDetails)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: "var(--ink-muted)",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        transform: showKeyDetails ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 160ms var(--ease-out-cubic)",
                        flexShrink: 0,
                      }}
                    >
                      <path
                        d="M4.5 2.5L8 6L4.5 9.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{showKeyDetails ? "Hide technical details" : "View technical details"}</span>
                  </button>
                  {showKeyDetails && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)", marginTop: 4, lineHeight: 1.6 }}>
                      Credential epoch: {detail.epoch ?? "none"} · Robinhood Chain 4663
                      {detail.transferableCreditUnits !== null && (
                        <>
                          <br />
                          Transferable CREDIT: {unitsToUsd(BigInt(detail.transferableCreditUnits))}
                        </>
                      )}
                      {detail.latestActivation && (
                        <>
                          <br />
                          Activation:{" "}
                          <a
                            href={explorerTxUrl(detail.latestActivation.transactionHash)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--ink-muted)", textDecoration: "underline" }}
                          >
                            {truncateMiddle(detail.latestActivation.transactionHash, 10, 8)}
                          </a>
                          {detail.latestActivation.activationId !== null && ` · ID #${detail.latestActivation.activationId}`}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Top Up */}
            {showTopUp && (
              <div
                style={{
                  padding: "16px 20px",
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  marginBottom: 20,
                }}
              >
                <h3 style={{ margin: "0 0 6px", fontSize: "0.9375rem", fontWeight: 550, color: "var(--ink)" }}>
                  Activate More CREDIT
                </h3>
                <p style={{ margin: "0 0 12px", fontSize: "0.8125rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
                  Sends activate(amount) to CREDIT contract {truncateMiddle("0xe33322da1380e61e5ae5dfb21e7f62924c73004c", 10, 6)} from your wallet. The activated amount becomes spendable inference credit.
                  {detail.transferableCreditUnits !== null && (
                    <> Transferable balance: {unitsToUsd(BigInt(detail.transferableCreditUnits))} CREDIT.</>
                  )}
                </p>
                <form onSubmit={(e) => void handleTopUp(e)} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    placeholder="0.010000"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 5,
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--canvas)",
                      color: "var(--ink)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.875rem",
                      width: 140,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary-action"
                    style={{
                      backgroundColor: "var(--fuel)",
                      color: "#ffffff",
                      border: "none",
                      padding: "7px 14px",
                      borderRadius: 5,
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    {busy ? "Working…" : "Send activate()"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTopUp(false)}
                    className="btn-quiet-action"
                    style={{
                      padding: "7px 12px",
                      borderRadius: 5,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </form>
              </div>
            )}

            {/* Spending meter */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "16px 20px",
                backgroundColor: "var(--surface)",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: "0.9375rem", fontWeight: 550, color: "var(--ink)" }}>Activated vs spent</span>
                <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                  Activated total: ${cap.toFixed(6)}
                </span>
              </div>

              <div
                style={{
                  height: 10,
                  backgroundColor: "var(--canvas)",
                  borderRadius: 5,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  display: "flex",
                }}
              >
                {cap > 0 && (
                  <>
                    <div
                      style={{
                        width: `${(spent / cap) * 100}%`,
                        backgroundColor: "var(--danger)",
                        transition: "width 240ms var(--ease-out-cubic)",
                      }}
                    />
                    <div
                      style={{
                        width: `${((balance ?? 0) / cap) * 100}%`,
                        backgroundColor: "var(--success)",
                        transition: "width 240ms var(--ease-out-cubic)",
                      }}
                    />
                  </>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span style={{ color: "var(--danger)" }}>Spent: ${spent.toFixed(6)}</span>
                <span style={{ color: "var(--success)" }}>Activated now: ${(balance ?? 0).toFixed(6)}</span>
              </div>
            </div>

            {detail.autoRefuel && (
              <section
                aria-labelledby="auto-refuel-title"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "16px 20px",
                  backgroundColor: "var(--surface)",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--fuel)", letterSpacing: "0.05em", fontWeight: 600 }}>
                      AUTONOMOUS REFUELING
                    </span>
                    <h2 id="auto-refuel-title" style={{ margin: "3px 0 4px", fontSize: "1rem", fontWeight: 550, color: "var(--ink)" }}>
                      Auto-refuel
                    </h2>
                    <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.8125rem", lineHeight: 1.5, maxWidth: 680 }}>
                      USDG deposited here remains yours until an approved refuel uses it. The trigger is evaluated from live Orbio balance data. Reserve ownership, beneficiary, refill size, slippage, and weekly spending are enforced by the vault.
                    </p>
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6875rem",
                      color: detail.autoRefuel.enabled ? "var(--success)" : "var(--ink-muted)",
                      border: `1px solid ${detail.autoRefuel.enabled ? "rgba(102, 209, 158, 0.45)" : "var(--border)"}`,
                      padding: "4px 9px",
                      borderRadius: 4,
                    }}
                  >
                    {detail.autoRefuel.enabled ? "ON" : "OFF"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
                  {[
                    ["INFERENCE BALANCE", detail.activatedBalance === null ? "unavailable" : `$${detail.activatedBalance}`],
                    ["REFUEL RESERVE", `${detail.autoRefuel.reserveUsdg} USDG`],
                    ["USED THIS WEEK", `${detail.autoRefuel.weeklySpentUsdg} / ${detail.autoRefuel.weeklyCapUsdg} USDG`],
                    ["TRIGGER BELOW", `$${detail.autoRefuel.thresholdUsd}`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ padding: "9px 11px", backgroundColor: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 5 }}>
                      <div style={{ fontSize: "0.625rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: "0.875rem", fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: 600 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {detail.autoRefuel.enabled &&
                  detail.activatedBalance !== null &&
                  Number(detail.activatedBalance) < Number(detail.autoRefuel.thresholdUsd) &&
                  detail.autoRefuel.reserveUsdg === "0.000000" && (
                    <div style={{ marginBottom: 12, padding: "9px 11px", border: "1px solid rgba(239, 116, 111, 0.4)", backgroundColor: "rgba(239, 116, 111, 0.06)", borderRadius: 5, color: "var(--danger)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                      AUTO-REFUEL UNAVAILABLE · Inference balance ${detail.activatedBalance} is below ${detail.autoRefuel.thresholdUsd}, and this client reserve is empty. No fallback funding is used.
                    </div>
                  )}

                {detail.autoRefuel.enabled &&
                  Number(detail.autoRefuel.weeklySpentUsdg) >= Number(detail.autoRefuel.weeklyCapUsdg) && (
                    <div style={{ marginBottom: 12, padding: "9px 11px", border: "1px solid rgba(240, 184, 90, 0.4)", backgroundColor: "rgba(240, 184, 90, 0.06)", borderRadius: 5, color: "var(--warning)", fontSize: "0.75rem", fontFamily: "var(--font-mono)" }}>
                      AUTO-REFUEL BLOCKED · Weekly policy cap reached. No Exchange call or fallback funding is used.
                    </div>
                  )}

                {detail.autoRefuel.activeRefuel && (
                  <div style={{ marginBottom: 12, padding: "9px 11px", border: "1px solid rgba(240, 184, 90, 0.35)", backgroundColor: "rgba(240, 184, 90, 0.06)", borderRadius: 5, fontSize: "0.75rem", color: "var(--warning)", fontFamily: "var(--font-mono)" }}>
                    Refuel {detail.autoRefuel.activeRefuel.status}. A confirmed transaction and Orbio balance indexing are separate states.
                    {detail.autoRefuel.activeRefuel.transactionHash && (
                      <a href={explorerTxUrl(detail.autoRefuel.activeRefuel.transactionHash)} target="_blank" rel="noreferrer" style={{ color: "var(--link)", marginLeft: 8 }}>
                        {truncateMiddle(detail.autoRefuel.activeRefuel.transactionHash, 10, 8)}
                      </a>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
                  <form onSubmit={(e) => void handleSaveRefuelPolicy(e)}>
                    <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", marginBottom: 8 }}>POLICY</div>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 8 }}>
                      Trigger below
                      <input value={refuelThreshold} onChange={(e) => setRefuelThreshold(e.target.value)} inputMode="decimal" aria-label="Auto-refuel trigger threshold" style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                    </label>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 8 }}>
                      Refill amount, USDG
                      <input value={refuelAmount} onChange={(e) => setRefuelAmount(e.target.value)} inputMode="decimal" aria-label="Auto-refuel amount" style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                    </label>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 8 }}>
                      Weekly maximum, USDG
                      <input value={refuelWeeklyCap} onChange={(e) => setRefuelWeeklyCap(e.target.value)} inputMode="decimal" aria-label="Auto-refuel weekly maximum" style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                    </label>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 8 }}>
                      Max slippage, bps
                      <input value={refuelSlippage} onChange={(e) => setRefuelSlippage(e.target.value)} inputMode="numeric" aria-label="Auto-refuel maximum slippage" style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                    </label>
                    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 10 }}>
                      Authorized keeper
                      <input value={refuelExecutor} onChange={(e) => setRefuelExecutor(e.target.value)} aria-label="Authorized refuel keeper address" style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: "0.7rem" }} />
                    </label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="submit" disabled={busy || !walletReady} className="btn-primary-action" style={{ backgroundColor: "var(--fuel)", color: "#ffffff", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: "0.75rem", fontWeight: 500, cursor: busy || !walletReady ? "not-allowed" : "pointer", opacity: busy || !walletReady ? 0.55 : 1 }}>
                        Save policy onchain
                      </button>
                      <button type="button" onClick={() => void handleDisableRefuel()} disabled={busy || !detail.autoRefuel.enabled || !walletReady} className="btn-quiet-action" style={{ padding: "8px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer", opacity: busy || !detail.autoRefuel.enabled || !walletReady ? 0.55 : 1 }}>
                        Disable auto-refuel
                      </button>
                    </div>
                  </form>

                  <div>
                    <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", marginBottom: 8 }}>USDG RESERVE</div>
                    <p style={{ margin: "0 0 10px", fontSize: "0.75rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
                      Deposit from this registered wallet. FlowFuel never signs a withdrawal.
                    </p>
                    <form onSubmit={(e) => void handleDepositReserve(e)} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <input value={refuelDepositAmount} onChange={(e) => setRefuelDepositAmount(e.target.value)} inputMode="decimal" placeholder="5.000000" aria-label="USDG reserve deposit amount" style={{ flex: "1 1 130px", minWidth: 130, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                      <button type="submit" disabled={busy || !walletReady} className="btn-primary-action" style={{ backgroundColor: "var(--fuel)", color: "#ffffff", border: "none", padding: "8px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer", opacity: busy || !walletReady ? 0.55 : 1 }}>Deposit USDG</button>
                    </form>
                    <form onSubmit={(e) => { e.preventDefault(); void handleWithdrawReserve(false); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <input value={refuelWithdrawAmount} onChange={(e) => setRefuelWithdrawAmount(e.target.value)} inputMode="decimal" placeholder="Amount to withdraw" aria-label="USDG reserve withdrawal amount" style={{ flex: "1 1 130px", minWidth: 130, padding: "7px 9px", border: "1px solid var(--border)", borderRadius: 5, backgroundColor: "var(--canvas)", color: "var(--ink)", fontFamily: "var(--font-mono)" }} />
                      <button type="submit" disabled={busy || !walletReady} className="btn-quiet-action" style={{ padding: "8px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer", opacity: busy || !walletReady ? 0.55 : 1 }}>Withdraw USDG</button>
                      <button type="button" onClick={() => void handleWithdrawReserve(true)} disabled={busy || !walletReady || detail.autoRefuel.reserveUsdg === "0.000000"} className="btn-quiet-action" style={{ padding: "8px 12px", borderRadius: 5, fontSize: "0.75rem", cursor: "pointer", opacity: busy || !walletReady || detail.autoRefuel.reserveUsdg === "0.000000" ? 0.55 : 1 }}>Withdraw all</button>
                    </form>
                    <div style={{ fontSize: "0.6875rem", color: "var(--ink-subtle)", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
                      Vault: {truncateMiddle(detail.autoRefuel.vaultAddress, 10, 8)} · chain 4663
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Usage table */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "var(--canvas)",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  padding: "12px 20px",
                  backgroundColor: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <h2 style={{ fontSize: "0.9375rem", fontWeight: 550, margin: 0, color: "var(--ink)" }}>
                  Recent Usage
                </h2>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: 640 }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "var(--surface)",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--ink-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <th style={{ padding: "10px 16px" }}>RUN</th>
                      <th style={{ padding: "10px 16px" }}>STATUS</th>
                      <th style={{ padding: "10px 16px" }}>COST</th>
                      <th style={{ padding: "10px 16px" }}>GENERATION</th>
                      <th style={{ padding: "10px 16px", textAlign: "right" }}>PROOF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentRuns.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: "14px 16px", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                          No runs yet. They appear here after the first workflow execution.
                        </td>
                      </tr>
                    )}
                    {detail.recentRuns.map((run) => (
                      <tr
                        key={run.runId}
                        className="agency-table-row"
                        style={{ fontSize: "0.8125rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--font-mono)" }}>
                            {new Date(run.startedAt).toLocaleString("en-GB", { timeZone: "UTC" })}
                          </div>
                          <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)", marginTop: 2 }}>
                            {truncateMiddle(run.runId, 8, 0)} · task {truncateMiddle(run.taskHash, 8, 6)}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontFamily: "var(--font-mono)",
                            color: run.status === "succeeded" ? "var(--success)" : run.status === "running" ? "var(--warning)" : "var(--danger)",
                          }}
                        >
                          {RUN_LABEL[run.status] ?? run.status}
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: run.costUsd ? "var(--danger)" : "var(--ink-muted)", fontWeight: 600 }}>
                          {run.costUsd ? `-$${run.costUsd}` : "$0.000000"}
                        </td>
                        <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", fontSize: "0.75rem" }}>
                          {run.generationId ? truncateMiddle(run.generationId, 16, 0) : "none"}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                          <Link
                            href={`/proof?run=${run.runId}`}
                            className="btn-quiet-action"
                            style={{
                              padding: "5px 10px",
                              borderRadius: 4,
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-mono)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            Receipt &rarr;
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Controls */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "16px 20px",
                backgroundColor: "var(--surface)",
              }}
            >
              <h3 style={{ margin: "0 0 4px", fontSize: "0.9375rem", fontWeight: 550, color: "var(--ink)" }}>
                Controls
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: "0.8125rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
                Pause your automation or revoke the agency&apos;s access at any time. Both require a signature from the client wallet.
              </p>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => void handlePauseToggle()}
                  disabled={busy || detail.status === "revoked"}
                  className="btn-quiet-action"
                  style={{
                    padding: "7px 14px",
                    borderRadius: 5,
                    fontWeight: 500,
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                    color: detail.status === "paused" ? "var(--success)" : undefined,
                    borderColor: detail.status === "paused" ? "var(--success)" : undefined,
                  }}
                >
                  {detail.status === "paused" ? "Resume Automation" : "Pause Automation"}
                </button>

                {confirmingRevoke ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
                      Confirm revoke? Deletes the stored credential and blocks all runs.
                    </span>
                    <button
                      onClick={() => void handleRevoke()}
                      disabled={busy}
                      style={{
                        backgroundColor: "var(--danger)",
                        color: "#ffffff",
                        border: "none",
                        padding: "6px 12px",
                        borderRadius: 5,
                        fontWeight: 600,
                        fontSize: "0.78125rem",
                        cursor: "pointer",
                      }}
                    >
                      Sign and Revoke
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRevoke(false)}
                      className="btn-quiet-action"
                      style={{
                        padding: "6px 10px",
                        borderRadius: 5,
                        fontSize: "0.78125rem",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingRevoke(true)}
                    disabled={!detail.credentialRegistered}
                    style={{
                      backgroundColor: "var(--danger)",
                      color: "#ffffff",
                      border: "none",
                      padding: "7px 14px",
                      borderRadius: 5,
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                      cursor: detail.credentialRegistered ? "pointer" : "not-allowed",
                      opacity: detail.credentialRegistered ? 1 : 0.5,
                    }}
                  >
                    Revoke Access
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ClientDashboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)" }} />}>
      <DashboardInner />
    </Suspense>
  );
}
