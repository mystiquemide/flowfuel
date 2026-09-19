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
  connectInjected,
  injectedChainId,
  injectedProvider,
  issueNonce,
  readApiError,
  requestRobinhoodChain,
  signNonceMessage,
  truncateMiddle,
  unitsToUsd,
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

  const loadDetail = useCallback(async (idOrSlug: string) => {
    try {
      const res = await fetch(`/api/clients/${idOrSlug}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as ClientDetail;
      setDetail(body);
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
