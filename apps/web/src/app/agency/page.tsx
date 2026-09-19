"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";
import { readApiError, truncateMiddle } from "@/lib/browser";
import { createClient, runClientTest, type TestRunResult } from "./actions";

interface ApiClient {
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
  totalSpentUsd: string;
  lastRun: { runId: string; status: string; startedAt: string } | null;
  latestActivation: { transactionHash: string; amountUsd: string; activationId: number | null } | null;
}

interface ApiRun {
  runId: string;
  clientId: string;
  clientName: string | null;
  status: string;
  costUsd: string | null;
  generationId: string | null;
  upstreamStatus: number | null;
  startedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "PENDING",
  ready: "READY",
  unfunded: "UNFUNDED",
  paused: "PAUSED",
  revoked: "REVOKED",
};

const STATUS_COLOR: Record<string, string> = {
  ready: "var(--success)",
  unfunded: "var(--danger)",
  paused: "var(--warning)",
  revoked: "var(--danger)",
  pending: "var(--ink-muted)",
};

const RUN_LABEL: Record<string, string> = {
  succeeded: "inference completed",
  client_unfunded: "run blocked · unfunded",
  quota_exceeded: "run stopped · quota exceeded",
  provider_failed: "run failed · provider",
  reconciliation_failed: "run flagged · reconciliation",
  validation_failed: "run rejected · validation",
  running: "run in progress",
};

function statusDot(status: string): string {
  if (status === "succeeded") return "var(--success)";
  if (status === "running") return "var(--warning)";
  return "var(--danger)";
}

export default function AgencyPage() {
  const [clients, setClients] = useState<ApiClient[] | null>(null);
  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<Record<string, TestRunResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState<string>("");
  const [newClientAddress, setNewClientAddress] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState<boolean>(false);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [showN8nConfig, setShowN8nConfig] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const [clientsRes, runsRes] = await Promise.all([
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/runs?limit=10", { cache: "no-store" }),
      ]);
      if (!clientsRes.ok) throw new Error(await readApiError(clientsRes));
      if (!runsRes.ok) throw new Error(await readApiError(runsRes));
      const clientsBody = (await clientsRes.json()) as { clients: ApiClient[] };
      const runsBody = (await runsRes.json()) as { runs: ApiRun[] };
      setClients(clientsBody.clients);
      setRuns(runsBody.runs);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the workspace. Try Refresh.");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const handleCopyNode = (clientId: string) => {
    const snippet = JSON.stringify(
      {
        parameters: {
          method: "POST",
          url: "https://<your-flowfuel-host>/api/runs",
          authentication: "genericCredentialType",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Authorization", value: "=Bearer {{ $credentials.FLOWFUEL_WORKFLOW_TOKEN }}" },
              { name: "Content-Type", value: "application/json" },
            ],
          },
          sendBody: true,
          bodyParameters: {
            parameters: [
              { name: "clientId", value: clientId },
              { name: "workflowRunId", value: "=n8n-{{ $execution.id }}" },
              { name: "task.type", value: "lead_summary" },
              { name: "task.input", value: "={{ $json.taskInput }}" },
              { name: "model", value: "google/gemini-2.5-flash" },
              { name: "maxOutputTokens", value: 1024 },
            ],
          },
        },
      },
      null,
      2
    );
    navigator.clipboard.writeText(snippet);
    setCopiedId(clientId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyFullConfig = () => {
    const snippet = `POST https://<your-flowfuel-host>/api/runs
Headers:
  Authorization: Bearer <FLOWFUEL_WORKFLOW_TOKEN>
  Content-Type: application/json

Payload:
{
  "clientId": "<client uuid>",
  "workflowRunId": "n8n-{{ $execution.id }}",
  "task": { "type": "lead_summary", "input": "{{ $json.taskInput }}" },
  "model": "google/gemini-2.5-flash",
  "maxOutputTokens": 1024
}

Replays with the same workflowRunId return the original run. No second charge.`;
    navigator.clipboard.writeText(snippet);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const handleTestRun = async (clientId: string) => {
    setTestingId(clientId);
    const result = await runClientTest(clientId);
    setTestResults((prev) => ({ ...prev, [clientId]: result }));
    setTestingId(null);
    void refresh();
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientAddress) return;
    setAdding(true);
    setAddError(null);
    const result = await createClient({
      displayName: newClientName,
      walletAddress: newClientAddress,
    });
    setAdding(false);
    if (!result.ok) {
      setAddError(result.error ?? "Couldn't create the client. Check the name and address, then try again.");
      return;
    }
    setNewClientName("");
    setNewClientAddress("");
    setShowAddForm(false);
    void refresh();
  };

  const readyCount = clients?.filter((c) => c.status === "ready").length ?? 0;
  const unfundedCount = clients?.filter((c) => c.status === "unfunded").length ?? 0;
  const pausedCount = clients?.filter((c) => c.status === "paused").length ?? 0;

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
            padding: "16px 24px",
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
            <Link href="/client/onboard" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Client Onboarding
            </Link>
            <Link href="/proof" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Live Proof
            </Link>
            <Link href="/docs/n8n-broker" className="nav-link-subtle" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              n8n Docs
            </Link>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
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
              {showAddForm ? "Close Form" : "+ Register New Client"}
            </button>
          </nav>
        </div>
      </header>

      <main className="workspace-page-fade" style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 24px 60px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  color: "var(--fuel)",
                  fontWeight: 600,
                  display: "inline-block",
                  marginBottom: 6,
                }}
              >
                AGENCY WORKSPACE
              </span>
              <h1
                style={{
                  fontSize: "1.625rem",
                  fontWeight: 550,
                  letterSpacing: "-0.025em",
                  margin: "0 0 6px",
                  color: "var(--ink)",
                  lineHeight: 1.2,
                }}
              >
                Manage client funding and n8n routing
              </h1>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: "0 0 12px", maxWidth: 720 }}>
                Track client balances, control inference spend, and route every n8n run through the correct client account.
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--ink-subtle)",
                }}
              >
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Network:</span>{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Robinhood Chain 4663</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Balances:</span>{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>
                    live Orbio reads{clients?.[0] ? ` · refreshed ${new Date(clients[0].balanceReadAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC` : ""}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

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

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div style={{ padding: "10px 14px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", marginBottom: 3 }}>CLIENTS</div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--ink)" }}>
              {clients === null ? "…" : `${clients.length} Clients`}
            </div>
          </div>
          <div style={{ padding: "10px 14px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--success)", marginBottom: 3 }}>READY</div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--success)" }}>
              {clients === null ? "…" : `${readyCount} Ready`}
            </div>
          </div>
          <div style={{ padding: "10px 14px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--danger)", marginBottom: 3 }}>UNFUNDED</div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--danger)" }}>
              {clients === null ? "…" : `${unfundedCount} Unfunded`}
            </div>
          </div>
          <div style={{ padding: "10px 14px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--warning)", marginBottom: 3 }}>PAUSED</div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--warning)" }}>
              {clients === null ? "…" : `${pausedCount} Paused`}
            </div>
          </div>
        </div>

        {/* Add Client Inline Form */}
        {showAddForm && (
          <div
            style={{
              padding: 20,
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 24,
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: "1rem", fontWeight: 550 }}>Register Client Identity</h3>
            <form onSubmit={(e) => void handleAddClient(e)} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <input
                type="text"
                placeholder="Client Business Name (e.g. Zenith Analytics)"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                style={{
                  flex: "1 1 240px",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--canvas)",
                  color: "var(--ink)",
                  fontSize: "0.875rem",
                }}
                required
              />
              <input
                type="text"
                placeholder="Wallet Address (0x...)"
                value={newClientAddress}
                onChange={(e) => setNewClientAddress(e.target.value)}
                style={{
                  flex: "2 1 320px",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  backgroundColor: "var(--canvas)",
                  color: "var(--ink)",
                  fontSize: "0.875rem",
                  fontFamily: "var(--font-mono)",
                }}
                required
              />
              <button
                type="submit"
                disabled={adding}
                className="btn-primary-action"
                style={{
                  backgroundColor: "var(--fuel)",
                  color: "#ffffff",
                  border: "none",
                  padding: "9px 18px",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                {adding ? "Saving…" : "Save Client"}
              </button>
            </form>
            {addError && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--danger)", margin: "10px 0 0" }}>
                {addError}
              </p>
            )}
            <p style={{ fontSize: "0.75rem", color: "var(--ink-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
              The client starts pending. Send them the connect link so they can activate CREDIT and register their credential.
            </p>
          </div>
        )}

        {/* Client Roster Table */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "var(--canvas)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              backgroundColor: "var(--surface)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 550, margin: 0, color: "var(--ink)" }}>
              Clients
            </h2>
            <button
              onClick={() => void refresh()}
              className="btn-quiet-action"
              style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: 5, cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", textAlign: "left" }}>
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
                  <th style={{ padding: "10px 12px" }}>CLIENT NAME</th>
                  <th style={{ padding: "10px 12px" }}>WALLET IDENTITY</th>
                  <th style={{ padding: "10px 12px" }}>ACTIVATED</th>
                  <th style={{ padding: "10px 12px" }}>SPENT</th>
                  <th style={{ padding: "10px 12px" }}>STATUS</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {clients === null && (
                  <tr>
                    <td colSpan={6} style={{ padding: "18px 12px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                      Loading clients…
                    </td>
                  </tr>
                )}
                {clients !== null && clients.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "18px 12px", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                      No clients connected. Create a client record, then send the authorization link.
                    </td>
                  </tr>
                )}
                {clients?.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr
                      className="agency-table-row"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <td style={{ padding: "12px 12px" }}>
                        <strong style={{ color: "var(--ink)", fontWeight: 550 }}>{c.displayName}</strong>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--ink-subtle)", marginTop: 2 }}>
                          {c.slug}{c.credentialRegistered && c.epoch !== null ? ` · epoch ${c.epoch}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "12px 12px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                        <code style={{ color: "var(--ink-muted)" }}>{truncateMiddle(c.walletAddress, 8, 6)}</code>
                      </td>
                      <td
                        style={{
                          padding: "12px 12px",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: c.activatedBalance !== null ? "var(--success)" : "var(--ink-muted)",
                        }}
                      >
                        {c.activatedBalance !== null ? `$${c.activatedBalance}` : c.credentialRegistered ? "unreadable" : "$0.000000"}
                      </td>
                      <td style={{ padding: "12px 12px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                        ${c.activatedUsed ?? c.totalSpentUsd}
                      </td>
                      <td style={{ padding: "12px 12px" }}>
                        <span
                          style={{
                            fontSize: "0.6875rem",
                            fontFamily: "var(--font-mono)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontWeight: 600,
                            backgroundColor: "var(--surface)",
                            color: STATUS_COLOR[c.status] ?? "var(--ink-muted)",
                          }}
                        >
                          {STATUS_LABEL[c.status] ?? c.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 12px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            onClick={() => void handleTestRun(c.id)}
                            disabled={testingId === c.id}
                            className="btn-quiet-action"
                            style={{
                              padding: "5px 9px",
                              borderRadius: 4,
                              fontSize: "0.75rem",
                              fontFamily: "var(--font-mono)",
                              cursor: "pointer",
                            }}
                          >
                            {testingId === c.id ? "Running…" : "Test Run"}
                          </button>
                          <button
                            onClick={() => handleCopyNode(c.id)}
                            className="btn-quiet-action"
                            style={{
                              padding: "5px 9px",
                              borderRadius: 4,
                              fontSize: "0.75rem",
                              cursor: "pointer",
                              color: copiedId === c.id ? "var(--success)" : undefined,
                              borderColor: copiedId === c.id ? "var(--success)" : undefined,
                            }}
                          >
                            {copiedId === c.id ? "Copied!" : "Copy Routing"}
                          </button>
                          <Link
                            href={`/connect/${c.id}`}
                            className="btn-quiet-action"
                            style={{ padding: "5px 9px", borderRadius: 4, fontSize: "0.75rem", display: "inline-block" }}
                          >
                            Open Connect Page
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {testResults[c.id] && (
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td colSpan={6} style={{ padding: "10px 12px 12px" }}>
                          <div
                            style={{
                              padding: "10px 14px",
                              backgroundColor: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.75rem",
                              lineHeight: 1.6,
                            }}
                          >
                            <span style={{ color: testResults[c.id]!.ok ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                              {testResults[c.id]!.ok ? "SUCCEEDED" : (testResults[c.id]!.status ?? "error").toUpperCase()}
                            </span>
                            <span style={{ color: "var(--ink-muted)" }}>
                              {" "}· run {truncateMiddle(testResults[c.id]!.runId ?? "", 8, 0)}
                              {testResults[c.id]!.upstreamStatus != null && ` · upstream ${testResults[c.id]!.upstreamStatus}`}
                              {testResults[c.id]!.errorCode && ` · ${testResults[c.id]!.errorCode}`}
                              {testResults[c.id]!.generationId && ` · ${testResults[c.id]!.generationId}`}
                              {testResults[c.id]!.costUsd && ` · cost $${testResults[c.id]!.costUsd}`}
                              {testResults[c.id]!.balanceAfter && ` · balance $${testResults[c.id]!.balanceAfter}`}
                            </span>
                            {testResults[c.id]!.action && (
                              <div style={{ color: "var(--ink-muted)", marginTop: 2 }}>{testResults[c.id]!.action}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity Section */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "var(--surface)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 550, margin: 0, color: "var(--ink)" }}>
              Recent Activity
            </h2>
          </div>

          <div>
            {runs === null && (
              <div style={{ padding: "12px 18px", fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                Loading runs…
              </div>
            )}
            {runs !== null && runs.length === 0 && (
              <div style={{ padding: "12px 18px", fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                No runs yet. Trigger a test run or point n8n at the broker.
              </div>
            )}
            {runs?.map((run, index) => (
              <div
                key={run.runId}
                style={{
                  padding: "12px 18px",
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: index < runs.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: statusDot(run.status),
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <strong style={{ color: "var(--ink)" }}>{run.clientName ?? truncateMiddle(run.clientId, 8, 0)}</strong>
                    <span style={{ color: "var(--ink-muted)", margin: "0 6px" }}>·</span>
                    <span style={{ color: "var(--ink-muted)" }}>{RUN_LABEL[run.status] ?? run.status}</span>
                    <span style={{ color: "var(--ink-muted)", margin: "0 6px" }}>·</span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        color: run.status === "succeeded" ? "var(--danger)" : "var(--ink-muted)",
                      }}
                    >
                      {run.costUsd ? `-$${run.costUsd}` : "$0.000000"}
                    </span>
                  </div>
                </div>

                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--ink-subtle)", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>
                    {truncateMiddle(run.runId, 8, 0)}
                    {run.upstreamStatus != null && ` · HTTP ${run.upstreamStatus}`}
                    {run.generationId ? ` · ${truncateMiddle(run.generationId, 12, 0)}` : ""}
                  </span>
                  <Link href={`/proof?run=${run.runId}`} style={{ color: "var(--link)", textDecoration: "none" }}>
                    Receipt &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* n8n Integration Section */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            backgroundColor: "var(--surface)",
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 2px", fontSize: "0.9375rem", fontWeight: 550, color: "var(--ink)" }}>
                n8n Integration
              </h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--ink-muted)" }}>
                One workflow calls POST /api/runs per client. The client balance pays; replays never double-charge.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowN8nConfig(!showN8nConfig)}
                className="btn-quiet-action"
                style={{
                  padding: "6px 12px",
                  borderRadius: 5,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {showN8nConfig ? "Hide Configuration" : "View Configuration"}
              </button>

              <button
                onClick={handleCopyFullConfig}
                className="btn-quiet-action"
                style={{
                  padding: "6px 12px",
                  borderRadius: 5,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {copiedConfig ? "Copied!" : "Copy Configuration"}
              </button>

              <Link
                href="/docs/n8n-broker"
                className="btn-quiet-action"
                style={{
                  padding: "6px 12px",
                  borderRadius: 5,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Open n8n Docs &rarr;
              </Link>
            </div>
          </div>

          {showN8nConfig && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <pre
                style={{
                  backgroundColor: "var(--canvas)",
                  border: "1px solid var(--border)",
                  padding: "14px 16px",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  overflowX: "auto",
                  color: "var(--ink)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
{`POST https://<your-flowfuel-host>/api/runs
Headers:
  Authorization: Bearer <FLOWFUEL_WORKFLOW_TOKEN>
  Content-Type: application/json

Payload:
{
  "clientId": "<client uuid>",
  "workflowRunId": "n8n-{{ $execution.id }}",
  "task": { "type": "lead_summary", "input": "{{ $json.taskInput }}" },
  "model": "google/gemini-2.5-flash",
  "maxOutputTokens": 1024
}

Replays with the same workflowRunId return the original run. No second charge.`}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
