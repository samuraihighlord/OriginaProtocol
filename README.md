# Origina Protocol

Origina Protocol is open-source infrastructure that permanently anchors a cryptographic fingerprint of AI-generated media at the moment of creation, so any platform can verify a file's origin and authenticity — without ever storing, uploading, or transmitting the media file itself.

This repo has two parts:

- **`anchor/`** — the Solana program (Anchor/Rust): a registry of approved providers and one provenance record per file. Maintained by the program's author; not edited from the app side.
- **`app/`** — the Origina web app (Next.js). It computes fingerprints in the browser and talks to the program through a typed client generated from the program's IDL.

## How it works

1. **Origina is the registered provider.** The registry authority approves Origina's provider wallet once, and Origina claims that registration. Every record is created under it, so the program's "approved providers only" rule is met without asking each user to be one.
2. **A user anchors an image.** The app analyses the image in the browser (SHA-256 for exact matching, a 64-bit perceptual hash for near matching, and the hash of an embedded C2PA manifest if there is one) and sends only those fingerprints, the model name and the user's wallet address (if one is connected) to Origina's API. The API builds one transaction. Origina is the registered **provider** and signs it; the user's wallet is the co-signing **creator** and **pays**: it is the transaction's fee payer, and the transaction also carries a transfer from the wallet to Origina for exactly the record's rent (the program charges the provider, so Origina fronts the deposit inside the program and is made whole in the same transaction; its balance doesn't change). The user's wallet signs first, then Origina's server adds its signature and sends it. The wallet needs about 0.0031 devnet SOL (the ~0.0022 SOL deposit, a 0.00001 SOL fee, and the minimum a wallet account must keep). With no wallet connected the server signs alone, Origina pays, and the record has no creator.
3. **Anyone can verify** an image: the app fingerprints it and looks it up on-chain — exact SHA-256 match first, then the closest perceptual hash within Hamming distance 12 — and reads the model back from the record's transaction. No wallet is needed to verify.

The image never leaves the browser; only its fingerprint goes on-chain.

### The provenance record

The browser builds one record per upload and keeps it, keyed by the file's SHA-256, in an in-memory Map (`lib/recordStore.ts`). Where each field ends up on-chain:

| Field | Extracted as | On-chain |
| --- | --- | --- |
| `provider` | the string `"origina"` | account `provider` = Origina's wallet; the string is in the transaction memo |
| `file_hash` | SHA-256 of the raw bytes (WebCrypto) | account `file_sha256`, and a seed of the record's address |
| `perceptual_hash` | 64-bit dHash over 64 byte-chunks | account `perceptual` (packed big-endian into the first 8 of 32 bytes, algorithm `PHash`; omitted when all zero) |
| `c2pa_manifest_hash` | SHA-256 of the JUMBF (`jumb`) box found in the first 64 KiB, else `null` | account `c2pa_manifest_hash`; the program requires a non-zero value, so `null` is stored as the fixed sentinel SHA-256 of `origina:no-c2pa-manifest:v1` |
| `creator` | connected wallet, else `null` | account `creator_wallet`; the wallet co-signs and pays |
| `slot` | `getSlot()` just before submitting | the memo; the account's own `slot` is set by the program and can trail it by a few slots |
| `generated_at` | `Math.floor(Date.now() / 1000)` | account `generated_at` |
| `bump` | canonical bump of the record PDA | account `bump` (set by the program); the memo carries the server's derivation of it |

The record PDA is derived from `["media", provider, file_hash]` — the seeds the deployed program uses.

The AI model has no field in the program, so it is written as a standard Solana Memo in the same transaction: `origina:v2 {"provider":"origina","model":"…","slot":…,"bump":…}`. Memos are untrusted on-chain data; the app validates what it reads.

The rent for a record is about 0.0022 SOL (189 bytes), paid by the creator's wallet (or by Origina when there is no wallet).

### Why the server can't be tricked into signing something else

`POST /api/anchor/submit` receives the transaction after the user's wallet has signed it. Origina signs only if it contains exactly the instructions the server would build itself from the claimed fields (including the rent reimbursement for the full amount), with the same accounts in the same roles, the same fee payer and the same signers, and only if the creator's signature is valid. A modified, unsigned or unrelated transaction (for example one that tries to move Origina's SOL) never receives Origina's signature. The one allowance is for wallets that append their own guard (Lighthouse) or compute-budget instructions: those may not touch Origina's wallet, add signers, or set a priority fee above 0.1 lamport per compute unit. The provider key lives only in a server-side environment variable.

## Repo structure

```
origina-protocol/
├── anchor/                     # Solana program (Rust/Anchor) — owned by the program's author
├── app/
│   ├── idl/                    # program IDL (generated by the program's build) — read-only here
│   ├── pages/                  # index.tsx page shell, _app, _document
│   │   └── api/anchor/         # prepare.ts, submit.ts: the server side of anchoring
│   ├── components/             # NavBar (bottom bar), HomeView, AnchorView, SocialView, ProvenanceDrawer, WalletPanels, ...
│   ├── lib/
│   │   ├── originaClient.ts    # the app-facing API: anchor(), verify()
│   │   ├── anchorApi.ts        # request/response types shared by the API routes and the browser
│   │   ├── models.ts           # model list, validation, memo format
│   │   ├── server/             # server-only: provider key, transaction builder, prepare/submit logic, rate limit
│   │   ├── chain/
│   │   │   ├── chain.ts        # provider status, claim_provider, on-chain lookups, reading a record's model
│   │   │   ├── cosign.ts       # browser side of anchoring: prepare -> wallet signs -> submit
│   │   │   ├── client.ts       # wallet-backed Kit client + read-only RPC
│   │   │   ├── useChain.ts     # React hook: wallet connection, OriginaClient
│   │   │   ├── fingerprint.ts  # hash packing / the C2PA sentinel
│   │   │   ├── errors.ts       # wallet / RPC / program errors -> readable messages
│   │   │   └── config.ts       # cluster, RPC URL, explorer links
│   │   ├── generated/origina/  # typed client generated from app/idl by Codama (checked in)
│   │   ├── hash.ts, imageMeta.ts, feed.ts, format.ts, storage.ts
│   ├── scripts/
│   │   ├── generate-client.mjs # regenerate lib/generated from app/idl
│   │   ├── chain-integration.ts# end-to-end test against a local validator
│   │   └── local-setup.ts      # init a local registry + approve/claim Origina's provider wallet, for manual UI testing
│   └── styles/globals.css
├── package.json, pnpm-workspace.yaml
```

## Quick start

Prerequisites: [Node.js](https://nodejs.org/) ≥ 18 and [pnpm](https://pnpm.io/installation) ≥ 9.

```bash
pnpm install
cp app/.env.example app/.env.local   # optional: RPC endpoint / cluster
pnpm dev:app                         # http://localhost:3000
pnpm build                           # production build
```

The app targets **Solana devnet** by default. The public devnet RPC (`api.devnet.solana.com`) is rate-limited and sometimes unavailable; set `NEXT_PUBLIC_SOLANA_RPC_URL` to a dedicated endpoint for anything beyond light use. See `app/.env.example`.

## Setting up Origina's provider wallet (devnet)

Anchoring needs Origina's provider wallet to be registered, funded and configured. Once, in this order:

1. **Create the wallet** and keep the file out of git: `solana-keygen new --outfile origina-provider.json`. Share only its address (`solana address -k origina-provider.json`).
2. **Initialize the registry.** `init_registry` can only be signed by the program's *upgrade authority* (the wallet that deployed it); see `anchor/README.md`. As of writing the devnet registry has not been initialized.
3. **Approve the wallet.** The registry authority calls `approve_provider(provider, name, c2pa_cert_identity)` with the wallet's address and the name `Origina`.
4. **Claim it.** The provider wallet signs `claim_provider` once to activate the registration (the scripts in `app/scripts` show how).
5. **Fund it** with a little devnet SOL. A connected wallet reimburses each record's rent in the same transaction, so Origina's balance doesn't fall; the float is needed to front the deposit, to keep the account rent-exempt, and to pay for wallet-less anchors (about 0.0022 SOL each).
6. **Configure the server.** Set `ORIGINA_PROVIDER_SECRET_KEY` to the contents of the keypair file (in Vercel: Project Settings → Environment Variables). It is read only on the server. Redeploy after setting it.

`GET /api/anchor/status` reports whether anchoring is ready and, if not, why (`not-configured`, `not-registered`, `not-claimed`, `revoked`, `low-balance`, `network`). It contains no secrets, and the Anchor page uses it to explain a failure instead of letting someone approve a transaction that can't land. Open it in a browser to debug a deployment.

If the wallet isn't active the API says why instead of failing mid-transaction. Only wallet-less anchoring depends on Origina's balance: when it falls below a reserve (0.01 SOL beyond a record's rent by default) that path pauses and the Anchor page asks for a wallet. Requests are rate limited per client address (in memory, so per server instance: a brake on abuse, not a hard guarantee).

## Testing wallets on devnet

Any Wallet Standard wallet that can sign a transaction without sending it (Phantom, Backpack, Solflare, …) can anchor, and no wallet is needed to anchor or verify. The wallet pays, so it needs about 0.0031 devnet SOL: the Anchor page shows its balance and links to faucet.solana.com when it is short. If something doesn't work:

1. Open `/api/anchor/status`. If `ready` is `false`, `message` says what Origina's side still needs (see the setup list above).
2. **Phantom connected but "can't sign for Solana devnet":** turn on Settings → Developer Settings → Testnet Mode, then reconnect.
3. **"The signed transaction doesn't match this anchor":** the wallet rewrote the transaction in a way the server doesn't allow; try another wallet.
4. **Slow or failing lookups:** the public devnet RPC is rate-limited. Set `NEXT_PUBLIC_SOLANA_RPC_URL` (reads in the browser) and `SOLANA_RPC_URL` (the server) to a dedicated devnet endpoint.
5. Hashing needs a secure context: use https (or localhost), not a plain-http LAN address.

Only one record can exist per `(Origina, file)`, because the program derives the record's address from the provider and the file hash: if two wallets anchor the same image, the second gets the first's record back, and the Anchor page says who anchored it first, when, and that nothing new was written or charged. Per-wallet records need the creator added to the program's PDA seeds.

## Updating the generated client

`app/lib/generated/origina` is generated from `app/idl/origina.json`. When the program's IDL changes, regenerate it:

```bash
pnpm --filter @origina/app generate:client
```

## Testing on-chain behavior locally

`app/scripts/chain-integration.ts` exercises the app's anchoring flow against a local validator running the program's **real deployed bytecode** — registry setup, Origina's provider lifecycle (none → pending → active → revoked), the full co-sign flow (the wallet pays the fee and reimburses the rent; Origina's balance is unchanged), wallet-less anchoring, underfunded wallets, duplicates, exact and near lookups, input validation, rate limiting, low-balance handling, and attacks (modified, unsigned and hostile transactions never receive Origina's signature). The validator must be freshly started for each run.

```bash
solana program dump 8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi origina.so --url devnet
solana-keygen new --no-bip39-passphrase --outfile deployer.json
COPYFILE_DISABLE=1 solana-test-validator --reset \
  --upgradeable-program 8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi origina.so "$(solana-keygen pubkey deployer.json)"

DEPLOYER_KEYPAIR=deployer.json pnpm --filter @origina/app test:chain
```

For manual UI testing against that validator, run `pnpm --filter @origina/app setup:local` (with `DEPLOYER_KEYPAIR` and `ORIGINA_PROVIDER_KEYPAIR`), then start the app with `NEXT_PUBLIC_SOLANA_CLUSTER=localnet` and `ORIGINA_PROVIDER_SECRET_KEY` set to the contents of that provider keypair.

## Known limitations

- **Lookup scales linearly.** Finding a record by file hash scans the program's accounts with an RPC filter, and near-match search compares every record's perceptual hash client-side. Fine for a demo; it will need an indexer as the record count grows.
- **Perceptual hash is byte-level.** `computePHash` samples raw file bytes, not decoded pixels, so a crop or re-save often won't register as a near match. A production version should hash decoded pixels.
- **No C2PA parsing yet** (see the sentinel above). Origina vouches only that a wallet anchored a fingerprint and named a model; it does not verify that an image is AI-generated or that the model claim is true.
- **First anchor wins.** Records are immutable and keyed by `(provider, file hash)`, so the first wallet to anchor a file is its recorded creator.
- **The anchor API is the one stateful, funded endpoint.** It spends Origina's SOL, so it is guarded by the exact-transaction check, a balance reserve and a per-address rate limit; put a stricter limit in front of it (for example Vercel's firewall) before opening it to the public.
- The seeded posts in the Social feed are sample content; their badges are labelled as samples and are not on-chain records.

## License

MIT — see [LICENSE](./LICENSE).
