"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function N8nBrokerDocsPage() {
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const sampleWorkflow = {
    name: "FlowFuel Two-Client Invariant Workflow",
    nodes: [
      {
        parameters: {
          path: "flowfuel-task",
          responseMode: "lastNode",
        },
        name: "Webhook Trigger",
        type: "n8n-nodes-base.webhook",
        position: [240, 300],
      },
      {
        parameters: {
          url: "https://broker.flowfuel.io/v1/chat/completions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FlowFuel-Client": "={{ $json.clientId }}",
          },
          bodyParameters: {
            model: "orbio/deepseek-v3",
            prompt: "={{ $json.prompt }}",
          },
        },
        name: "FlowFuel Client-Isolated Broker",
        type: "n8n-nodes-base.httpRequest",
        position: [480, 300],
      },
    ],
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(sampleWorkflow, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowfuel-n8n-reference-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(`POST https://broker.flowfuel.io/v1/chat/completions
Headers:
  Content-Type: application/json
  X-FlowFuel-Client: {{ $json.clientId }}

Body:
{
  "model": "orbio/deepseek-v3",
  "messages": [{"role": "user", "content": "{{ $json.prompt }}"}],
  "idempotencyKey": "n8n-{{ $execution.id }}"
}`);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
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
              Developer Docs
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
            <Link href="/proof" style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
              Live Proof
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Banner with Code Image */}
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
              DEVELOPER INTEGRATION GUIDE
            </span>
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "8px 0 12px",
              }}
            >
              Connecting n8n Workflows to FlowFuel
            </h1>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 20px" }}>
              Standard n8n nodes cannot dynamically pick arbitrary credentials per execution item.
              FlowFuel acts as an authenticated server-side broker that decrypts client credentials and
              routes calls to the live Orbio gateway.
            </p>
            <button
              onClick={handleDownload}
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
              {downloaded ? "Workflow Template Downloaded!" : "Download n8n Template JSON"}
            </button>
          </div>

          <div style={{ position: "relative", minHeight: 220 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80"
              alt="n8n code integration"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </div>

        {/* Integration Architecture Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32, marginBottom: 48 }}>
          <div
            style={{
              padding: 24,
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: "1.25rem" }}>
              1. Add the HTTP Request Node in n8n
            </h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: "0 0 16px" }}>
              In your n8n workflow canvas, replace direct model API calls with an HTTP Request node
              pointing to FlowFuel. Pass the client public identifier in the <code>X-FlowFuel-Client</code> header.
            </p>
            <button
              onClick={handleCopySnippet}
              style={{
                backgroundColor: "var(--canvas)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
                padding: "6px 14px",
                borderRadius: 4,
                fontSize: "0.8125rem",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              {copiedCode ? "Copied Snippet!" : "Copy HTTP Request Snippet"}
            </button>
            <pre
              style={{
                backgroundColor: "var(--canvas)",
                border: "1px solid var(--border)",
                padding: 16,
                borderRadius: 6,
                fontFamily: "var(--font-mono)",
                fontSize: "0.8125rem",
                overflowX: "auto",
                margin: 0,
                color: "var(--ink)",
              }}
            >
{`POST https://broker.flowfuel.io/v1/chat/completions
Headers:
  Content-Type: application/json
  X-FlowFuel-Client: {{ $json.clientId }}

Body:
{
  "model": "orbio/deepseek-v3",
  "messages": [
    { "role": "user", "content": "{{ $json.prompt }}" }
  ],
  "idempotencyKey": "n8n-{{ $execution.id }}"
}`}
            </pre>
          </div>

          <div
            style={{
              padding: 24,
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: "1.25rem" }}>
              2. Concurrency Locks and Idempotency
            </h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: 0 }}>
              FlowFuel acquires an in-memory client lock during inference to prevent parallel branches from
              exceeding activated balance limits. The <code>idempotencyKey</code> ensures that retried n8n runs
              return the cached transaction receipt rather than billing the client wallet twice.
            </p>
          </div>

          <div
            style={{
              padding: 24,
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          >
            <h3 style={{ margin: "0 0 10px", fontSize: "1.25rem" }}>
              3. The Strict No-Fallback Invariant
            </h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.9375rem", lineHeight: 1.5, margin: 0 }}>
              If a client allowance is exhausted or unactivated, FlowFuel stops execution immediately with
              HTTP 401/402. The broker will never fall back to an agency master key or another client balance.
              Your agency balance is safe at all times.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
