"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function Home() {
  useEffect(() => {
    // Arm smooth motion
    document.body.classList.add("js-motion");

    const targets = document.querySelectorAll<HTMLElement>(".reveal-on-scroll, .reveal-preview");
    if (!targets.length) return;

    // Immediately reveal elements already visible or near the initial viewport
    targets.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 80) {
        el.classList.add("is-revealed");
      }
    });

    if (!("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.02,
        rootMargin: "0px 0px 80px 0px",
      }
    );

    targets.forEach((el) => {
      if (!el.classList.contains("is-revealed")) {
        observer.observe(el);
      }
    });

    // Fail-safe: ensure all elements become visible even if scrolling or observer fails
    const timer = setTimeout(() => {
      targets.forEach((el) => el.classList.add("is-revealed"));
    }, 1200);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)", color: "var(--ink)" }}>
      {/* Top Header */}
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

          <nav style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link
              href="/agency"
              className="nav-link-subtle"
              style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink-muted)" }}
            >
              Agency Workspace
            </Link>
            <Link
              href="/client/onboard"
              className="nav-link-subtle"
              style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink-muted)" }}
            >
              Client Onboard
            </Link>
            <Link
              href="/proof"
              className="nav-link-subtle"
              style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink-muted)" }}
            >
              Live Proof
            </Link>
            <Link
              href="/docs/n8n-broker"
              className="nav-link-subtle"
              style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--ink-muted)" }}
            >
              Docs
            </Link>
            <Link
              href="/agency"
              className="btn-primary-action"
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Launch App
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: "68px 24px 50px",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
          <div
            className="animate-hero-eyebrow"
            style={{
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.06em",
                color: "var(--fuel)",
                fontWeight: 600,
              }}
            >
              CLIENT-FUNDED INFERENCE FOR N8N
            </span>
          </div>

          <h1
            style={{
              fontSize: "clamp(2rem, 3.75vw, 2.875rem)",
              fontWeight: 550,
              lineHeight: 1.12,
              letterSpacing: "-0.03em",
              margin: "0 0 20px",
              color: "var(--ink)",
            }}
          >
            <span className="animate-hero-title-main" style={{ display: "inline-block" }}>
              One n8n workflow.
              <br />
              Multiple paying clients.
            </span>
            <br />
            <span className="animate-hero-title-accent" style={{ color: "var(--fuel)", display: "inline-block" }}>
              Zero shared API balance.
            </span>
          </h1>

          <p
            className="animate-hero-copy"
            style={{
              fontSize: "1.0625rem",
              lineHeight: 1.6,
              color: "var(--ink-muted)",
              maxWidth: 680,
              margin: "0 auto 32px",
              fontWeight: 400,
            }}
          >
            Run one n8n workflow across multiple clients while each client funds their own AI inference. No shared provider balance, no fronting model costs, and no monthly usage reconciliation.
          </p>

          <div
            className="animate-hero-cta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 32,
            }}
          >
            <Link
              href="/agency"
              className="btn-primary-action"
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                padding: "9px 18px",
                borderRadius: 5,
                fontSize: "0.875rem",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Open Agency Workspace
              <span className="btn-arrow-icon" aria-hidden="true">&rarr;</span>
            </Link>

            <Link
              href="/proof"
              className="btn-secondary-action"
              style={{
                backgroundColor: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--border)",
                padding: "9px 18px",
                borderRadius: 5,
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              View Live Proof
            </Link>
          </div>

          <div
            className="animate-hero-meta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              color: "var(--ink-subtle)",
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
              justifyContent: "center",
            }}
          >
            <div>
              <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>Network:</span> Robinhood Chain (ID: 4663)
            </div>
            <div>
              <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>CREDIT:</span> 0xe33322da...c73004c
            </div>
            <div>
              <span style={{ color: "var(--ink-muted)", fontWeight: 500 }}>Security:</span> Non-Custodial Wallet Signing
            </div>
          </div>
        </div>

        {/* Real Product Preview: Agency Workspace Invariant Router */}
        <div
          className="reveal-preview"
          style={{
            marginTop: 32,
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid var(--border)",
            backgroundColor: "var(--canvas)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            textAlign: "left",
          }}
        >
          {/* Window Chrome */}
          <div
            style={{
              padding: "10px 16px",
              backgroundColor: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#e2e0dc", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#e2e0dc", display: "inline-block" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#e2e0dc", display: "inline-block" }} />
              <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                flowfuel.app/agency · Multi-Client Invariant Router
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--success)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--success)", fontWeight: 600 }}>
                ORBIO GATEWAY ONLINE
              </span>
            </div>
          </div>

          {/* Cockpit Header Summary */}
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              backgroundColor: "var(--canvas)",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--fuel)", fontWeight: 600 }}>
                  CENTRAL N8N ROUTER
                </span>
                <span style={{ color: "var(--border)" }}>/</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.6875rem", color: "var(--ink-muted)" }}>
                  agy_orch_9842f
                </span>
              </div>
              <h3 style={{ fontSize: "1.0625rem", fontWeight: 550, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>
                FlowFuel Agency Workspace
              </h3>
            </div>
            <div style={{ display: "flex", gap: 16, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
              <div style={{ padding: "4px 10px", borderRadius: 4, backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--ink-muted)" }}>Network: </span>
                <strong style={{ color: "var(--ink)" }}>Robinhood Chain 4663</strong>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 4, backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--ink-muted)" }}>Active Clients: </span>
                <strong style={{ color: "var(--ink)" }}>3 Connected</strong>
              </div>
            </div>
          </div>

          {/* Actual Client Roster Preview Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.6875rem",
                    color: "var(--ink-muted)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "10px 16px" }}>CLIENT NAME</th>
                  <th style={{ padding: "10px 16px" }}>WALLET IDENTITY</th>
                  <th style={{ padding: "10px 16px" }}>ACTIVATED CAP</th>
                  <th style={{ padding: "10px 16px" }}>INFERENCE USED</th>
                  <th style={{ padding: "10px 16px" }}>AVAILABLE BALANCE</th>
                  <th style={{ padding: "10px 16px" }}>INFERENCE STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--canvas)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500, color: "var(--ink)" }}>
                    Acme Corp (Client A)
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    <code>0x78A4...8c2F</code>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                    $0.010000
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--danger)" }}>
                    -$0.000225
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--success)" }}>
                    <span className="preview-data-highlight">$0.009775</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      className="preview-status-pill preview-status-1"
                      style={{
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 600,
                        backgroundColor: "rgba(22, 163, 74, 0.1)",
                        color: "var(--success)",
                        display: "inline-block",
                      }}
                    >
                      ACTIVE · 200 OK
                    </span>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "rgba(220, 38, 38, 0.02)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500, color: "var(--ink)" }}>
                    Beta Group (Client B)
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    <code>0xA023...3CEC</code>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                    $0.000000
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                    $0.000000
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink-subtle)" }}>
                    $0.000000
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      className="preview-status-pill preview-status-2"
                      style={{
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 600,
                        backgroundColor: "rgba(220, 38, 38, 0.1)",
                        color: "var(--danger)",
                        display: "inline-block",
                      }}
                    >
                      STOPPED · NO BALANCE
                    </span>
                  </td>
                </tr>
                <tr style={{ backgroundColor: "var(--canvas)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500, color: "var(--ink)" }}>
                    Crest Labs (Client C)
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--ink-muted)" }}>
                    <code>0x41f8...12dE</code>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink)" }}>
                    $0.050000
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--ink-muted)" }}>
                    $0.000000
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink)" }}>
                    $0.050000
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      className="preview-status-pill preview-status-3"
                      style={{
                        fontSize: "0.6875rem",
                        fontFamily: "var(--font-mono)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontWeight: 600,
                        backgroundColor: "rgba(217, 119, 6, 0.1)",
                        color: "var(--warning)",
                        display: "inline-block",
                      }}
                    >
                      READY · ALLOWANCE SET
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Node Integration Footer in Preview */}
          <div
            style={{
              padding: "10px 16px",
              backgroundColor: "var(--surface)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              color: "var(--ink-muted)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--fuel)", fontWeight: 600 }}>n8n Node Header:</span>
              <code>X-FlowFuel-Client: &#123;&#123; $json.clientId &#125;&#125;</code>
            </div>
            <div>
              <span style={{ color: "var(--ink)" }}>Central Router:</span> Every client balance is isolated. Unfunded runs stop before model usage.
            </div>
          </div>
        </div>
      </section>

      {/* Verified Live Two-Client Execution Section */}
      <section
        className="reveal-on-scroll"
        style={{
          backgroundColor: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          padding: "58px 24px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ marginBottom: 32 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.04em",
                color: "var(--fuel)",
                fontWeight: 600,
              }}
            >
              VERIFIED LIVE
            </span>
            <h2
              style={{
                fontSize: "clamp(1.5rem, 2.75vw, 2rem)",
                fontWeight: 500,
                letterSpacing: "-0.025em",
                margin: "8px 0 12px",
                color: "var(--ink)",
                lineHeight: 1.15,
              }}
            >
              One Workflow. Two Clients. Separate Balances.
            </h2>
            <p style={{ color: "var(--ink-muted)", fontSize: "1.0625rem", maxWidth: 640 }}>
              The same n8n workflow runs for two different clients. Client A has an active balance and executes normally. Client B has no active balance and stops before inference is consumed.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 24,
            }}
          >
            {/* Client A Card */}
            <div
              className="proof-card-item proof-card-a"
              style={{
                backgroundColor: "var(--canvas)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 550, fontSize: "1.0625rem", color: "var(--ink)" }}>
                  Client A · Funded
                </span>
                <span
                  className="card-status-pill"
                  style={{
                    backgroundColor: "rgba(22, 163, 74, 0.1)",
                    color: "var(--success)",
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    display: "inline-block",
                  }}
                >
                  200 OK SUCCESS
                </span>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Wallet:</span>{" "}
                  <code style={{ color: "var(--ink)" }}>0x78A4e72C...d9C8c2F</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Activation ID:</span>{" "}
                  <code style={{ color: "var(--ink)" }}>#200 (Tx: 0x229f5abb...)</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Initial Allowance:</span>{" "}
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>$0.010000</span>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Inference Used:</span>{" "}
                  <span style={{ color: "var(--danger)", fontWeight: 500 }}>-$0.000225</span>
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "var(--surface)",
                    borderRadius: 4,
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: "var(--ink-muted)" }}>Available Balance:</span>{" "}
                  <strong style={{ color: "var(--success)", fontSize: "1rem" }}>$0.009775</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>n8n Output:</span>{" "}
                  <code style={{ color: "var(--success)" }}>N8N_CLIENT_A_OK</code>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <Link
                  href="/proof"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "var(--fuel)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  View Cryptographic Receipt &rarr;
                </Link>
              </div>
            </div>

            {/* Client B Card */}
            <div
              className="proof-card-item proof-card-b"
              style={{
                backgroundColor: "var(--canvas)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 550, fontSize: "1.0625rem", color: "var(--ink)" }}>
                  Client B · No Balance
                </span>
                <span
                  className="card-status-pill"
                  style={{
                    backgroundColor: "rgba(220, 38, 38, 0.08)",
                    color: "var(--danger)",
                    padding: "3px 10px",
                    borderRadius: 12,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    display: "inline-block",
                  }}
                >
                  STOPPED · NO BALANCE
                </span>
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.8125rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Execution State:</span>{" "}
                  <strong style={{ color: "var(--danger)" }}>Stopped · No active allowance</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Wallet:</span>{" "}
                  <code style={{ color: "var(--ink)" }}>0xA0234103...08373CEC</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Activation Status:</span>{" "}
                  <code style={{ color: "var(--ink)" }}>None (Unactivated)</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Initial Allowance:</span>{" "}
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>$0.000000</span>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)" }}>Inference Used:</span>{" "}
                  <span style={{ color: "var(--ink)", fontWeight: 500 }}>$0.000000 (No Charge)</span>
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "var(--surface)",
                    borderRadius: 4,
                    marginTop: 4,
                  }}
                >
                  <span style={{ color: "var(--ink-muted)" }}>Available Balance:</span>{" "}
                  <strong style={{ color: "var(--ink-subtle)", fontSize: "1rem" }}>$0.000000</strong>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-subtle)", paddingTop: 2 }}>
                  <span style={{ color: "var(--ink-muted)" }}>Raw Gateway Response:</span>{" "}
                  <code>401 invalid_api_key</code>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <Link
                  href="/proof"
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "var(--ink-muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Inspect Zero-Leak Audit &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three Pillars Section */}
      <section className="reveal-on-scroll" style={{ padding: "48px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 32px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              letterSpacing: "0.04em",
              color: "var(--fuel)",
              fontWeight: 600,
            }}
          >
            ENGINEERED FOR AGENCIES
          </span>
          <h2
            style={{
              fontSize: "clamp(1.5rem, 2.75vw, 2rem)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              margin: "8px 0 16px",
              color: "var(--ink)",
            }}
          >
            Built for Agencies Running AI Automations
          </h2>
          <p style={{ color: "var(--ink-muted)", fontSize: "1rem" }}>
            Eliminate billing disputes, master key liabilities, and manual monthly invoice
            reconciliation across all client workflows.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 32,
          }}
        >
          {/* Card 1: Billing */}
          <div
            className="stagger-item stagger-1 benefit-card-interactive"
            style={{
              padding: 28,
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--fuel)",
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                01 // BILLING
              </div>
              <h3 style={{ fontSize: "1.1875rem", fontWeight: 550, letterSpacing: "-0.02em", margin: "0 0 12px", color: "var(--ink)" }}>
                Stop Fronting AI Costs
              </h3>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.55, margin: 0 }}>
                Each client funds their own inference allowance. Your agency no longer has to absorb model usage, estimate monthly costs, or chase reimbursements.
              </p>
            </div>
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)" }}>
              Robinhood Chain CREDIT allowance prevents agency financial exposure
            </div>
          </div>

          {/* Card 2: Operations */}
          <div
            className="stagger-item stagger-2 benefit-card-interactive"
            style={{
              padding: 28,
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--fuel)",
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                02 // OPERATIONS
              </div>
              <h3 style={{ fontSize: "1.1875rem", fontWeight: 550, letterSpacing: "-0.02em", margin: "0 0 12px", color: "var(--ink)" }}>
                One Workflow Across Every Client
              </h3>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.55, margin: 0 }}>
                Keep one n8n workflow and route every run through the correct client balance. No separate provider projects, duplicated workflows, or client API keys.
              </p>
            </div>
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)" }}>
              Central broker routes dynamic headers to client-isolated Orbio credentials
            </div>
          </div>

          {/* Card 3: Control */}
          <div
            className="stagger-item stagger-3 benefit-card-interactive"
            style={{
              padding: 28,
              border: "1px solid var(--border)",
              borderRadius: 8,
              backgroundColor: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.75rem",
                  color: "var(--fuel)",
                  fontWeight: 600,
                  marginBottom: 12,
                }}
              >
                03 // CONTROL
              </div>
              <h3 style={{ fontSize: "1.1875rem", fontWeight: 550, letterSpacing: "-0.02em", margin: "0 0 12px", color: "var(--ink)" }}>
                Clients Control Their Own Spend
              </h3>
              <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.55, margin: 0 }}>
                Clients decide how much inference becomes available. When their balance runs out, only their workflow stops without affecting any other client.
              </p>
            </div>
            <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--ink-subtle)" }}>
              Non-custodial EIP-712 signing with cryptographic run receipts
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Section */}
      <section
        className="reveal-on-scroll"
        style={{
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
          padding: "36px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2
            className="stagger-item stagger-1"
            style={{
              fontSize: "clamp(1.5rem, 3vw, 2rem)",
              fontWeight: 500,
              letterSpacing: "-0.03em",
              margin: "0 0 12px",
              color: "var(--ink)",
            }}
          >
            Ready to stop paying your clients’ AI bills?
          </h2>
          <p
            className="stagger-item stagger-2"
            style={{
              color: "var(--ink-muted)",
              fontSize: "1rem",
              lineHeight: 1.55,
              maxWidth: 540,
              margin: "0 auto 20px",
            }}
          >
            Connect your n8n workflow, onboard a client, and let their own balance fund every inference run.
          </p>
          <div
            className="stagger-item stagger-3"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/agency"
              className="btn-primary-action"
              style={{
                backgroundColor: "var(--fuel)",
                color: "#ffffff",
                padding: "9px 18px",
                borderRadius: 5,
                fontSize: "0.875rem",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Open Agency Workspace
              <span className="btn-arrow-icon" aria-hidden="true">&rarr;</span>
            </Link>
            <Link
              href="/proof"
              className="btn-secondary-action"
              style={{
                backgroundColor: "transparent",
                color: "var(--ink)",
                border: "1px solid var(--border)",
                padding: "9px 18px",
                borderRadius: 5,
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              View Live Proof
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "28px 24px",
          backgroundColor: "var(--canvas)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            fontSize: "0.875rem",
            color: "var(--ink-muted)",
          }}
        >
          <div>
            <strong>FLOWFUEL</strong>: Client-Funded Inference Isolation for AI Automation Agencies.
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <Link href="/agency">Agency</Link>
            <Link href="/client/onboard">Onboard</Link>
            <Link href="/proof">Proof</Link>
            <Link href="/docs/n8n-broker">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
