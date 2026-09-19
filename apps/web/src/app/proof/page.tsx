"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CREDIT_CONTRACT_ADDRESS } from "@flowfuel/core";
import { FlowFuelLogo } from "@/components/flowfuel-logo";
import { readApiError, truncateMiddle } from "@/lib/browser";

interface RunRow {
  runId: string;
  clientId: string;
  clientName: string | null;
  status: string;
  taskType: string;
  taskHash: string;
  model: string;
  workflowRunId: string | null;
  generationId: string | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  costUsd: string | null;
  errorCode: string | null;
  upstreamStatus: number | null;
  startedAt: string;
  completedAt: string | null;
}

interface PublicReceipt {
  runId: string;
  status: string;
  reconciled: boolean;
  clientWallet: string;
  workflowRunId: string | null;
  taskHash: string;
  model: string;
  generationId: string | null;
  balanceBefore: string | null;
  costUsd: string | null;
  balanceAfter: string | null;
  upstreamStatus: number | null;
  activationTxHash: string | null;
  activationExplorerUrl: string | null;
  startedAt: string;
  completedAt: string | null;
  source: "live";
}

interface PairData {
  workflowRunId: string;
  runs: RunRow[];
  receipts: Record<string, PublicReceipt>;
  clients: Record<string, { displayName: string; walletAddress: string }>;
}

const RUN_STATUS_LABEL: Record<string, string> = {
  succeeded: "succeeded",
  client_unfunded: "client_unfunded",
  quota_exceeded: "quota_exceeded",
  provider_failed: "provider_failed",
  reconciliation_failed: "reconciliation_failed",
  validation_failed: "validation_failed",
  running: "running",
};

function ProofInner() {
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");

  const [pair, setPair] = useState<PairData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloaded, setDownloaded] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetch("/api/proof/runs", { cache: "no-store" });
      if (!listRes.ok) throw new Error(await readApiError(listRes));
      const { runs } = (await listRes.json()) as { runs: RunRow[] };
      if (runs.length === 0) throw new Error("No runs recorded yet. Run the n8n workflow to produce the first receipt.");

      let workflowRunId: string | null = null;
      if (runParam) {
        const target = runs.find((r) => r.runId === runParam);
        if (!target) throw new Error("No run matches this link. Check the URL or pick a recent run.");
        workflowRunId = target.workflowRunId ?? `solo:${target.runId}`;
      } else {
        // Canonical proof: the newest workflow run containing both a
        // succeeded and a blocked sibling.
        const groups = new Map<string, RunRow[]>();
        for (const run of runs) {
          if (!run.workflowRunId) continue;
          const g = groups.get(run.workflowRunId) ?? [];
          g.push(run);
          groups.set(run.workflowRunId, g);
        }
        let best: string | null = null;
        for (const [id, members] of groups) {
          const hasSuccess = members.some((m) => m.status === "succeeded");
          const hasBlocked = members.some(
            (m) => m.status === "client_unfunded" || m.status === "quota_exceeded",
          );
          if (hasSuccess && hasBlocked) {
            best = id;
            break;
          }
        }
        if (!best) {
          const first = runs.find((r) => r.workflowRunId);
          if (!first?.workflowRunId) throw new Error("No shared workflow runs yet. Run the n8n workflow to produce one.");
          best = first.workflowRunId;
        }
        workflowRunId = best;
      }

      const siblings = workflowRunId.startsWith("solo:")
        ? runs.filter((r) => r.runId === workflowRunId!.slice(5))
        : runs.filter((r) => r.workflowRunId === workflowRunId);

      const receipts: Record<string, PublicReceipt> = {};
      await Promise.all(
        siblings.map(async (run) => {
          const res = await fetch(`/api/runs/${run.runId}/receipt`, { cache: "no-store" });
          if (res.ok) {
            receipts[run.runId] = (await res.json()) as PublicReceipt;
          }
        }),
      );

      const clients: PairData["clients"] = {};
      for (const run of siblings) {
        const receipt = receipts[run.runId];
        if (receipt) clients[run.clientId] = {
          displayName: run.clientName ?? "Client",
          walletAddress: receipt.clientWallet,
        };
      }

      setPair({ workflowRunId, runs: siblings, receipts, clients });
      setLoadedAt(new Date());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the proof data. Try again.");
      setPair(null);
    } finally {
      setLoading(false);
    }
  }, [runParam]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const handleDownloadJson = () => {
    if (!pair) return;
    const payload = {
      source: "live",
      fetchedAt: loadedAt?.toISOString(),
      invariant: "Every client runs against their own isolated Orbio balance.",
      chainId: 4663,
      workflowRunId: pair.workflowRunId,
      receipts: pair.runs.map((r) => pair.receipts[r.runId]).filter(Boolean),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowfuel-receipts-${pair.workflowRunId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  // Sort: succeeded first, then blocked/failed. Judges compare A vs B at a glance.
  const orderedRuns = pair
    ? [...pair.runs].sort((a, b) => {
        const rank = (s: string) => (s === "succeeded" ? 0 : s === "running" ? 2 : 1);
        return rank(a.status) - rank(b.status);
      })
    : [];

  const funded = orderedRuns.find((r) => r.status === "succeeded");
  const blocked = orderedRuns.find((r) => r.status !== "succeeded" && r.status !== "running");

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
            <Link href="/client/onboard" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Client Onboard
            </Link>
            <Link href="/docs/n8n-broker" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              n8n Docs
            </Link>
          </nav>
        </div>
      </header>

      <main className="workspace-page-fade" style={{ maxWidth: 1040, margin: "0 auto", padding: "36px 24px 60px" }}>
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
            LIVE VERIFICATION
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
            Client Isolation Proof
          </h1>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 8px" }}>
            Funded clients execute. Unfunded clients stop before inference. No shared agency balance is touched.
          </p>
          {pair && loadedAt && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-subtle)", margin: "0 0 16px" }}>
              workflow run {pair.workflowRunId} · live · rendered {loadedAt.toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a
              href="#receipts"
              className="btn-primary-action"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                padding: "6px 14px",
                borderRadius: 5,
                fontSize: "0.8125rem",
                fontWeight: 500,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <span>View Receipts</span>
            </a>

            <button
              type="button"
              onClick={handleDownloadJson}
              disabled={!pair}
              className="btn-quiet-action"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "transparent",
                color: "var(--ink-muted)",
                border: "1px solid var(--border)",
                padding: "6px 13px",
                borderRadius: 5,
                fontSize: "0.8125rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <span>{downloaded ? "JSON Downloaded" : "Download Raw Verification JSON"}</span>
            </button>
          </div>
        </div>

        {loading && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
            Loading live run data…
          </p>
        )}
        {loadError && (
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
            {loadError}
          </div>
        )}

        {pair && (
          <>
            {/* Proof summary strip */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                backgroundColor: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 7,
                marginBottom: 24,
                fontSize: "0.8125rem",
                fontFamily: "var(--font-mono)",
              }}
            >
              {funded && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--success)", fontWeight: 500 }}>
                  <span>✓</span>
                  <span>{pair.clients[funded.clientId]?.displayName ?? "Funded client"} executed</span>
                </div>
              )}
              {blocked && (
                <>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--danger)", fontWeight: 500 }}>
                    <span style={{ fontSize: "0.75rem" }}>✕</span>
                    <span>{pair.clients[blocked.clientId]?.displayName ?? "Unfunded client"} blocked</span>
                  </div>
                </>
              )}
              <span style={{ color: "var(--border)" }}>·</span>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink)", fontWeight: 500 }}>
                <span>task hash {truncateMiddle(orderedRuns[0]?.taskHash ?? "", 10, 6)}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(orderedRuns[0]?.taskHash ?? "")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: copiedHash === orderedRuns[0]?.taskHash ? "var(--success)" : "var(--ink-muted)",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    textDecoration: "underline",
                  }}
                >
                  {copiedHash === orderedRuns[0]?.taskHash ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Comparison table */}
            <div
              id="receipts"
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "var(--surface)",
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  padding: "14px 20px",
                  backgroundColor: "var(--surface)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                  Shared Workflow, Enforced Outcomes
                </h2>
                <div style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                  Same n8n execution · same task payload · different payer balances
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: "var(--canvas)",
                        borderBottom: "1px solid var(--border)",
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--ink-muted)",
                        letterSpacing: "0.03em",
                      }}
                    >
                      <th style={{ padding: "10px 16px", fontWeight: 600 }}>VERIFICATION PARAMETER</th>
                      {orderedRuns.map((run) => (
                        <th
                          key={run.runId}
                          style={{
                            padding: "10px 16px",
                            color: run.status === "succeeded" ? "var(--success)" : "var(--danger)",
                            fontWeight: 600,
                          }}
                        >
                          {pair.clients[run.clientId]?.displayName ?? truncateMiddle(run.clientId, 8, 0)} · {run.status === "succeeded" ? "Funded" : "Blocked"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Run ID
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px", color: "var(--ink)" }}>
                          <code>{truncateMiddle(run.runId, 8, 0)}</code>
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Wallet Address
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px", color: "var(--ink)", fontSize: "0.75rem" }}>
                          <code>{pair.receipts[run.runId]?.clientWallet ?? pair.clients[run.clientId]?.walletAddress}</code>
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Run Status
                      </td>
                      {orderedRuns.map((run) => (
                        <td
                          key={run.runId}
                          style={{
                            padding: "12px 16px",
                            color: run.status === "succeeded" ? "var(--success)" : "var(--danger)",
                            fontWeight: 600,
                          }}
                        >
                          {RUN_STATUS_LABEL[run.status] ?? run.status}
                          {run.errorCode && (
                            <div style={{ fontSize: "0.6875rem", color: "var(--ink-muted)", fontWeight: 400, marginTop: 2 }}>
                              {run.errorCode}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Gateway Status
                      </td>
                      {orderedRuns.map((run) => (
                        <td
                          key={run.runId}
                          style={{
                            padding: "12px 16px",
                            color: run.upstreamStatus !== null && run.upstreamStatus < 400 ? "var(--success)" : run.upstreamStatus !== null ? "var(--danger)" : "var(--ink-muted)",
                            fontWeight: 600,
                          }}
                        >
                          {run.upstreamStatus !== null ? `HTTP ${run.upstreamStatus}` : "none"}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Generation ID
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px", color: "var(--ink-muted)", fontSize: "0.75rem" }}>
                          {run.generationId ?? "none"}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Balance Before
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px", color: "var(--ink)" }}>
                          {run.balanceBefore !== null ? `$${run.balanceBefore}` : "n/a"}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Cost
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px", color: run.costUsd ? "var(--danger)" : "var(--ink-muted)" }}>
                          {run.costUsd ? `-$${run.costUsd}` : "$0.000000 (No Charge)"}
                        </td>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Balance After
                      </td>
                      {orderedRuns.map((run) => (
                        <td
                          key={run.runId}
                          style={{
                            padding: "12px 16px",
                            color: run.status === "succeeded" ? "var(--success)" : "var(--ink)",
                            fontWeight: run.status === "succeeded" ? 600 : 400,
                          }}
                        >
                          {run.balanceAfter !== null ? `$${run.balanceAfter}` : "n/a"}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                        Receipt
                      </td>
                      {orderedRuns.map((run) => (
                        <td key={run.runId} style={{ padding: "12px 16px" }}>
                          {pair.receipts[run.runId]?.reconciled ? (
                            <span style={{ color: "var(--success)", fontWeight: 600 }}>RECONCILED</span>
                          ) : (
                            <span style={{ color: "var(--ink-muted)" }}>{pair.receipts[run.runId] ? "recorded" : "unavailable"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Onchain Evidence */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "var(--surface)",
                padding: "20px 22px",
                marginBottom: 28,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                    Onchain Evidence
                  </h2>
                  <p style={{ margin: "3px 0 0", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    Transaction and contract artifacts verifiable on the public explorer
                  </p>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    color: "var(--ink-muted)",
                    backgroundColor: "var(--canvas)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}
                >
                  Robinhood Chain 4663
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "var(--canvas)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 260, flex: "1 1 auto" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--ink)" }}>
                        CREDIT Contract
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--ink-muted)",
                          backgroundColor: "var(--surface)",
                          padding: "1px 6px",
                          borderRadius: 3,
                          border: "1px solid var(--border)",
                        }}
                      >
                        {truncateMiddle(CREDIT_CONTRACT_ADDRESS, 10, 8)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: 4 }}>
                      ERC-20 CREDIT token · activate() burns CREDIT into activated inference balance
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <a
                      href={`https://robin.etherscan.io/address/${CREDIT_CONTRACT_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--ink)",
                        padding: "5px 10px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                    >
                      <span>View on Explorer</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(CREDIT_CONTRACT_ADDRESS)}
                      style={{
                        backgroundColor: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--ink-muted)",
                        padding: "5px 10px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      {copiedHash === CREDIT_CONTRACT_ADDRESS ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {orderedRuns.map((run) => {
                  const receipt = pair.receipts[run.runId];
                  if (!receipt?.activationTxHash) return null;
                  const name = pair.clients[run.clientId]?.displayName ?? "Client";
                  return (
                    <div
                      key={run.runId}
                      style={{
                        padding: "12px 14px",
                        backgroundColor: "var(--canvas)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div style={{ minWidth: 260, flex: "1 1 auto" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--ink)" }}>
                            {name} Activation
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-mono)",
                              color: "var(--ink-muted)",
                              backgroundColor: "var(--surface)",
                              padding: "1px 6px",
                              borderRadius: 3,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {truncateMiddle(receipt.activationTxHash, 10, 8)}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: 4 }}>
                          activate() transaction funding this client&apos;s inference balance
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {receipt.activationExplorerUrl && (
                          <a
                            href={receipt.activationExplorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--ink)",
                              padding: "5px 10px",
                              borderRadius: 4,
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            <span>View on Explorer</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(receipt.activationTxHash!)}
                          style={{
                            backgroundColor: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--ink-muted)",
                            padding: "5px 10px",
                            borderRadius: 4,
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                          }}
                        >
                          {copiedHash === receipt.activationTxHash ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Receipt links */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                backgroundColor: "var(--surface)",
                padding: "14px 20px",
                marginBottom: 28,
              }}
            >
              <h2 style={{ fontSize: "0.9375rem", fontWeight: 550, margin: "0 0 10px", color: "var(--ink)" }}>
                Public Receipt Endpoints
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                {orderedRuns.map((run) => (
                  <div key={run.runId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href={`/api/runs/${run.runId}/receipt`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--link)", textDecoration: "none" }}
                    >
                      /api/runs/{truncateMiddle(run.runId, 8, 0)}/receipt
                    </a>
                    <span style={{ color: "var(--ink-subtle)" }}>
                      · {pair.clients[run.clientId]?.displayName ?? "client"} · {run.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: "center", paddingTop: 8 }}>
              <p style={{ fontSize: "0.6875rem", color: "var(--ink-subtle)", fontFamily: "var(--font-mono)", margin: 0 }}>
                Live data · Robinhood Chain 4663 · Orbio Gateway · receipts pass the strict public allowlist
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ProofPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)" }} />}>
      <ProofInner />
    </Suspense>
  );
}
