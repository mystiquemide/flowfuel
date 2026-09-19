"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

interface ClientRow {
  id: string;
  name: string;
  address: string;
  allowance: string;
  balance: string;
  used: string;
  status: "ACTIVE" | "UNFUNDED" | "READY";
  epoch: number;
}

interface ActivityItem {
  id: string;
  client: string;
  action: string;
  amountOrStatus: string;
  statusType: "success" | "blocked" | "ready";
  detail: string;
}

const INITIAL_CLIENTS: ClientRow[] = [
  {
    id: "client-a-acme",
    name: "Acme Corp (Client A)",
    address: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
    allowance: "$0.010000",
    balance: "$0.009775",
    used: "$0.000225",
    status: "ACTIVE",
    epoch: 1,
  },
  {
    id: "client-b-beta",
    name: "Beta Group (Client B)",
    address: "0xA0234103102008dCf310182a829Cd18408373CEC",
    allowance: "$0.000000",
    balance: "$0.000000",
    used: "$0.000000",
    status: "UNFUNDED",
    epoch: 0,
  },
  {
    id: "client-c-crest",
    name: "Crest Labs (Client C)",
    address: "0x41f8B48220A656811252199b109D4e27f91812dE",
    allowance: "$0.050000",
    balance: "$0.050000",
    used: "$0.000000",
    status: "READY",
    epoch: 1,
  },
];

const RECENT_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-1",
    client: "Acme Corp",
    action: "inference completed",
    amountOrStatus: "$0.000225",
    statusType: "success",
    detail: "Run #200 · Orbio DeepSeek-V3",
  },
  {
    id: "act-2",
    client: "Beta Group",
    action: "run blocked",
    amountOrStatus: "no available balance",
    statusType: "blocked",
    detail: "Run #201 · 401 invalid_api_key",
  },
  {
    id: "act-3",
    client: "Crest Labs",
    action: "spending limit activated",
    amountOrStatus: "$0.050000",
    statusType: "ready",
    detail: "Allowance set · Robinhood Chain 4663",
  },
];

export default function AgencyPage() {
  const [clients, setClients] = useState<ClientRow[]>(INITIAL_CLIENTS);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedConfig, setCopiedConfig] = useState<boolean>(false);
  const [selectedClient, setSelectedClient] = useState<string>("client-a-acme");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState<string>("");
  const [newClientAddress, setNewClientAddress] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [showN8nConfig, setShowN8nConfig] = useState<boolean>(false);

  const handleCopyNode = (clientId: string) => {
    const snippet = JSON.stringify(
      {
        parameters: {
          url: "https://broker.flowfuel.io/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FlowFuel-Client": clientId,
          },
          bodyParameters: {
            model: "orbio/deepseek-v3",
            prompt: "={{ $json.prompt }}",
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
    const snippet = `POST https://broker.flowfuel.io/v1/chat/completions
Headers:
  Content-Type: application/json
  X-FlowFuel-Client: {{ $json.clientWalletAddress }}

Payload:
{
  "model": "orbio/deepseek-v3",
  "messages": [
    { "role": "user", "content": "{{ $json.taskPrompt }}" }
  ],
  "idempotencyKey": "n8n-{{ $execution.id }}"
}`;
    navigator.clipboard.writeText(snippet);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const handleSimulateRun = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    if (client.status === "ACTIVE") {
      setTestResult(
        `SUCCESS 200 OK: Run authenticated against client balance. Gateway Generation: gen_orb_499021. Billed: $0.000225. Remaining: $0.009775. Client balance verified.`
      );
    } else if (client.status === "UNFUNDED") {
      setTestResult(
        `STOPPED 401 Unauthorized: invalid_api_key. Client has no activated Orbio balance on Robinhood Chain. Zero tokens deducted. Agency balance untouched.`
      );
    } else {
      setTestResult(
        `READY 200 OK: Client balance allocated ($0.050000). Awaiting first execution from n8n webhook.`
      );
    }
  };

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientAddress) return;
    const newEntry: ClientRow = {
      id: `client-${Date.now().toString(36)}`,
      name: newClientName,
      address: newClientAddress,
      allowance: "$0.000000",
      balance: "$0.000000",
      used: "$0.000000",
      status: "UNFUNDED",
      epoch: 0,
    };
    setClients([...clients, newEntry]);
    setNewClientName("");
    setNewClientAddress("");
    setShowAddForm(false);
  };

  const activeCount = clients.filter((c) => c.status === "ACTIVE").length;
  const unfundedCount = clients.filter((c) => c.status === "UNFUNDED").length;
  const readyCount = clients.filter((c) => c.status === "READY").length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)", color: "var(--ink)" }}>
      {/* Header */}
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
        {/* Compact Workspace Header */}
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
                  <span style={{ color: "var(--ink-muted)" }}>Agency ID:</span>{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>agy_orch_9842f</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Network:</span>{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Robinhood Chain 4663</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Orbio Gateway:</span>{" "}
                  <span style={{ color: "var(--success)", fontWeight: 500 }}>Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Workspace Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)", marginBottom: 3 }}>
              CLIENTS
            </div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--ink)" }}>
              {clients.length} Clients
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--success)", marginBottom: 3 }}>
              ACTIVE
            </div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--success)" }}>
              {activeCount} Active
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--danger)", marginBottom: 3 }}>
              UNFUNDED
            </div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--danger)" }}>
              {unfundedCount} Unfunded
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--warning)", marginBottom: 3 }}>
              READY
            </div>
            <div style={{ fontSize: "1.0625rem", fontWeight: 600, color: "var(--warning)" }}>
              {readyCount} Ready
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
            <form onSubmit={handleAddClient} style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
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
                Save Client
              </button>
            </form>
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
            }}
          >
            <h2 style={{ fontSize: "1.0625rem", fontWeight: 550, margin: 0, color: "var(--ink)" }}>
              Clients
            </h2>
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
                  <th style={{ padding: "10px 12px" }}>SPENDING LIMIT</th>
                  <th style={{ padding: "10px 12px" }}>USED</th>
                  <th style={{ padding: "10px 12px" }}>AVAILABLE</th>
                  <th style={{ padding: "10px 12px" }}>STATUS</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="agency-table-row"
                    style={{
                      borderBottom: "1px solid var(--border)",
                      fontSize: "0.8125rem",
                      whiteSpace: "nowrap",
                      backgroundColor: selectedClient === c.id ? "rgba(255, 79, 0, 0.02)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 12px" }}>
                      <strong style={{ color: "var(--ink)", fontWeight: 550 }}>{c.name}</strong>
                    </td>
                    <td style={{ padding: "12px 12px", fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                      <code style={{ color: "var(--ink-muted)" }}>{c.address.slice(0, 8)}...{c.address.slice(-6)}</code>
                    </td>
                    <td style={{ padding: "12px 12px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                      {c.allowance}
                    </td>
                    <td style={{ padding: "12px 12px", fontFamily: "var(--font-mono)", color: "var(--danger)" }}>
                      {c.used}
                    </td>
                    <td
                      style={{
                        padding: "12px 12px",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        color: c.status === "ACTIVE" ? "var(--success)" : "var(--ink-muted)",
                      }}
                    >
                      {c.balance}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontFamily: "var(--font-mono)",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: 600,
                          backgroundColor:
                            c.status === "ACTIVE"
                              ? "rgba(22, 163, 74, 0.1)"
                              : c.status === "READY"
                              ? "rgba(217, 119, 6, 0.1)"
                              : "rgba(220, 38, 38, 0.1)",
                          color:
                            c.status === "ACTIVE"
                              ? "var(--success)"
                              : c.status === "READY"
                              ? "var(--warning)"
                              : "var(--danger)",
                        }}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 12px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          onClick={() => {
                            setSelectedClient(c.id);
                            handleSimulateRun(c.id);
                          }}
                          className="btn-quiet-action"
                          style={{
                            padding: "5px 9px",
                            borderRadius: 4,
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                          }}
                        >
                          Test Run
                        </button>
                        <button
                          onClick={() => handleCopyNode(c.address)}
                          className="btn-quiet-action"
                          style={{
                            padding: "5px 9px",
                            borderRadius: 4,
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            color: copiedId === c.address ? "var(--success)" : undefined,
                            borderColor: copiedId === c.address ? "var(--success)" : undefined,
                          }}
                        >
                          {copiedId === c.address ? "Copied!" : "Copy Routing Header"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Test Verdict Card */}
        {testResult && (
          <div
            style={{
              padding: 16,
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)", color: "var(--fuel)" }}>
                GATEWAY TEST VERDICT
              </strong>
              <button
                onClick={() => setTestResult(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  color: "var(--ink-muted)",
                }}
              >
                Dismiss
              </button>
            </div>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                color: "var(--ink)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {testResult}
            </p>
          </div>
        )}

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
            {RECENT_ACTIVITIES.map((act, index) => (
              <div
                key={act.id}
                style={{
                  padding: "12px 18px",
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  borderBottom: index < RECENT_ACTIVITIES.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  fontSize: "0.8125rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor:
                        act.statusType === "success"
                          ? "var(--success)"
                          : act.statusType === "blocked"
                          ? "var(--danger)"
                          : "var(--warning)",
                    }}
                  />
                  <div>
                    <strong style={{ color: "var(--ink)" }}>{act.client}</strong>
                    <span style={{ color: "var(--ink-muted)", margin: "0 6px" }}>·</span>
                    <span style={{ color: "var(--ink-muted)" }}>{act.action}</span>
                    <span style={{ color: "var(--ink-muted)", margin: "0 6px" }}>·</span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        color:
                          act.statusType === "success"
                            ? "var(--success)"
                            : act.statusType === "blocked"
                            ? "var(--danger)"
                            : "var(--ink)",
                      }}
                    >
                      {act.amountOrStatus}
                    </span>
                  </div>
                </div>

                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--ink-subtle)" }}>
                  {act.detail}
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
                Use this configuration to route every n8n run through the correct client balance.
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
{`POST https://broker.flowfuel.io/v1/chat/completions
Headers:
  Content-Type: application/json
  X-FlowFuel-Client: {{ $json.clientWalletAddress }}

Payload:
{
  "model": "orbio/deepseek-v3",
  "messages": [
    { "role": "user", "content": "{{ $json.taskPrompt }}" }
  ],
  "idempotencyKey": "n8n-{{ $execution.id }}"
}`}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
