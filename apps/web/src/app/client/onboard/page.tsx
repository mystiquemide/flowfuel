"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAddress } from "viem";
import { ROBINHOOD_CHAIN_ID, explorerTxUrl } from "@flowfuel/core";
import { FlowFuelLogo } from "@/components/flowfuel-logo";
import {
  activateCredit,
  approveUsdg,
  buyAndActivateCredit,
  authenticateClient,
  connectInjected,
  exchangeMaxFillsOnchain,
  injectedChainId,
  injectedProvider,
  quoteUsdgToCredit,
  readApiError,
  requestRobinhoodChain,
  truncateMiddle,
  unitsToUsd,
  usdToUnits,
  usdgAllowanceForExchange,
  type UsdgQuote,
} from "@/lib/browser";

interface ClientDetail {
  id: string;
  slug: string;
  displayName: string;
  walletAddress: string;
  status: string;
  credentialRegistered: boolean;
  activatedBalance: string | null;
  transferableCreditUnits: string | null;
  usdgBalanceUnits: string | null;
  latestActivation: { transactionHash: string; activationId: number | null } | null;
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

type Phase =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "tx_submitted"; txHash: string }
  | { kind: "recording"; txHash: string }
  | { kind: "indexing"; txHash: string; activationId: number | null }
  | { kind: "done"; txHash: string; activationId: number | null }
  | { kind: "error"; message: string; txHash?: string };

function OnboardInner() {
  const searchParams = useSearchParams();
  const clientParam = searchParams.get("client");

  const [clients, setClients] = useState<ClientListEntry[] | null>(null);
  const [bootstrap, setBootstrap] = useState<ClientBootstrap | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [allowance, setAllowance] = useState<string>("");
  const [usdgAmount, setUsdgAmount] = useState<string>("");
  const [usdgQuote, setUsdgQuote] = useState<UsdgQuote | null>(null);
  const [usdgQuoteError, setUsdgQuoteError] = useState<string | null>(null);
  const [maxFills, setMaxFills] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const loadDetail = useCallback(async (idOrSlug: string) => {
    try {
      const res = await fetch(`/api/clients/${idOrSlug}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as ClientDetail;
      setDetail(body);
      setLoadError(null);
      return body;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load client");
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
      setLoadError(err instanceof Error ? err.message : "Failed to load client link");
      return null;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (clientParam) {
        void loadBootstrap(clientParam);
      } else {
        setClients([]);
        setLoadError("Open the client-specific funding link sent by your agency.");
      }
    });
  }, [clientParam, loadBootstrap]);

  async function pickClient(id: string) {
    setDetail(null);
    setPhase({ kind: "idle" });
    await loadDetail(id);
  }

  async function handleConnect() {
    setPhase({ kind: "working", label: "Connecting wallet" });
    try {
      const addr = await connectInjected();
      setAccount(addr);
      const chain = await injectedChainId().catch(() => null);
      setChainId(chain);
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

  async function handleSwitchChain() {
    try {
      await requestRobinhoodChain();
      setChainId(await injectedChainId());
    } catch (err) {
      setPhase({ kind: "error", message: err instanceof Error ? err.message : "Couldn't switch networks. Switch to Robinhood Chain in your wallet, then try again." });
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

  const transferableUnits = detail?.transferableCreditUnits
    ? BigInt(detail.transferableCreditUnits)
    : null;
  const allowanceUnits = usdToUnits(allowance || "0");
  const allowanceValid =
    allowanceUnits > BigInt(0) &&
    transferableUnits !== null &&
    allowanceUnits <= transferableUnits;
  const expectedWallet = detail?.walletAddress ?? bootstrap?.walletAddress ?? null;
  const walletMismatch =
    account !== null &&
    expectedWallet !== null &&
    getAddress(account) !== getAddress(expectedWallet);
  const wrongChain = account !== null && chainId !== null && chainId !== ROBINHOOD_CHAIN_ID;

  useEffect(() => {
    let cancelled = false;
    exchangeMaxFillsOnchain()
      .then((value) => {
        if (!cancelled) setMaxFills(value);
      })
      .catch(() => {
        if (!cancelled) setMaxFills(BigInt(32));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usdgBalanceUnits = detail?.usdgBalanceUnits
    ? BigInt(detail.usdgBalanceUnits)
    : null;
  const usdgInputUnits = usdToUnits(usdgAmount || "0");
  const usdgInputValid =
    usdgInputUnits > BigInt(0) &&
    usdgBalanceUnits !== null &&
    usdgInputUnits <= usdgBalanceUnits;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!usdgInputValid || maxFills === null) {
        setUsdgQuote(null);
        setUsdgQuoteError(null);
        return;
      }
      quoteUsdgToCredit(usdgInputUnits, maxFills)
        .then((quote) => {
          if (cancelled) return;
          setUsdgQuote(quote);
          setUsdgQuoteError(
            quote.creditOut > BigInt(0)
              ? null
              : "The order book can't fill this amount right now.",
          );
        })
        .catch(() => {
          if (cancelled) return;
          setUsdgQuote(null);
          setUsdgQuoteError("Couldn't read a quote from the exchange. Try again.");
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usdgAmount, usdgInputValid, usdgInputUnits, maxFills]);

  async function pollForIndex(txHash: string, activationId: number | null) {
    // Without a registered credential there is no gateway key to read a
    // balance with. The activation is already verified on chain and recorded,
    // so finish immediately instead of polling for a balance we cannot see.
    if (!detail?.credentialRegistered) {
      setPhase({ kind: "done", txHash, activationId });
      return;
    }
    setPhase({ kind: "indexing", txHash, activationId });
    const before = detail?.activatedBalance;
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, 5000));
      const fresh = await loadDetail(clientParam ?? detail!.id);
      if (fresh && fresh.activatedBalance !== before && fresh.activatedBalance !== null) {
        setPhase({ kind: "done", txHash, activationId });
        return;
      }
    }
    // Indexing lag is normal. The activation is on chain and recorded; the
    // gateway balance catches up asynchronously.
    setPhase({ kind: "done", txHash, activationId });
  }

  async function recordActivation(txHash: string) {
    if (!detail) return;
    setPhase({ kind: "recording", txHash });
    const res = await fetch(`/api/clients/${detail.id}/activation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transactionHash: txHash }),
    });
    if (!res.ok) throw new Error(await readApiError(res));
    const body = (await res.json()) as { activationId: number | null };
    await pollForIndex(txHash, body.activationId);
  }

  async function handleActivate() {
    if (!account || !detail || !allowanceValid) return;
    let txHash: string | undefined;
    try {
      setPhase({ kind: "working", label: `Confirm activate(${allowance} CREDIT) in your wallet` });
      txHash = await activateCredit(account, allowanceUnits);
      await recordActivation(txHash);
    } catch (err) {
      setPhase({ kind: "error", txHash, message: err instanceof Error ? err.message : "The activation didn't finish. Try again." });
    }
  }

  async function handleBuyAndActivate() {
    if (!account || !detail || !usdgInputValid || maxFills === null) return;
    let txHash: string | undefined;
    try {
      setPhase({ kind: "working", label: "Quoting the order book" });
      // Quotes do not reserve liquidity, so re-quote immediately before the
      // transaction and set the minimum output 2% under the fresh quote.
      const fresh = await quoteUsdgToCredit(usdgInputUnits, maxFills);
      if (fresh.creditOut <= BigInt(0)) {
        throw new Error("The order book can't fill this amount right now. Try a smaller USDG amount.");
      }
      const minCreditOut = (fresh.creditOut * BigInt(98)) / BigInt(100) || fresh.creditOut;

      const allowanceNow = await usdgAllowanceForExchange(account);
      if (allowanceNow < usdgInputUnits) {
        setPhase({ kind: "working", label: `Confirm USDG approval (${usdgAmount} USDG) in your wallet` });
        await approveUsdg(account, usdgInputUnits);
      }
      setPhase({ kind: "working", label: "Confirm buyAndActivate in your wallet" });
      txHash = await buyAndActivateCredit(account, usdgInputUnits, minCreditOut, maxFills);
      await recordActivation(txHash);
    } catch (err) {
      setPhase({ kind: "error", txHash, message: err instanceof Error ? err.message : "The USDG funding didn't finish. Try again." });
    }
  }

  const busy = phase.kind === "working" || phase.kind === "tx_submitted" || phase.kind === "recording" || phase.kind === "indexing";

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
              Agency Portal
            </Link>
            <Link href="/proof" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Live Proof
            </Link>
            <Link href="/client/dashboard" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Client Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="workspace-page-fade" style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 60px" }}>
        <div style={{ marginBottom: 20 }}>
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
            CLIENT FUNDING SETUP
          </span>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 550,
              letterSpacing: "-0.025em",
              margin: "0 0 6px",
              color: "var(--ink)",
              lineHeight: 1.25,
            }}
          >
            Fund Your Orbio Inference Balance
          </h1>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: 0, maxWidth: 680 }}>
            Activate CREDIT into your wallet&apos;s Orbio balance. FlowFuel routes this client&apos;s agent runs to that balance, but does not impose a separate spending cap.
          </p>
        </div>

        {/* Client picker when no ?client= param */}
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
              Open your client funding link
            </h2>
            {loadError && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--danger)" }}>{loadError}</p>
            )}
            {clients === null && !loadError && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>Loading clients…</p>
            )}
            {clients !== null && clients.length === 0 && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                No clients registered. Create one in the agency workspace first.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clients?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void pickClient(c.id)}
                  className="btn-quiet-action"
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>{c.displayName}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>{c.status}</span>
                </button>
              ))}
            </div>
          </div>
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
              CLIENT LINK
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
            <div
              className="trust-strip-grid"
              style={{
                padding: "11px 20px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--success)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>You keep custody</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--success)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>Agency can only use the amount you approve</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--success)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>Unactivated CREDIT stays in your wallet</span>
              </div>
            </div>

            {/* Step 1: Wallet Connection */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                backgroundColor: "var(--canvas)",
                padding: "14px 18px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.6875rem",
                      letterSpacing: "0.06em",
                      color: "var(--ink-subtle)",
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    STEP 01 · {detail.displayName}
                  </div>
                  <h2 style={{ margin: "0 0 3px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
                    Connect Wallet
                  </h2>
                  <div style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
                    Expected: {truncateMiddle(detail.walletAddress, 8, 6)}
                  </div>
                </div>

                {account ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.8125rem",
                        backgroundColor: walletMismatch ? "rgba(220, 38, 38, 0.08)" : "rgba(22, 163, 74, 0.08)",
                        border: `1px solid ${walletMismatch ? "rgba(220, 38, 38, 0.3)" : "rgba(22, 163, 74, 0.25)"}`,
                        color: walletMismatch ? "var(--danger)" : "var(--success)",
                        padding: "5px 11px",
                        borderRadius: 6,
                        fontWeight: 500,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          backgroundColor: walletMismatch ? "var(--danger)" : "var(--success)",
                          display: "inline-block",
                        }}
                      />
                      {truncateMiddle(account, 6, 4)}
                    </div>
                    <button
                      onClick={() => void handleDisconnect()}
                      className="btn-quiet-action"
                      style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 5, cursor: "pointer", color: "var(--ink-muted)" }}
                    >
                      Disconnect
                    </button>
                    {walletMismatch && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--danger)" }}>
                        Wrong wallet · switch to {truncateMiddle(detail.walletAddress, 6, 4)}
                      </span>
                    )}
                    {wrongChain && (
                      <button
                        onClick={() => void handleSwitchChain()}
                        className="btn-quiet-action"
                        style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 5, cursor: "pointer", color: "var(--warning)" }}
                      >
                        Switch to Robinhood Chain 4663
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => void handleConnect()}
                    className="btn-primary-action"
                    style={{
                      backgroundColor: "var(--fuel)",
                      color: "#ffffff",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: 6,
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Connect Wallet
                  </button>
                )}
              </div>
            </div>

            {/* Step 2: Select Spending Limit */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                backgroundColor: "var(--canvas)",
                padding: "14px 18px",
                marginBottom: 14,
                opacity: account && !walletMismatch && !wrongChain ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  color: "var(--ink-subtle)",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                STEP 02
              </div>
              <h2 style={{ margin: "0 0 3px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
                Choose an Activation Amount
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                Choose how much CREDIT to convert into spendable Orbio inference balance. Activation is wallet-wide, not a FlowFuel-only ceiling.
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="text"
                  value={allowance}
                  onChange={(e) => setAllowance(e.target.value)}
                  placeholder="0.010000"
                  style={{
                    padding: "7px 12px",
                    borderRadius: 6,
                    border: `1px solid ${allowance && !allowanceValid ? "var(--danger)" : "var(--border)"}`,
                    backgroundColor: "var(--surface)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.0625rem",
                    fontWeight: 600,
                    width: 160,
                  }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--ink)", fontWeight: 500 }}>
                  CREDIT{allowance && allowanceValid ? ` ($${allowance} USD)` : ""}
                </span>
              </div>

              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--ink-muted)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <span>
                  Transferable balance:{" "}
                  {transferableUnits !== null ? `${unitsToUsd(transferableUnits)} CREDIT` : "unavailable"}
                </span>
                {detail.activatedBalance !== null && (
                  <>
                    <span>·</span>
                    <span>Already activated: ${detail.activatedBalance}</span>
                  </>
                )}
              </div>
              {allowance && !allowanceValid && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--danger)", margin: "8px 0 0" }}>
                  {allowanceUnits <= BigInt(0)
                    ? "Enter an amount above 0 to activate."
                    : "That amount is more than the transferable CREDIT in this wallet. Enter a smaller amount, or leave the rest unactivated."}
                </p>
              )}
              {transferableUnits === BigInt(0) && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--warning)", margin: "8px 0 0" }}>
                  This wallet holds no transferable CREDIT. Acquire CREDIT before activating.
                </p>
              )}
            </div>

            {/* Step 3: Activate on chain */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                backgroundColor: "var(--canvas)",
                padding: "14px 18px",
                marginBottom: 20,
                opacity: account && !walletMismatch && !wrongChain ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  color: "var(--ink-subtle)",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                STEP 03
              </div>
              <h2 style={{ margin: "0 0 3px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
                Activate on Robinhood Chain
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Your wallet sends one activate() transaction. The amount leaves your transferable balance and becomes spendable inference credit.
              </p>

              {phase.kind === "done" ? (
                <div
                  style={{
                    padding: 16,
                    backgroundColor: "rgba(22, 163, 74, 0.08)",
                    border: "1px solid rgba(22, 163, 74, 0.3)",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ color: "var(--success)", fontWeight: 600, fontSize: "0.875rem", marginBottom: 6 }}>
                    ORBIO BALANCE ACTIVATED ON CHAIN
                  </div>
                  <a
                    href={explorerTxUrl(phase.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink)", marginBottom: 4, wordBreak: "break-all", display: "block", textDecoration: "underline" }}
                  >
                    {phase.txHash}
                  </a>
                  {phase.activationId !== null && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 12 }}>
                      Activation ID #{phase.activationId}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <Link
                      href={`/connect/${detail.id}`}
                      className="btn-primary-action"
                      style={{
                        backgroundColor: "var(--fuel)",
                        color: "#ffffff",
                        padding: "8px 16px",
                        borderRadius: 6,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        display: "inline-block",
                      }}
                    >
                      Authorize activated balance &rarr;
                    </Link>
                    <Link
                      href={`/client/dashboard?client=${detail.slug}`}
                      className="btn-quiet-action"
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        fontSize: "0.875rem",
                        display: "inline-block",
                      }}
                    >
                      Client dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {phase.kind === "working" && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "0 0 10px" }}>
                      {phase.label}…
                    </p>
                  )}
                  {phase.kind === "indexing" && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "0 0 10px" }}>
                      Confirmed on chain · updating your activated balance…
                    </p>
                  )}
                  {phase.kind === "recording" && (
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)", margin: "0 0 10px" }}>
                      Verifying transaction on Robinhood Chain…
                    </p>
                  )}
                  {(phase.kind === "indexing" || phase.kind === "recording") && (
                    <a
                      href={explorerTxUrl(phase.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)", display: "block", marginBottom: 10, textDecoration: "underline" }}
                    >
                      {truncateMiddle(phase.txHash, 14, 10)}
                    </a>
                  )}
                  <button
                    onClick={() => void handleActivate()}
                    disabled={!allowanceValid || busy || walletMismatch || wrongChain || !account}
                    className="btn-primary-action"
                    style={{
                      backgroundColor: "var(--fuel)",
                      color: "#ffffff",
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: 6,
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor: !allowanceValid || busy || !account ? "not-allowed" : "pointer",
                      opacity: !allowanceValid || busy || !account ? 0.6 : 1,
                    }}
                  >
                    {phase.kind === "indexing"
                      ? "Confirming…"
                      : phase.kind === "recording"
                        ? "Verifying…"
                        : busy
                          ? "Activating…"
                          : allowance
                            ? `Activate ${allowance} CREDIT`
                            : "Activate CREDIT"}
                  </button>
                </>
              )}

              {phase.kind === "error" && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--danger)", margin: "0 0 6px" }}>
                    {phase.message}
                  </p>
                  {phase.txHash && (
                    <>
                      <a
                        href={explorerTxUrl(phase.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)", textDecoration: "underline", display: "block", marginBottom: 8 }}
                      >
                        On-chain transaction: {truncateMiddle(phase.txHash, 14, 10)}
                      </a>
                      <button
                        onClick={() => phase.txHash && void recordActivation(phase.txHash).catch((err) => setPhase({ kind: "error", txHash: phase.txHash, message: err instanceof Error ? err.message : "Recording failed again." }))}
                        className="btn-quiet-action"
                        style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 5, cursor: "pointer" }}
                      >
                        Retry recording
                      </button>
                    </>
                  )}
                </div>
              )}

              {detail.latestActivation && phase.kind !== "done" && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-subtle)", marginTop: 12 }}>
                  Latest activation on record:{" "}
                  <a
                    href={explorerTxUrl(detail.latestActivation.transactionHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--ink-muted)", textDecoration: "underline" }}
                  >
                    {truncateMiddle(detail.latestActivation.transactionHash, 10, 8)}
                  </a>
                  {detail.latestActivation.activationId !== null && ` · ID #${detail.latestActivation.activationId}`}
                </div>
              )}
            </div>

            {/* Alternative: fund with USDG via the exchange order book */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                backgroundColor: "var(--canvas)",
                padding: "14px 18px",
                marginBottom: 20,
                opacity: account && !walletMismatch && !wrongChain ? 1 : 0.55,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  color: "var(--ink-subtle)",
                  fontWeight: 600,
                  marginBottom: 2,
                }}
              >
                ALTERNATIVE · NO CREDIT NEEDED
              </div>
              <h2 style={{ margin: "0 0 3px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
                Fund with USDG
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Buy CREDIT on the Orbio exchange and activate it in one transaction. Your wallet approves USDG, then sends buyAndActivate().
              </p>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <input
                  type="text"
                  value={usdgAmount}
                  onChange={(e) => setUsdgAmount(e.target.value)}
                  placeholder="1.000000"
                  style={{
                    padding: "7px 12px",
                    borderRadius: 6,
                    border: `1px solid ${usdgAmount && !usdgInputValid ? "var(--danger)" : "var(--border)"}`,
                    backgroundColor: "var(--surface)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.0625rem",
                    fontWeight: 600,
                    width: 160,
                  }}
                />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--ink)", fontWeight: 500 }}>
                  USDG
                </span>
                {usdgQuote !== null && usdgQuote.creditOut > BigInt(0) && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--success)" }}>
                    ≈ {unitsToUsd(usdgQuote.creditOut)} CREDIT activated
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--ink-muted)",
                  fontFamily: "var(--font-mono)",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <span>
                  USDG balance:{" "}
                  {usdgBalanceUnits !== null ? unitsToUsd(usdgBalanceUnits) : "unavailable"}
                </span>
              </div>
              {usdgAmount && !usdgInputValid && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--danger)", margin: "8px 0 0" }}>
                  {usdgInputUnits <= BigInt(0)
                    ? "Enter an amount above 0 to fund."
                    : "That amount is more than the USDG in this wallet. Enter a smaller amount."}
                </p>
              )}
              {usdgQuoteError && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--warning)", margin: "8px 0 0" }}>
                  {usdgQuoteError}
                </p>
              )}

              <button
                onClick={() => void handleBuyAndActivate()}
                disabled={!usdgInputValid || usdgQuote === null || usdgQuote.creditOut <= BigInt(0) || busy || walletMismatch || wrongChain || !account}
                className="btn-primary-action"
                style={{
                  backgroundColor: "var(--fuel)",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 6,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  marginTop: 12,
                  cursor: !usdgInputValid || busy || !account ? "not-allowed" : "pointer",
                  opacity: !usdgInputValid || busy || !account ? 0.6 : 1,
                }}
              >
                {phase.kind === "indexing"
                  ? "Confirming…"
                  : phase.kind === "recording"
                    ? "Verifying…"
                    : busy
                      ? "Funding…"
                      : usdgAmount
                        ? `Buy and activate ${usdgAmount} USDG`
                        : "Buy and activate with USDG"}
              </button>
            </div>
          </>
        )}

        {clientParam && !detail && !loadError && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>Loading client…</p>
        )}
        {clientParam && loadError && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--danger)" }}>{loadError}</p>
        )}
      </main>
    </div>
  );
}

export default function ClientOnboardPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)" }} />}>
      <OnboardInner />
    </Suspense>
  );
}
