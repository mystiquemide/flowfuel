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
                color: "var(--ink)",
                backgroundColor: "var(--surface)",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
              }}
            >
              Audit & Verification
            </span>
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <Link href="/" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Home
            </Link>
            <Link href="/agency" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Agency Cockpit
            </Link>
            <Link href="/client/onboard" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Client Onboard
            </Link>
            <Link href="/docs/n8n-broker" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              n8n Docs
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Banner with Ledger Image */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "var(--surface)",
            marginBottom: 40,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <div style={{ padding: "36px 32px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.04em",
                color: "var(--fuel)",
                fontWeight: 600,
              }}
            >
              ORBIO BUILD WEEK 2026 AUDIT SPEC
            </span>
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "8px 0 12px",
              }}
            >
              Public Cryptographic Invariant Proof
            </h1>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 20px" }}>
              Every client runs against their own isolated Orbio balance. This proof presents live,
              unsimulated execution evidence on Robinhood Chain (Chain ID: 4663).
            </p>
            <button
              onClick={handleDownloadJson}
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                border: "none",
                padding: "10px 18px",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {downloaded ? "Proof JSON Downloaded!" : "Download Raw Verification JSON"}
            </button>
          </div>

          <div style={{ position: "relative", minHeight: 220 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&w=1200&q=80"
              alt="Blockchain ledger verification"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </div>

        {/* Side-by-Side Matrix Table */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "var(--canvas)",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              backgroundColor: "var(--surface)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
              Simultaneous Two-Client Execution Comparison
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Both branches called with identical task payload: sha256:7f83b165...
            </p>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-muted)",
                  }}
                >
                  <th style={{ padding: "12px 16px" }}>VERIFICATION PARAMETER</th>
                  <th style={{ padding: "12px 16px", color: "var(--success)" }}>
                    CLIENT A (Funded Branch)
                  </th>
                  <th style={{ padding: "12px 16px", color: "var(--danger)" }}>
                    CLIENT B (Unfunded Guard Branch)
                  </th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "0.875rem", fontFamily: "var(--font-mono)" }}>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Wallet Address
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <code>0x78A4e72C413B1A91A25D253988BB61258d9C8c2F</code>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <code>0xA0234103102008dCf310182a829Cd18408373CEC</code>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Activation Status
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)" }}>
                    ID #200 (Active on Robinhood Chain)
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--danger)" }}>
                    None (Zero Activated Balance)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Gateway Response Code
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)", fontWeight: 700 }}>
                    HTTP 200 OK
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--danger)", fontWeight: 700 }}>
                    HTTP 401 Unauthorized
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Gateway Error Output
                  </td>
                  <td style={{ padding: "14px 16px" }}>None (Clean Execution)</td>
                  <td style={{ padding: "14px 16px", color: "var(--danger)" }}>
                    <code>invalid_api_key</code>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    n8n Workflow Output
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)" }}>
                    <code>N8N_CLIENT_A_OK</code>
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--ink-muted)" }}>
                    Blocked (Zero Tokens Forwarded)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Pre-Run Balance
                  </td>
                  <td style={{ padding: "14px 16px" }}>$0.010000</td>
                  <td style={{ padding: "14px 16px" }}>$0.000000</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Post-Run Balance
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)", fontWeight: 700 }}>
                    $0.009775
                  </td>
                  <td style={{ padding: "14px 16px" }}>$0.000000</td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Billed Cost
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--danger)" }}>-$0.000225</td>
                  <td style={{ padding: "14px 16px" }}>$0.000000 (No Charge)</td>
                </tr>
                <tr>
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
                    Agency Master Balance Impact
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)" }}>
                    $0.000000 (Completely Isolated)
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--success)" }}>
                    $0.000000 (No Fallback Leakage)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Real On-Chain Artifact Registry */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "var(--surface)",
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, margin: "0 0 16px" }}>
            Robinhood Chain (ID: 4663) Artifact Registry
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                label: "CREDIT Smart Contract",
                hash: "0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
                note: "Deploys ERC-20 CREDIT tokens on Robinhood Chain",
              },
              {
                label: "Client A CREDIT Transfer Tx",
                hash: "0x85bd856eaaa0fd44abdbb07779ca6f9b72fb9631e24d3f3635a219d05e8596d3",
                note: "Transfers CREDIT from test faucet to Client A wallet",
              },
              {
                label: "Client A Gas Funding Tx",
                hash: "0x4990f594dfe136d8f0132ed81d2b4a02a8bed51175cfa4d2cc0d9ad8d5d7f350",
                note: "Funds Client A with native ETH for contract interaction",
              },
              {
                label: "Client A Credit Activation Tx",
                hash: "0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed",
                note: "Activates $0.01 allowance on Orbio gateway under Activation ID #200",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: 16,
                  backgroundColor: "var(--canvas)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--ink)" }}>
                    {item.label}
                  </div>
                  <code style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                    {item.hash}
                  </code>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-subtle)", marginTop: 4 }}>
                    {item.note}
                  </div>
                </div>

                <button
                  onClick={() => handleCopy(item.hash)}
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                    padding: "6px 12px",
                    borderRadius: 4,
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    cursor: "pointer",
                  }}
                >
                  {copiedHash === item.hash ? "Copied!" : "Copy Hash"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
