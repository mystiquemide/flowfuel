import { createClientStore, createCredentialStore, createDb, databaseUrl } from "@flowfuel/db";

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
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.045em", color: "var(--fuel)" }}>
          FLOWFUEL
        </p>
        <h1 style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.03em" }}>
          Client not found
        </h1>
        <p style={{ color: "var(--ink-muted)" }}>
          This connect link does not match a registered client.
        </p>
      </main>
    );
  }
  const credential = await createCredentialStore(db).getForClient(clientId);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px 96px" }}>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", letterSpacing: "0.045em", color: "var(--fuel)", marginBottom: 16 }}>
        FLOWFUEL · CONNECT
      </p>
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
