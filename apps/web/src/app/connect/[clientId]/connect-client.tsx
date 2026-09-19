"use client";

import { useState } from "react";
import { createWalletClient, custom, getAddress } from "viem";
import {
  deriveOrbioCredential,
  orbioKeyMessage,
  ROBINHOOD_CHAIN_ID,
} from "@flowfuel/core";

interface ConnectFlowProps {
  clientId: string;
  walletAddress: string;
  status: string;
  hasCredential: boolean;
  epoch: number | null;
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

type Step =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "verified" }
  | { kind: "done"; status: string; balance: string | null }
  | { kind: "error"; message: string };

const mono = {
  fontFamily: "var(--font-mono)",
  fontSize: "0.8125rem",
} as const;

const card = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "20px 24px",
  marginBottom: 16,
} as const;

const button = {
  background: "var(--fuel)",
  color: "#0c0d0d",
  border: "none",
  borderRadius: 6,
  padding: "10px 20px",
  fontFamily: "var(--font-sans)",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
} as const;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.action ?? body.code ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export function ConnectFlow(props: ConnectFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [account, setAccount] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [epoch, setEpoch] = useState(props.epoch !== null ? props.epoch + 1 : 0);
  const purpose = props.hasCredential ? "rotate_credential" : "register_credential";

  function provider(): EthereumProvider | null {
    const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
    return eth ?? null;
  }

  async function connectWallet() {
    const eth = provider();
    if (!eth) {
      setStep({ kind: "error", message: "No wallet provider found. Install a browser wallet and reload." });
      return;
    }
    setStep({ kind: "working", label: "Connecting wallet" });
    try {
      const client = createWalletClient({ transport: custom(eth as never) });
      const [addr] = await client.requestAddresses();
      if (!addr) throw new Error("Wallet returned no address");
      setAccount(getAddress(addr));
      setStep({ kind: "idle" });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : "Wallet connection failed" });
    }
  }

  async function disconnectWallet() {
    const eth = provider();
    setAccount(null);
    setStep({ kind: "idle" });
    try {
      await eth?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallets without revokePermissions still get their local state cleared.
    }
  }

  async function verifyWallet() {
    if (!account) return;
    const eth = provider();
    if (!eth) return;
    setStep({ kind: "working", label: "Signing verification message" });
    try {
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: props.clientId, purpose: "connect" }),
      });
      if (!nonceRes.ok) throw new Error(await readError(nonceRes));
      const { nonce, message } = await nonceRes.json();
      const client = createWalletClient({ transport: custom(eth as never) });
      const signature = await client.signMessage({ account: account as `0x${string}`, message });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: props.clientId, nonce, walletAddress: account, signature }),
      });
      if (!verifyRes.ok) throw new Error(await readError(verifyRes));
      setStep({ kind: "verified" });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : "Verification failed" });
    }
  }

  async function registerCredential() {
    if (!account || !consent) return;
    const eth = provider();
    if (!eth) return;
    setStep({ kind: "working", label: "Signing Orbio credential message" });
    try {
      const client = createWalletClient({ transport: custom(eth as never) });
      const credentialSig = await client.signMessage({
        account: account as `0x${string}`,
        message: orbioKeyMessage(ROBINHOOD_CHAIN_ID, epoch),
      });
      const orbioCredential = deriveOrbioCredential(credentialSig, epoch);
      setStep({ kind: "working", label: "Signing registration message" });
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: props.clientId, purpose }),
      });
      if (!nonceRes.ok) throw new Error(await readError(nonceRes));
      const { nonce, message } = await nonceRes.json();
      const signature = await client.signMessage({ account: account as `0x${string}`, message });
      setStep({ kind: "working", label: "Registering credential" });
      const putRes = await fetch(`/api/clients/${props.clientId}/credential`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          epoch,
          orbioCredential,
          consent: true,
          nonce,
          signature,
        }),
      });
      if (!putRes.ok) throw new Error(await readError(putRes));
      const result = await putRes.json();
      setStep({ kind: "done", status: result.status, balance: result.balance });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : "Registration failed" });
    }
  }

  const walletMismatch = account !== null && getAddress(account) !== getAddress(props.walletAddress);

  return (
    <div>
      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 12px" }}>1 · Connect wallet</h2>
        <p style={{ ...mono, color: "var(--ink-muted)", margin: "0 0 12px" }}>
          Expected wallet {props.walletAddress}
        </p>
        {account ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p style={{ ...mono, color: walletMismatch ? "var(--danger)" : "var(--success)", margin: 0 }}>
              {walletMismatch ? `Connected ${account} does not match` : `Connected ${account}`}
            </p>
            <button style={{ ...button, padding: "4px 10px", fontSize: "0.75rem" }} onClick={disconnectWallet}>
              Disconnect
            </button>
          </div>
        ) : (
          <button style={button} onClick={connectWallet}>Connect wallet</button>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 12px" }}>2 · Prove wallet control</h2>
        {step.kind === "verified" || step.kind === "done" ? (
          <p style={{ ...mono, color: "var(--success)", margin: 0 }}>Wallet verified</p>
        ) : (
          <button style={{ ...button, opacity: account && !walletMismatch ? 1 : 0.4 }} disabled={!account || walletMismatch || step.kind === "working"} onClick={verifyWallet}>
            Sign verification message
          </button>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 12px" }}>
          3 · {props.hasCredential ? "Rotate Orbio credential" : "Register Orbio credential"}
        </h2>
        {step.kind === "done" ? (
          <>
            <p style={{ ...mono, color: step.status === "ready" ? "var(--success)" : "var(--warning)", margin: "0 0 12px" }}>
              {step.status === "ready"
                ? `Credential registered · activated balance $${step.balance}`
                : "Credential unfunded · activate CREDIT for this wallet, then register again"}
            </p>
            <a
              href={step.status === "ready" ? `/client/dashboard?client=${props.clientId}` : `/client/onboard?client=${props.clientId}`}
              style={{ ...mono, color: "var(--ink)", textDecoration: "underline" }}
            >
              {step.status === "ready" ? "Open client dashboard →" : "Activate CREDIT →"}
            </a>
          </>
        ) : (
          <>
            <p style={{ color: "var(--ink-muted)", fontSize: "0.875rem", lineHeight: 1.55, margin: "0 0 12px" }}>
              Your wallet signs the Orbio key message locally and the derived
              credential is encrypted by FlowFuel. It can spend only your activated
              balance. Activate CREDIT for this wallet before registering.
            </p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.875rem", color: "var(--ink)", marginBottom: 12 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span>I understand this credential can spend my activated Orbio balance and I consent to registering it with FlowFuel.</span>
            </label>
            {props.hasCredential && (
              <label style={{ ...mono, display: "block", color: "var(--ink-muted)", marginBottom: 12 }}>
                New epoch{" "}
                <input
                  type="number"
                  min={0}
                  value={epoch}
                  onChange={(e) => setEpoch(Number(e.target.value))}
                  style={{ width: 72, background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--ink)", padding: "4px 8px" }}
                />
              </label>
            )}
            <button
              style={{ ...button, opacity: consent && step.kind !== "working" && !walletMismatch ? 1 : 0.4 }}
              disabled={!consent || step.kind === "working" || Boolean(account && walletMismatch)}
              onClick={registerCredential}
            >
              {props.hasCredential ? "Rotate credential" : "Register credential"}
            </button>
          </>
        )}
      </section>

      {step.kind === "working" && (
        <p style={{ ...mono, color: "var(--ink-muted)" }}>{step.label}…</p>
      )}
      {step.kind === "error" && (
        <p style={{ ...mono, color: "var(--danger)" }}>{step.message}</p>
      )}
    </div>
  );
}
