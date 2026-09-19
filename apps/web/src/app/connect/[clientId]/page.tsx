import { createClientStore, createCredentialStore, createDb, databaseUrl } from "@flowfuel/db";

import { FlowFuelLogo } from "@/components/flowfuel-logo";
import { ConnectFlow } from "./connect-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConnectPageProps {
  params: Promise<{ clientId: string }>;
}

export default async function ConnectPage({ params }: ConnectPageProps) {
  const { clientId } = await params;
  const { db } = createDb(databaseUrl());
  const client = await createClientStore(db).getById(clientId);
  if (!client) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "96px 24px" }}>
        <div style={{ marginBottom: 16 }}>
          <FlowFuelLogo size={28} />
        </div>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
          Client not found
        </h1>
        <p style={{ color: "var(--ink-muted)" }}>
          This connect link doesn&rsquo;t match a registered client. Ask the agency for a fresh one.
        </p>
      </main>
    );
  }
  const credential = await createCredentialStore(db).getForClient(clientId);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <FlowFuelLogo size={28} />
        <span
          style={{
            fontSize: "0.75rem",
            fontFamily: "var(--font-mono)",
            color: "var(--fuel)",
            backgroundColor: "var(--surface)",
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid var(--border)",
            fontWeight: 600,
          }}
        >
          CONNECT
        </span>
      </div>
      <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 600, letterSpacing: "-0.04em", margin: "0 0 8px" }}>
        {client.displayName}
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 32px", fontSize: "0.95rem" }}>
        Prove wallet control, then register your Orbio credential. Your wallet
        private key never leaves your wallet.
      </p>
      <ConnectFlow
        clientId={client.id}
        walletAddress={client.walletAddress}
        status={client.status}
        hasCredential={credential !== null}
        epoch={credential?.epoch ?? null}
      />
    </main>
  );
}
