"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function ClientOnboardPage() {
  const [walletConnected, setWalletConnected] = useState<boolean>(true);
  const [address, setAddress] = useState<string>("0x78A4e72C413B1A91A25D253988BB61258d9C8c2F");
  const [allowance, setAllowance] = useState<string>("0.010000");
  const [showSigningDetails, setShowSigningDetails] = useState<boolean>(false);
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [isSigned, setIsSigned] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleConnectWallet = () => {
    setWalletConnected(true);
    setAddress("0x78A4e72C413B1A91A25D253988BB61258d9C8c2F");
  };

  const handleSignAllowance = () => {
    setIsSigning(true);
    setTimeout(() => {
      setIsSigning(false);
      setIsSigned(true);
      setTxHash("0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed");
    }, 1200);
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
        {/* Page Framing */}
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
            Set Your AI Spending Limit
          </h1>
          <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: 0, maxWidth: 680 }}>
            Choose how much of your CREDIT balance this agency can use for AI inference. The agency can only spend from the amount you activate.
          </p>
        </div>

        {/* Compact Trust Strip */}
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
            <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>
              You keep custody
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--success)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>
              Agency can only use the amount you approve
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--success)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>✓</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--ink)", fontWeight: 500 }}>
              Unactivated CREDIT stays in your wallet
            </span>
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
                STEP 01
              </div>
              <h2 style={{ margin: "0 0 3px", fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)" }}>
                Connect Wallet
              </h2>
              <div style={{ fontSize: "0.8125rem", color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
                Network: Robinhood Chain 4663
              </div>
            </div>

            {walletConnected ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  backgroundColor: "rgba(22, 163, 74, 0.08)",
                  border: "1px solid rgba(22, 163, 74, 0.25)",
                  color: "var(--success)",
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
                    backgroundColor: "var(--success)",
                    display: "inline-block",
                  }}
                />
                Connected: {address.slice(0, 6)}...{address.slice(-4)}
              </div>
            ) : (
              <button
                onClick={handleConnectWallet}
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
            Choose Your Spending Limit
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Choose the amount of CREDIT this agency can use for your AI automation.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
            <input
              type="text"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                backgroundColor: "var(--surface)",
                color: "var(--ink)",
                fontFamily: "var(--font-mono)",
                fontSize: "1.0625rem",
                fontWeight: 600,
                width: 160,
              }}
            />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--ink)", fontWeight: 500 }}>
              CREDIT (${allowance} USD)
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
            <span>Available balance: 0.010000 CREDIT</span>
            <span>·</span>
            <span>Estimated runs: ~44</span>
          </div>
        </div>

        {/* Step 3: Review and Activate */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            backgroundColor: "var(--canvas)",
            padding: "14px 18px",
            marginBottom: 20,
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
            Review and Activate
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--ink-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Review your spending limit, then sign with your wallet to activate it.
          </p>

          {/* Secondary Expandable Signing Payload */}
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowSigningDetails(!showSigningDetails)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "var(--ink-muted)",
                fontSize: "0.8125rem",
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
                  transform: showSigningDetails ? "rotate(90deg)" : "rotate(0deg)",
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
              <span>{showSigningDetails ? "Hide signing details" : "View signing details"}</span>
            </button>

            {showSigningDetails && (
              <div
                style={{
                  marginTop: 8,
                  padding: "10px 12px",
                  backgroundColor: "var(--surface)",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--ink-muted)",
                  wordBreak: "break-all",
                }}
              >
                Orbio API key - chain 4663 - epoch 1 - allowance {allowance} CREDIT
              </div>
            )}
          </div>

          {isSigned ? (
            <div
              style={{
                padding: 16,
                backgroundColor: "rgba(22, 163, 74, 0.08)",
                border: "1px solid rgba(22, 163, 74, 0.3)",
                borderRadius: 6,
              }}
            >
              <div style={{ color: "var(--success)", fontWeight: 600, fontSize: "0.875rem", marginBottom: 6 }}>
                ALLOWANCE ACTIVATED ON-CHAIN
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.8125rem", color: "var(--ink)", marginBottom: 12 }}>
                Transaction Hash: <code>{txHash}</code> (Activation ID: #200)
              </div>
              <div>
                <Link
                  href="/client/dashboard"
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
                  Go to Client Dashboard &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <button
              onClick={handleSignAllowance}
              disabled={isSigning}
              className="btn-primary-action"
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                border: "none",
                padding: "10px 20px",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: isSigning ? "not-allowed" : "pointer",
                opacity: isSigning ? 0.7 : 1,
              }}
            >
              {isSigning ? "Signing in Wallet..." : `Activate ${allowance} CREDIT`}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
