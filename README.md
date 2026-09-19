<p align="center">
  <img src="apps/web/src/app/icon.svg" width="72" height="72" alt="FlowFuel mark" />
</p>

<h1 align="center">FlowFuel</h1>

<p align="center">
  <strong>One n8n workflow. Every client pays inference from its own isolated Orbio balance: the funded client runs, the unfunded client stops, and every run ends in a public balance receipt.</strong>
</p>

<p align="center">
  <a href="https://flowfuel.midelabs.xyz"><strong>Live demo</strong></a> ·
  <a href="https://flowfuel.midelabs.xyz/proof">Proof page</a> ·
  Built on <a href="https://www.orbio.so">Orbio</a> + Robinhood Chain 4663, wired into n8n
</p>

<p align="center">
  <a href="https://github.com/mystiquemide/flowfuel/actions/workflows/ci.yml"><img src="https://github.com/mystiquemide/flowfuel/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.orbio.so"><img src="https://img.shields.io/badge/orbio-gateway-FF4F00" alt="Orbio" /></a>
  <a href="https://n8n.io"><img src="https://img.shields.io/badge/n8n-one_workflow-EA4B71" alt="n8n" /></a>
  <a href="https://robin.etherscan.io"><img src="https://img.shields.io/badge/robinhood_chain-4663-201515" alt="Robinhood Chain 4663" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

AI automation agencies today either front every client's model spend and argue about invoices later, or hand everyone one shared provider key and let usage blend into an untraceable bill. FlowFuel is the third option: the agency operates the automation, each client owns the fuel.

## 30-second proof

![Live isolation proof: funded Client A succeeds, unfunded Client B is blocked at the gateway](docs/proof.png)

- Same n8n workflow, same task hash `d9f8e86a…df1878`, two wallet identities.
- Client A (funded): run succeeded, real Orbio generation ID `gen-1789764124-zDWN726GvyqIjnwlEzKL`, exactly `$0.000108` drawn from A's balance. [Receipt](https://flowfuel.midelabs.xyz/api/runs/4b1a2430-eaac-4dc8-9e23-870e55e0b6f4/receipt)
- Client B (unfunded): `HTTP 401`, no generation ID, no charge, no fallback to any other balance. [Receipt](https://flowfuel.midelabs.xyz/api/runs/99181d0b-80c6-46f8-a1a0-4657a0d42846/receipt)
- A task priced above the balance: `HTTP 402`, nothing charged. [Receipt](https://flowfuel.midelabs.xyz/api/runs/b2996733-816d-4748-a7fd-20759c940e7a/receipt)
- Client C self-funded with USDG through the Orbio exchange's `buyAndActivate`, wallet as beneficiary. [Tx](https://robin.etherscan.io/tx/0x9e47efc19a22fb21d8e1bcc8ee1ad3759b2a88932bc269c9a4c7f94c3a50f8f9)
- Every number above resolves from the live gateway or the public explorer, not from this README.

## Try it

1. Open [/agency](https://flowfuel.midelabs.xyz/agency). Client A shows an activated balance, Client B shows none.
2. Hit **Test Run** on Client A. It succeeds and draws real inference spend.
3. Hit **Test Run** on Client B. Same workflow, rejected before inference.
4. Open [/proof](https://flowfuel.midelabs.xyz/proof) and click any run: task hash, generation ID, upstream status, cost, balance delta, explorer links.

## How it works

1. A client activates CREDIT on Robinhood Chain (or buys and activates in one `buyAndActivate` call with USDG). **Activation is one-way:** activated CREDIT becomes spendable inference balance; there is no deactivate path.
2. The client signs Orbio's authentication message locally. The signature derives the spend credential. The wallet private key never leaves the wallet and never reaches FlowFuel.
3. FlowFuel stores only the derived credential, encrypted at rest. n8n never sees it.
4. A run arrives as `clientId` plus a task. The broker resolves that client's credential, the Orbio gateway enforces that client's balance, and the run returns a public-safe receipt.
5. If the client has no activated balance, the gateway rejects the call. No agency balance exists to fall back to.

```mermaid
flowchart LR
  W[Client wallet] -->|signs Orbio message locally| C[Derived credential]
  C -->|AES-256-GCM at rest| B[FlowFuel broker]
  N[n8n workflow] -->|clientId + task| B
  B -->|that client's credential only| O[Orbio gateway]
  O -->|balance enforced| M[Model]
  B --> R[Public receipt]
```

| Operation | What happens |
|---|---|
| Agency registers client | Record only. No credential, no money moves. |
| Client connects wallet | Verification signature, then credential signature. Two signatures, zero transactions. |
| Client activates CREDIT | Onchain activation, wallet's Orbio balance grows, tx hash recorded. Irreversible. |
| Client funds with USDG | Approve then `buyAndActivate` on the exchange, wallet recorded as beneficiary. |
| Workflow runs a task | Draws the named client's balance. Returns cost, generation ID, balance delta. |
| Client pauses | Signed intent. Next run is refused before inference. |
| Client revokes | Credential destroyed. Re-onboarding uses a new epoch. |

## Verified evidence

| Artifact | Value | Link |
|---|---|---|
| Funded run receipt | `succeeded`, HTTP 200, $0.009088 - $0.000108 = $0.008980, reconciled | [receipt](https://flowfuel.midelabs.xyz/api/runs/4b1a2430-eaac-4dc8-9e23-870e55e0b6f4/receipt) |
| Unfunded run receipt | `client_unfunded`, HTTP 401, zero cost, zero fallback | [receipt](https://flowfuel.midelabs.xyz/api/runs/99181d0b-80c6-46f8-a1a0-4657a0d42846/receipt) |
| Over-quota run receipt | `402 insufficient_quota`, balance unchanged | [receipt](https://flowfuel.midelabs.xyz/api/runs/b2996733-816d-4748-a7fd-20759c940e7a/receipt) |
| Client A activation | `activate()` tx, beneficiary = A's wallet | [explorer](https://robin.etherscan.io/tx/0x229f5abb3baae5a1a104c4c6f294fdde05172885493fadf85f1aebfb7a4b40ed) |
| Client C direct activation | `activate()` tx, activation ID 239 | [explorer](https://robin.etherscan.io/tx/0x3654d2b614f4f62977ecf7059f99be021d6c1c27076325d077b4101fc1889889) |
| Client C exchange funding | `buyAndActivate` txs, activations 240 and 241, beneficiary = C's wallet | [tx 1](https://robin.etherscan.io/tx/0xfb47884fe7af03cff094935e4030603235e04f3d4354c40ae7fe6fa6ebf1f30b), [tx 2](https://robin.etherscan.io/tx/0x9e47efc19a22fb21d8e1bcc8ee1ad3759b2a88932bc269c9a4c7f94c3a50f8f9) |
| Client C credited balance | 0.008 direct + 0.122887 + 0.131362 exchange = $0.261849 activated, live in the gateway | [/agency](https://flowfuel.midelabs.xyz/agency) |
| Contracts | CREDIT, Exchange, USDG on Robinhood Chain | [CREDIT](https://robin.etherscan.io/address/0xe33322da1380e61e5ae5dfb21e7f62924c73004c) · [Exchange](https://robin.etherscan.io/address/0x6951ffd32630b05e06f50062aea801625a58ebc0) · [USDG](https://robin.etherscan.io/address/0x5fc5360d0400a0fd4f2af552add042d716f1d168) |
| Attack coverage | Replay, spoofed client ID, wrong beneficiary, foreign emitter, reverted receipt, wrong sender, double-charge | `apps/web/test/chain.test.ts`, `apps/web/test/registration.test.ts`, `packages/db/test/stores.test.ts` |
| Tests | 198 passing across core, db, broker, web | `pnpm -r test` |

## How this differs

| Alternative | What it does | Why FlowFuel is different |
|---|---|---|
| Shared agency API key | One provider account, blended usage, invoice arguments | Balance and enforcement live per client onchain, not in a spreadsheet |
| Per-client provider accounts | Clean separation, but N signups, N dashboards, N keys | One workflow, one broker, clients onboard with two signatures |
| Agency fronting spend | Simple, but the agency eats the bill and the disputes | Clients hold custody; the agency can never overspend a client |
| "Connect wallet to pay" demos | Wallet gates access, payment is a side quest | The wallet is the billing authority: activation, quota, and evidence all resolve onchain |

## Security boundary

- Wallet private keys never enter FlowFuel.
- The wallet-derived Orbio credential is encrypted at rest (AES-256-GCM) and can spend only the client's activated balance.
- Credentials never enter n8n workflow data, logs, URLs, or public receipts.
- Every run request is authenticated and tenant-bound by `clientId`; there is no fallback credential path.
- Public receipts expose an explicit safe-field allowlist only: no prompts, no completions, no credentials.
- Duplicate executions are idempotent; concurrent requests serialize against the allowance.
- Activation verification is onchain: correct chain, correct contract, real event, beneficiary must equal the client's wallet.
- Threat model and trust assumptions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Honest limitations

- Unaudited. Do not point it at balances you cannot lose.
- The demo instance is a single self-hosted VM on a Cloudflare-proxied domain, not a hardened multi-zone deployment.
- All workflows share one bearer token today; per-workflow credentials are not built.
- Exchange-path activations index slower than direct `activate()`: observed roughly a 45-minute lag before the balance credited. They do land, just not instantly.
- Revoke is unit-tested; the destructive revoke path has not been exercised end-to-end on a live client.
- The broker is a trusted party: it holds encrypted credentials and the encryption key is a deployment secret. Self-hosting keeps that trust with the agency.
- Clients need a Robinhood Chain wallet with gas plus CREDIT or USDG. No fiat path, no simulated funding.

## Run locally

Requirements: Node 24, pnpm, Docker.

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env.local   # fill in DATABASE_URL, keys, tokens
pnpm -F @flowfuel/db db:migrate
pnpm dev                     # web app on :3000, broker on :4010
```

Start n8n with `docker compose up -d n8n`, then import `n8n/workflows/client-funded-agent.json`. Set `FLOWFUEL_BROKER_URL` and `FLOWFUEL_WORKFLOW_TOKEN` in the n8n container environment.

## Architecture

FlowFuel places an encrypted credential broker between n8n and Orbio. n8n sends a client ID and a task; the broker resolves that client's credential, reads that client's activated balance, executes, reconciles, and returns a secret-free receipt. Detail lives in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN.md](docs/DESIGN.md). Layout: `apps/web` (Next.js app), `apps/broker` (run broker), `packages/core` (schemas, encryption, receipts, contract ABIs), `packages/db` (stores), `n8n/workflows` (importable reference workflow).

## License

MIT. See [LICENSE](LICENSE).
