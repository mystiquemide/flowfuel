"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AgencyLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const response = await fetch("/api/agency/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          if (!response.ok) return setError("Invalid agency credentials");
          router.replace("/agency");
          router.refresh();
        }}
        style={{ width: "min(420px, 100%)", border: "1px solid var(--border)", borderRadius: 16, padding: 32, background: "var(--surface)" }}
      >
        <p style={{ fontFamily: "var(--font-mono)", color: "var(--fuel)", fontSize: 12 }}>AGENCY ACCESS</p>
        <h1>FlowFuel operator sign in</h1>
        <p style={{ color: "var(--ink-muted)" }}>The customer ledger and billable run controls are private.</p>
        <input aria-label="Agency password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" style={{ width: "100%", padding: 12, margin: "16px 0", border: "1px solid var(--border)", borderRadius: 8 }} />
        {error && <p role="alert" style={{ color: "var(--danger)" }}>{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>Sign in</button>
      </form>
    </main>
  );
}
