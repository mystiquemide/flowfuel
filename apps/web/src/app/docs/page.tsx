import Link from "next/link";
import { FlowFuelLogo } from "@/components/flowfuel-logo";

const card = {
  padding: 24,
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
} as const;

const eyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "var(--fuel)",
  fontWeight: 600,
} as const;

const lead = {
  color: "var(--ink-muted)",
  fontSize: "0.9375rem",
  lineHeight: 1.6,
  margin: 0,
} as const;

const mono = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.8125rem",
} as const;

const pre = {
  backgroundColor: "var(--canvas)",
  border: "1px solid var(--border)",
  padding: 16,
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: "0.8125rem",
  overflowX: "auto",
  margin: 0,
  color: "var(--ink)",
  lineHeight: 1.55,
} as const;

const th = {
  textAlign: "left" as const,
  fontFamily: "var(--font-mono)",
  fontSize: "0.6875rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--ink-muted)",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border)",
};

const td = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--border)",
  fontSize: "0.875rem",
  verticalAlign: "top" as const,
};

export default function DocsPage() {
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
                color: "var(--ink)",
                backgroundColor: "var(--surface)",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
              }}
            >
              Documentation
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
        <div style={{ marginBottom: 40 }}>
          <span style={eyebrow}>DOCUMENTATION</span>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.03em", margin: "8px 0 12px" }}>
            FlowFuel Docs
          </h1>
          <p style={{ ...lead, maxWidth: 680 }}>
            One n8n workflow, many clients, zero shared balance. Every run draws from the named
            client&apos;s own activated Orbio balance, enforced by the gateway. Everything below is
            live on this deployment and verifiable from public receipts.
          </p>
        </div>

        {/* Choose your path */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 48 }}>
          <div style={card}>
            <span style={eyebrow}>EVALUATE</span>
            <h3 style={{ margin: "8px 0 10px", fontSize: "1.125rem" }}>Judge the proof</h3>
            <p style={{ ...lead, marginBottom: 16 }}>
              Run the same task on a funded and an unfunded client through one workflow, then inspect
              the receipts. Three clicks, no wallet needed.
            </p>
            <Link href="/agency" style={{ ...mono, color: "var(--fuel)" }}>
              Open /agency &rarr;
            </Link>
          </div>
          <div style={card}>
            <span style={eyebrow}>AGENCY</span>
            <h3 style={{ margin: "8px 0 10px", fontSize: "1.125rem" }}>Run client-funded workflows</h3>
            <p style={{ ...lead, marginBottom: 16 }}>
              Register a client, send them the connect link, then call <code>POST /api/runs</code> from
              any n8n workflow with the shared workflow token.
            </p>
            <Link href="/docs/n8n-broker" style={{ ...mono, color: "var(--fuel)" }}>
              n8n integration guide &rarr;
            </Link>
          </div>
          <div style={card}>
            <span style={eyebrow}>CLIENT</span>
            <h3 style={{ margin: "8px 0 10px", fontSize: "1.125rem" }}>Fund your own balance</h3>
            <p style={{ ...lead, marginBottom: 16 }}>
              Connect your wallet, sign the Orbio credential locally, activate CREDIT or fund with
              USDG. Your keys never leave your wallet.
            </p>
            <Link href="/client/onboard" style={{ ...mono, color: "var(--fuel)" }}>
              Open onboarding &rarr;
            </Link>
          </div>
        </div>

        {/* Core model */}
        <h2 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
          Core model
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 48 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Isolated balance</h3>
            <p style={lead}>
              Every client activates CREDIT on Robinhood Chain into their own Orbio balance. A run can
              only draw down the balance of the client it names. There is no agency balance and no
              fallback path.
            </p>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Wallet-signed credential</h3>
            <p style={lead}>
              The client signs Orbio&apos;s authentication message in their wallet. The derived
              credential can spend only activated inference balance. FlowFuel stores it encrypted
              (AES-256-GCM); n8n never receives it.
            </p>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Onchain activation</h3>
            <p style={lead}>
              Activation is a real transaction: <code>activate()</code> on CREDIT, or{" "}
              <code>buyAndActivate()</code> on the Orbio exchange for USDG funding. It is verified
              onchain (event beneficiary must equal the client wallet) and is one-way.
            </p>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Public receipts</h3>
            <p style={lead}>
              Every run produces a receipt with balance before, cost, balance after, generation ID,
              and upstream status. Public fields pass through an explicit allowlist: no prompts, no
              completions, no credentials.
            </p>
          </div>
        </div>

        {/* API reference */}
        <h2 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
          API reference
        </h2>
        <div style={{ ...card, padding: 0, marginBottom: 32, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Endpoint</th>
                <th style={th}>Auth</th>
                <th style={th}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, ...mono }}>POST /api/runs</td>
                <td style={{ ...td, ...mono }}>Bearer workflow token</td>
                <td style={td}>Execute a client task. 200 with receipt on success, 422 with a failure status on rejection.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>GET /api/runs/[runId]</td>
                <td style={{ ...td, ...mono }}>Bearer workflow token</td>
                <td style={td}>Run status and recorded metadata.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>GET /api/runs/[runId]/receipt</td>
                <td style={{ ...td, ...mono }}>public</td>
                <td style={td}>Verification receipt: task hash, generation ID, cost, balances, upstream status, activation tx link.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>POST /api/clients</td>
                <td style={{ ...td, ...mono }}>Bearer workflow token</td>
                <td style={td}>Register a client (displayName, walletAddress, optional slug). Returns the /connect link for the client.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>GET /api/clients/[clientId]</td>
                <td style={{ ...td, ...mono }}>public</td>
                <td style={td}>Client detail with live gateway balances. Accepts UUID or slug.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>PATCH /api/clients/[clientId]</td>
                <td style={{ ...td, ...mono }}>wallet signature</td>
                <td style={td}>Pause or resume a client: status, nonce, signature.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>PUT /api/clients/[clientId]/credential</td>
                <td style={{ ...td, ...mono }}>wallet signature</td>
                <td style={td}>Register the wallet-derived Orbio credential (nonce, signature, epoch, consent).</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>DELETE /api/clients/[clientId]/credential</td>
                <td style={{ ...td, ...mono }}>wallet signature</td>
                <td style={td}>Revoke the credential. Re-onboarding uses a new epoch.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>POST /api/clients/[clientId]/activation</td>
                <td style={{ ...td, ...mono }}>onchain-verified</td>
                <td style={td}>Record an activation: transactionHash is verified onchain before acceptance.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>POST /api/auth/nonce · /api/auth/verify</td>
                <td style={{ ...td, ...mono }}>public</td>
                <td style={td}>Issue a single-use nonce and verify a wallet signature for that nonce.</td>
              </tr>
              <tr>
                <td style={{ ...td, ...mono }}>GET /healthz</td>
                <td style={{ ...td, ...mono }}>public</td>
                <td style={td}>Broker liveness on port 4010.</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Run request detail */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 48 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>POST /api/runs request</h3>
            <pre style={pre}>
{`{
  "clientId": "<uuid>",
  "workflowRunId": "<n8n execution id>",
  "task": {
    "type": "lead_summary",
    "input": "<up to 8000 chars>"
  },
  "model": "google/gemini-2.5-flash",
  "maxOutputTokens": 256
}`}
            </pre>
            <p style={{ ...lead, marginTop: 12 }}>
              <code>workflowRunId</code> is the idempotency key: retrying the same execution returns the
              original run instead of charging twice.
            </p>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Response shapes</h3>
            <pre style={pre}>
{`// 200 succeeded
{
  "runId": "<uuid>",
  "status": "succeeded",
  "result": "<model output>",
  "receipt": {
    "clientWallet": "0x...",
    "generationId": "gen-...",
    "model": "...",
    "taskHash": "0x...",
    "costUsd": "0.000108",
    "balanceBefore": "0.009088",
    "balanceAfter": "0.008980"
  }
}

// 422 rejected
{
  "runId": "<uuid>",
  "status": "client_unfunded",
  "taskHash": "0x...",
  "error": {
    "code": "CLIENT_UNFUNDED",
    "upstreamStatus": 401,
    "action": "Activate CREDIT for this client wallet."
  }
}`}
            </pre>
          </div>
        </div>

        {/* Statuses and errors */}
        <h2 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
          Statuses and errors
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 48 }}>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Run status</th>
                  <th style={th}>Meaning</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ ...td, ...mono }}>succeeded</td><td style={td}>Gateway returned a generation; balance reconciled.</td></tr>
                <tr><td style={{ ...td, ...mono }}>client_unfunded</td><td style={td}>No activated balance. Upstream 401. No charge.</td></tr>
                <tr><td style={{ ...td, ...mono }}>quota_exceeded</td><td style={td}>Request exceeds the activated balance. Upstream 402. No charge.</td></tr>
                <tr><td style={{ ...td, ...mono }}>provider_failed</td><td style={td}>Gateway errored. Not treated as success.</td></tr>
                <tr><td style={{ ...td, ...mono }}>validation_failed</td><td style={td}>Request failed schema validation before any call.</td></tr>
                <tr><td style={{ ...td, ...mono }}>reconciliation_failed</td><td style={td}>Charge happened but reconciliation did not confirm.</td></tr>
                <tr><td style={{ ...td, ...mono }}>running</td><td style={td}>In flight.</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Error code</th>
                  <th style={th}>Client action</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ ...td, ...mono }}>UNAUTHORIZED</td><td style={td}>Authenticate the request and try again.</td></tr>
                <tr><td style={{ ...td, ...mono }}>CLIENT_UNFUNDED</td><td style={td}>Activate CREDIT for this client wallet.</td></tr>
                <tr><td style={{ ...td, ...mono }}>CLIENT_PAUSED</td><td style={td}>Resume the client before running tasks.</td></tr>
                <tr><td style={{ ...td, ...mono }}>CREDENTIAL_REVOKED</td><td style={td}>Re-sign the Orbio key message at a new epoch.</td></tr>
                <tr><td style={{ ...td, ...mono }}>QUOTA_EXCEEDED</td><td style={td}>Reduce the request size or top up the balance.</td></tr>
                <tr><td style={{ ...td, ...mono }}>PROVIDER_FAILED</td><td style={td}>Retry later.</td></tr>
                <tr><td style={{ ...td, ...mono }}>VALIDATION_FAILED</td><td style={td}>Fix the request fields and try again.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Environment */}
        <h2 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
          Environment
        </h2>
        <div style={{ ...card, marginBottom: 48 }}>
          <p style={{ ...lead, marginBottom: 16 }}>
            Copy <code>.env.example</code> to <code>.env.local</code>. Required values:
          </p>
          <div style={{ ...pre, padding: "12px 16px" }}>
            DATABASE_URL · CREDENTIAL_ENCRYPTION_KEY (64 hex chars) · FLOWFUEL_WORKFLOW_TOKEN ·
            AGENCY_SESSION_SECRET · N8N_WORKFLOW_TOKEN · FLOWFUEL_BROKER_URL (default
            http://host.docker.internal:4010)
          </div>
          <p style={{ ...lead, marginTop: 16 }}>
            Robinhood Chain and Orbio values ship with mainnet defaults: chain 4663, gateway{" "}
            <code>https://www.orbio.so/api/v1</code>, CREDIT{" "}
            <code>0xe33322da…73004c</code>. Importable workflow:{" "}
            <code>n8n/workflows/client-funded-agent.json</code>.
          </p>
        </div>

        {/* Further reading */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>n8n integration</h3>
            <p style={{ ...lead, marginBottom: 12 }}>
              Reference workflow JSON, request snippet, idempotency and the no-fallback contract.
            </p>
            <Link href="/docs/n8n-broker" style={{ ...mono, color: "var(--fuel)" }}>
              Open the guide &rarr;
            </Link>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Live proof</h3>
            <p style={{ ...lead, marginBottom: 12 }}>
              Funded vs unfunded runs side by side with public receipt endpoints and explorer links.
            </p>
            <Link href="/proof" style={{ ...mono, color: "var(--fuel)" }}>
              Open /proof &rarr;
            </Link>
          </div>
          <div style={card}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Architecture</h3>
            <p style={{ ...lead, marginBottom: 12 }}>
              Threat model, credential lifecycle, and reconciliation design in the repository.
            </p>
            <a
              href="https://github.com/mystiquemide/flowfuel/blob/main/docs/ARCHITECTURE.md"
              style={{ ...mono, color: "var(--fuel)" }}
            >
              docs/ARCHITECTURE.md &rarr;
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
