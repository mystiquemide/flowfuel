"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

export default function AgencyLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/agency/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Invalid agency credentials");
        setLoading(false);
        return;
      }
      router.replace("/agency");
      router.refresh();
    } catch {
      setError("Invalid agency credentials");
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, backgroundColor: "var(--canvas)" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: "min(420px, 100%)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 32,
          background: "var(--surface)",
          boxShadow: "0 1px 3px rgba(32, 21, 21, 0.04)",
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <FlowFuelLogo size={28} showWordmark={false} />
        </div>
        <p style={{ fontFamily: "var(--font-mono)", color: "var(--fuel)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.05em", margin: "0 0 8px" }}>
          AGENCY ACCESS
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 650, letterSpacing: "-0.025em", margin: "0 0 8px", color: "var(--ink)", lineHeight: 1.2 }}>
          FlowFuel operator sign in
        </h1>
        <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 20px" }}>
          The customer ledger and billable run controls are private.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="agency-password"
            style={{ display: "block", fontSize: "0.8125rem", fontWeight: 550, color: "var(--ink)", marginBottom: 6 }}
          >
            Agency password
          </label>
          <input
            id="agency-password"
            aria-label="Agency password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter operator password"
            disabled={loading}
            className="form-input"
          />
        </div>

        {error && (
          <p
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              color: "var(--danger)",
              backgroundColor: "rgba(220, 38, 38, 0.08)",
              border: "1px solid rgba(220, 38, 38, 0.2)",
              borderRadius: 6,
              padding: "8px 12px",
              margin: "0 0 16px",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary"
          style={{ width: "100%", padding: "11px 16px" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
