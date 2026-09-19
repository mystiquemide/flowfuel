"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function ClientDashboardPage() {
  const [balance, setBalance] = useState<number>(0.009775);
  const [used, setUsed] = useState<number>(0.000225);
  const [epoch, setEpoch] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTopUpModal, setShowTopUpModal] = useState<boolean>(false);
  const [topUpAmount, setTopUpAmount] = useState<string>("0.010000");
  const [confirmingRevoke, setConfirmingRevoke] = useState<boolean>(false);
  const [showKeyDetails, setShowKeyDetails] = useState<boolean>(false);

  const handleTopUp = (e: React.FormEvent) => {
    e.preventDefault();
    const add = parseFloat(topUpAmount) || 0;
    setBalance((prev) => prev + add);
    setNotice(`Successfully topped up allowance by $${topUpAmount} CREDIT on Robinhood Chain.`);
    setShowTopUpModal(false);
    setTimeout(() => setNotice(null), 5000);
  };

  const handleRevokeKey = () => {
    setEpoch((prev) => prev + 1);
    setNotice(
      `Revocation complete. Epoch incremented to ${epoch + 1}. Previous Orbio API key invalidated on-chain.`
    );
    setTimeout(() => setNotice(null), 6000);
  };

  const handleTogglePause = () => {
    setIsPaused(!isPaused);
    setNotice(isPaused ? "Automation resumed." : "Automation paused. Requests will stop at gateway.");
    setTimeout(() => setNotice(null), 4000);
  };

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
              Acme Corp: 0x78A4...8c2F
            </div>
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

        {/* Framing */}
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
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: "0.875rem", color: "var(--ink-muted)" }}>
            <div>
              <span>Authorized agency:</span>{" "}
              <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Apex Automation</strong>{" "}
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)" }}>(agy_orch_9842f)</span>
            </div>
            <span>·</span>
            <div>
              <span>Workflow:</span>{" "}
              <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Lead Processing</strong>
            </div>
          </div>
        </div>

        {/* Live Summary Stat Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* Available Balance Card */}
          <div
            style={{
              padding: "13px 18px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
              AVAILABLE BALANCE
            </div>
            <div
              style={{
                fontSize: "1.625rem",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--success)",
                margin: "3px 0 8px",
              }}
            >
              ${balance.toFixed(6)}
            </div>
            <button
              onClick={() => setShowTopUpModal(true)}
              className="btn-primary-action"
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                border: "none",
                padding: "5px 12px",
                borderRadius: 5,
                fontSize: "0.78125rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              + Top Up Allowance
            </button>
          </div>

          {/* Total Spent Card */}
          <div
            style={{
              padding: "13px 18px",
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
                margin: "3px 0 6px",
              }}
            >
              ${used.toFixed(6)}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
              1 execution (112 tokens)
            </div>
          </div>

          {/* Allowance Status Card */}
          <div
            style={{
              padding: "13px 18px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
            }}
          >
            <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
              ALLOWANCE STATUS
            </div>
            <div
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: isPaused ? "var(--warning)" : "var(--success)",
                margin: "5px 0 6px",
              }}
            >
              {isPaused ? "PAUSED" : "ACTIVE & FUNDED"}
            </div>
            <div>
              <button
                type="button"
                onClick={() => setShowKeyDetails(!showKeyDetails)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--ink-subtle)",
                  fontSize: "0.6875rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    transform: showKeyDetails ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 140ms var(--ease-out-cubic)",
                    flexShrink: 0,
                  }}
                >
                  <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{showKeyDetails ? "Hide technical details" : "View technical details"}</span>
              </button>
              {showKeyDetails && (
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                  Key Epoch: {epoch} (Valid) · Robinhood Chain 4663
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Up Drawer */}
        {showTopUpModal && (
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
              Top Up Allowance from Wallet
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: "0.8125rem", color: "var(--ink-muted)", lineHeight: 1.5 }}>
              Transfer additional CREDIT on Robinhood Chain contract 0xe333...004c to extend your agency allowance.
            </p>
            <form onSubmit={handleTopUp} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="text"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
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
                Confirm Top Up
              </button>
              <button
                type="button"
                onClick={() => setShowTopUpModal(false)}
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

        {/* Spending Limit Meter */}
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
            <span style={{ fontSize: "0.9375rem", fontWeight: 550, color: "var(--ink)" }}>Spending Limit</span>
            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
              Total Cap: ${(balance + used).toFixed(6)} CREDIT
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
            <div
              style={{
                width: `${(used / (balance + used)) * 100}%`,
                backgroundColor: "var(--danger)",
                transition: "width 240ms var(--ease-out-cubic)",
              }}
            />
            <div
              style={{
                width: `${(balance / (balance + used)) * 100}%`,
                backgroundColor: "var(--success)",
                transition: "width 240ms var(--ease-out-cubic)",
              }}
            />
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
            <span style={{ color: "var(--danger)" }}>Used: ${used.toFixed(6)}</span>
            <span style={{ color: "var(--success)" }}>Remaining: ${balance.toFixed(6)}</span>
          </div>
        </div>

        {/* Recent Usage Section */}
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
                  <th style={{ padding: "10px 16px" }}>DATE</th>
                  <th style={{ padding: "10px 16px" }}>TOKENS</th>
                  <th style={{ padding: "10px 16px" }}>AMOUNT</th>
                  <th style={{ padding: "10px 16px" }}>REMAINING</th>
                  <th style={{ padding: "10px 16px", textAlign: "right" }}>PROOF</th>
                </tr>
              </thead>
              <tbody>
                <tr className="agency-table-row" style={{ fontSize: "0.8125rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "var(--ink)", fontWeight: 500 }}>Sep 18, 2026 22:14</div>
                    <div style={{ fontSize: "0.6875rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)", marginTop: 2 }}>
                      gen_orb_499021 · sha256:7f83b1...
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                    112
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--danger)", fontWeight: 600 }}>
                    -${used.toFixed(6)}
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--success)", fontWeight: 600 }}>
                    ${balance.toFixed(6)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Link
                      href="/proof"
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
                      View Proof &rarr;
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Controls Section */}
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
            Pause your automation or revoke the agency’s access at any time.
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleTogglePause}
              className="btn-quiet-action"
              style={{
                padding: "7px 14px",
                borderRadius: 5,
                fontWeight: 500,
                fontSize: "0.8125rem",
                cursor: "pointer",
                color: isPaused ? "var(--success)" : undefined,
                borderColor: isPaused ? "var(--success)" : undefined,
              }}
            >
              {isPaused ? "Resume Automation" : "Pause Automation"}
            </button>

            {confirmingRevoke ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
                  Confirm revoke? Invalidates key (epoch {epoch + 1})
                </span>
                <button
                  onClick={() => {
                    handleRevokeKey();
                    setConfirmingRevoke(false);
                  }}
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
                  Confirm Revoke
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
                style={{
                  backgroundColor: "var(--danger)",
                  color: "#ffffff",
                  border: "none",
                  padding: "7px 14px",
                  borderRadius: 5,
                  fontWeight: 500,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Revoke Access
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
