"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function ProofPage() {
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const proofData = {
    network: {
      name: "Robinhood Chain Testnet",
      chainId: 4663,
      verifiedAt: "2026-09-18T22:14:00Z",
    },
    invariant: "Every client runs against their own isolated Orbio balance.",
    contracts: {
      creditContract: "0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
      activationId: 200,
    },
    clientA: {
      address: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
      activatedAllowance: "$0.010000",
      usedCost: "$0.000225",
      remainingBalance: "$0.009775",
      httpStatus: 200,
      n8nOutput: "N8N_CLIENT_A_OK",
      txHashes: {
        creditTransfer: "0x85bd856eaaa0fd44abdbb07779ca6f9b72fb9631e24d3f3635a219d05e8596d3",
        ethFunding: "0x4990f594dfe136d8f0132ed81d2b4a02a8bed51175cfa4d2cc0d9ad8d5d7f350",
        activation: "0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed",
      },
    },
    clientB: {
      address: "0xA0234103102008dCf310182a829Cd18408373CEC",
      activatedAllowance: "$0.000000",
      usedCost: "$0.000000",
      remainingBalance: "$0.000000",
      httpStatus: 401,
      errorCode: "invalid_api_key",
      n8nOutput: null,
    },
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(proofData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowfuel-cryptographic-proof-chain-4663.json";
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

  const truncate = (str: string, lead = 10, tail = 8) => {
    if (str.length <= lead + tail) return str;
    return `${str.slice(0, lead)}...${str.slice(-tail)}`;
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
        {/* Simplified Page Header */}
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
          <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 16px" }}>
            Funded clients execute. Unfunded clients stop before inference. No shared agency balance is touched.
          </p>

          {/* Top Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <a
              href="#onchain-evidence"
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
              <span>View Onchain Evidence</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 2.5V9.5M6 9.5L9 6.5M6 9.5L3 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>

            <button
              type="button"
              onClick={handleDownloadJson}
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
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 8.5V9.5C2.5 10.0523 2.94772 10.5 3.5 10.5H8.5C9.05228 10.5 9.5 10.0523 9.5 9.5V8.5M6 1.5V7.5M6 7.5L3.5 5M6 7.5L8.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{downloaded ? "JSON Downloaded" : "Download Raw Verification JSON"}</span>
            </button>
          </div>
        </div>

        {/* Compact Proof Summary Row */}
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--success)", fontWeight: 500 }}>
            <span>✓</span>
            <span>Client A executed</span>
          </div>
          <span style={{ color: "var(--border)" }}>·</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--danger)", fontWeight: 500 }}>
            <span style={{ fontSize: "0.75rem" }}>✕</span>
            <span>Client B blocked</span>
          </div>
          <span style={{ color: "var(--border)" }}>·</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--success)", fontWeight: 500 }}>
            <span>✓</span>
            <span>$0 agency balance impact</span>
          </div>
          <span style={{ color: "var(--border)" }}>·</span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ink)", fontWeight: 500 }}>
            <span>✓</span>
            <span>Robinhood Chain 4663</span>
          </div>
        </div>

        {/* Two-Client Execution Comparison Table */}
        <div
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
              Two-Client Execution Comparison
            </h2>
            <div style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--ink-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span>Both branches called with identical task payload:</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <code
                  title="sha256:7f83b1652796e67e58a2e5793ec920b75960c181db8bf0b2fe46d84a75416fd1"
                  style={{
                    fontSize: "0.6875rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-muted)",
                    backgroundColor: "var(--canvas)",
                    padding: "1px 6px",
                    borderRadius: 3,
                    border: "1px solid var(--border)",
                  }}
                >
                  sha256:7f83b1...416fd1
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy("sha256:7f83b1652796e67e58a2e5793ec920b75960c181db8bf0b2fe46d84a75416fd1")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 2px",
                    cursor: "pointer",
                    color: copiedHash === "sha256:7f83b1652796e67e58a2e5793ec920b75960c181db8bf0b2fe46d84a75416fd1" ? "var(--success)" : "var(--ink-muted)",
                    fontSize: "0.6875rem",
                    fontFamily: "var(--font-mono)",
                    textDecoration: "underline",
                  }}
                >
                  {copiedHash === "sha256:7f83b1652796e67e58a2e5793ec920b75960c181db8bf0b2fe46d84a75416fd1" ? "Copied" : "Copy"}
                </button>
              </span>
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
                  <th style={{ padding: "10px 16px", color: "var(--success)", fontWeight: 600 }}>
                    Client A · Funded
                  </th>
                  <th style={{ padding: "10px 16px", color: "var(--danger)", fontWeight: 600 }}>
                    Client B · No Balance
                  </th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "0.8125rem", fontFamily: "var(--font-mono)" }}>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Wallet Address
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>
                    <code>0x78A4e72C413B1A91A25D253988BB61258d9C8c2F</code>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>
                    <code>0xA0234103102008dCf310182a829Cd18408373CEC</code>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Activation Status
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)" }}>
                    ID #200 (Active on Robinhood Chain)
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--danger)" }}>
                    None (Zero Activated Balance)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Execution State
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "var(--success)", fontWeight: 600 }}>Executed · HTTP 200 OK</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", fontFamily: "var(--font-sans)", marginTop: 2 }}>
                      Clean completion via Orbio gateway
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "var(--danger)", fontWeight: 600 }}>Blocked before inference · No active allowance</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: 2 }}>
                      HTTP 401 Unauthorized (invalid_api_key)
                    </div>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Gateway Response Code
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)", fontWeight: 600 }}>
                    HTTP 200 OK
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--danger)", fontWeight: 600 }}>
                    HTTP 401 Unauthorized
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Gateway Error Output
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink-muted)" }}>None (Clean Execution)</td>
                  <td style={{ padding: "12px 16px", color: "var(--danger)" }}>
                    <code>invalid_api_key</code>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    n8n Workflow Output
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)" }}>
                    <code>N8N_CLIENT_A_OK</code>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink-muted)" }}>
                    Blocked (Zero Tokens Forwarded)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Pre-Run Balance
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>$0.010000</td>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>$0.000000</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Post-Run Balance
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)", fontWeight: 600 }}>
                    $0.009775
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--ink)" }}>$0.000000</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Billed Cost
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--danger)" }}>-$0.000225</td>
                  <td style={{ padding: "12px 16px", color: "var(--ink-muted)" }}>$0.000000 (No Charge)</td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-sans)", fontWeight: 550, color: "var(--ink)" }}>
                    Agency Balance Impact
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)" }}>
                    $0.000000 (Completely Isolated)
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--success)" }}>
                    $0.000000 (No Fallback Leakage)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Onchain Evidence Section */}
        <div
          id="onchain-evidence"
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
                Cryptographic transaction and contract artifacts verifiable on the public explorer
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
            {[
              {
                label: "CREDIT Contract",
                hash: "0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
                note: "ERC-20 CREDIT token contract on Robinhood Chain",
                explorerUrl: "https://robin.etherscan.io/address/0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
              },
              {
                label: "Client A Funding Transaction",
                hash: "0x85bd856eaaa0fd44abdbb07779ca6f9b72fb9631e24d3f3635a219d05e8596d3",
                note: "Transfers CREDIT from test faucet to Client A wallet",
                explorerUrl: "https://robin.etherscan.io/tx/0x85bd856eaaa0fd44abdbb07779ca6f9b72fb9631e24d3f3635a219d05e8596d3",
              },
              {
                label: "Client A Gas Funding Transaction",
                hash: "0x4990f594dfe136d8f0132ed81d2b4a02a8bed51175cfa4d2cc0d9ad8d5d7f350",
                note: "Funds Client A with native ETH for contract interaction",
                explorerUrl: "https://robin.etherscan.io/tx/0x4990f594dfe136d8f0132ed81d2b4a02a8bed51175cfa4d2cc0d9ad8d5d7f350",
              },
              {
                label: "Client A Allowance Activation",
                hash: "0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed",
                note: "Activates $0.01 allowance on Orbio gateway under Activation ID #200",
                explorerUrl: "https://robin.etherscan.io/tx/0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed",
              },
            ].map((item, idx) => (
              <div
                key={idx}
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
                      {item.label}
                    </span>
                    <span
                      title={item.hash}
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
                      {truncate(item.hash, 10, 8)}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginTop: 4 }}>
                    {item.note}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <a
                    href={item.explorerUrl}
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
                      cursor: "pointer",
                    }}
                  >
                    <span>View on Explorer</span>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3.5 2.5H9.5V8.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopy(item.hash)}
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
                    {copiedHash === item.hash ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Subtext */}
        <div style={{ textAlign: "center", paddingTop: 8 }}>
          <p style={{ fontSize: "0.6875rem", color: "var(--ink-subtle)", fontFamily: "var(--font-mono)", margin: 0 }}>
            Verified live · Robinhood Chain 4663 · Orbio Gateway · All listed artifacts are verifiable onchain
          </p>
        </div>
      </main>
    </div>
  );
}
