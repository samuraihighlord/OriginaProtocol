# Origina Protocol

Origina Protocol is open-source infrastructure on Solana that permanently anchors a cryptographic fingerprint of AI-generated media at the moment of creation, so any platform can verify a file's origin, model, and authenticity in under 200 milliseconds — without ever storing, uploading, or transmitting the media file itself. Only a small on-chain fingerprint (a SHA-256 hash, a coarse perceptual hash, and a few metadata fields) is anchored; the original file stays with its creator.

## Repo structure

```
origina-protocol/
├── programs/origina/        # Anchor (Rust) on-chain program
│   └── src/lib.rs
├── sdk/                      # @origina/sdk — TypeScript SDK
│   └── src/
│       ├── hash.ts           # sha256, computePhash, hammingDistance, comparePhash
│       ├── pda.ts            # deriveProvenancePda
│       ├── client.ts         # OriginaClient (anchor / verify)
│       └── __tests__/        # jest unit tests
├── api/                       # @origina/api — reference REST API (Express)
│   └── src/
│       ├── app.ts            # /v1/anchor, /v1/verify, /v1/verify/file, /health
│       ├── store.ts          # in-memory fingerprint store (MVP)
│       └── verify.ts         # exact + near-match lookup logic
├── app/                       # @origina/app — Next.js demo (two-panel checker)
│   ├── pages/index.tsx
│   └── components/
├── tests/origina.ts          # Anchor integration tests (local validator)
├── Anchor.toml
├── Cargo.toml                 # Rust workspace
├── package.json                # root, pnpm workspaces
└── pnpm-workspace.yaml
```

## Quick start

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Solana CLI](https://docs.solanalabs.com/cli/install) ≥ 1.18
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.30.x (via `avm install 0.30.1 && avm use 0.30.1`)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/installation) ≥ 9

### 1. Configure devnet

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json   # skip if you already have a wallet
solana airdrop 2
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build and deploy the on-chain program

```bash
anchor build
anchor keys sync        # writes the real generated program ID into lib.rs and Anchor.toml
anchor build             # rebuild with the synced ID baked into the binary
anchor deploy --provider.cluster devnet
```

> The repo ships with a placeholder program ID (`EyfitU6WEPfrtmvGxhzZdn8vruro2SY4oaeNtAFST6g4`) in `programs/origina/src/lib.rs`, `Anchor.toml`, and `sdk/src/constants.ts`. After your own deploy, update `DEFAULT_PROGRAM_ID` in `sdk/src/constants.ts` and `PROGRAM_ID` in `api/.env` to match the address `anchor keys sync` generates for you.

### 4. Run the on-chain integration tests

```bash
anchor test   # builds, spins up a local validator, deploys, and runs tests/origina.ts
```

### 5. Build the SDK

```bash
pnpm --filter @origina/sdk build
```

### 6. Start the API and the demo app

```bash
cp api/.env.example api/.env       # edit PROGRAM_ID after your deploy
cp app/.env.example app/.env.local

pnpm dev:api     # http://localhost:3001
pnpm dev:app     # http://localhost:3000
```

Open **http://localhost:3000**.

## How the demo works

The page has two panels, side by side:

- **AI Tool — Creator** (left): drag and drop an AI-generated image, pick the model that made it (`midjourney-v6`, `dall-e-3`, `stable-diffusion-xl`, `sora-1.0`, `firefly-2`, `flux-1`, or `custom`), type a Solana wallet address (no wallet connection needed — it's just the address that gets recorded as the creator), and click **Anchor**. The SDK computes the SHA-256 and perceptual hash *in the browser*; the image bytes never leave the tab. Only the fingerprint is sent to the API, which returns a PDA address, a signature, and a Solana Explorer link.

- **Platform — e.g. TikTok / Instagram** (right): drag and drop any image to check it. The SDK hashes it locally and calls the verify API, which returns one of three states:
  - 🟢 **Exact match** — the file's SHA-256 matches an anchored record exactly: "AI-generated content — verified," with model, creator, and timestamp.
  - 🟡 **Near match** — no exact hash match, but the perceptual hash is within a Hamming distance of 12 of an anchored record: "Modified AI content detected," with the distance shown.
  - ⚪ **Not found** — no record, exact or near, exists for this file.

**Try the manipulation test:** anchor an image on the left, then crop or lightly edit that same file (e.g. trim a few pixels, re-save at a different quality) and drop the edited version on the right. Because the SHA-256 changes but the image is still broadly similar, you should see the amber near-match badge instead of a clean miss. Note that `computePhash` in this MVP is a dependency-free hash over *raw file bytes* (not decoded pixels), so how well a given edit triggers a near-match depends on how much it perturbs the underlying byte layout — a production deployment should swap in a real image-domain perceptual hash for robust crop/recompress tolerance.

## SDK usage

```ts
import { OriginaClient } from "@origina/sdk";

const client = new OriginaClient({ apiBaseUrl: "http://localhost:3001" });

// Anchor — computes fingerprints locally, sends only the fingerprint.
const fileData = new Uint8Array(await file.arrayBuffer());
const anchored = await client.anchor({
  fileData,
  modelId: "midjourney-v6",
  mediaType: "image",
  walletPublicKey: "7xKXqx6Rr8jV7XX9RwtwxWFsn1eScqz9jyqLTQjbxYES",
});
console.log(anchored.pdaAddress, anchored.explorerUrl);

// Verify — same local hashing, no upload of the file.
const result = await client.verify({ fileData });
if (result.exactMatch) {
  console.log(`Verified: ${result.modelId} by ${result.creator}`);
} else if (result.nearMatch) {
  console.log(`Likely modified (distance ${result.pHashDistance})`);
} else {
  console.log("No provenance record found.");
}
```

Standalone primitives are also exported for direct use: `sha256`, `computePhash`, `toHex`, `hammingDistance`, `comparePhash`, `deriveProvenancePda`, `detectImageFormat`, and `readImageDimensions`.

## What's stored, per image

Every AI tool knows four things about an image the instant it generates it: **which model** made it, **when**, **what dimensions**, and **what file format**. Combined with a fingerprint of the content, that's everything Origina anchors — but not all four are equally trustworthy, and the design here deliberately keeps that distinction:

- **On-chain and used for verification:** the exact content fingerprint (SHA-256), a fuzzy/perceptual fingerprint (for detecting lightly-edited copies), the model ID, and the anchoring wallet. The anchor's own timestamp comes from Solana's cluster clock, not a self-reported field.
- **Shown in the app for context, never used to decide a match:** width/height and file format, read straight from the file's header (`detectImageFormat` / `readImageDimensions` in the SDK — pure byte-parsing, no dependencies). These are cheap and fast to read, exactly as the AI tool would know them at generation time — but they're also the first thing that changes when a platform resizes or re-encodes an upload, and they're trivially spoofable by anyone re-saving an unrelated file at the same size. Treating them as proof of anything would be a mistake, so the UI labels them "informational only" and the API never uses them in `/v1/verify`'s matching logic.

## What's stored on-chain

Every anchor writes one `ProvenanceRecord` account, addressed deterministically by `seeds = ["provenance", sha256_hash]` — any verifier can derive the same address locally and read it with a single `getAccountInfo` call, no indexer required.

| Field | Type | Size |
|---|---|---|
| (Anchor account discriminator) | — | 8 bytes |
| `creator` | `Pubkey` | 32 bytes |
| `sha256_hash` | `[u8; 32]` | 32 bytes |
| `phash` | `u64` | 8 bytes |
| `model_id` | `String` (max 64 chars) | 68 bytes |
| `media_type` | `u8` | 1 byte |
| `timestamp` | `i64` | 8 bytes |
| `slot` | `u64` | 8 bytes |
| `parent` | `Option<Pubkey>` | 33 bytes |
| `metadata_uri` | `String` (max 200 chars) | 204 bytes |
| `bump` | `u8` | 1 byte |
| **Total** | | **403 bytes** |

At current devnet rent rates that's roughly 0.0028 SOL (a few tenths of a cent) to anchor a record, one time, forever — no ongoing storage fee, and nothing ever needs to be renewed or re-uploaded. If your deployment doesn't need long `model_id`/`metadata_uri` strings, lowering their `#[max_len(...)]` in `programs/origina/src/lib.rs` shrinks the account (and the rent) further.

## License

MIT — see [LICENSE](./LICENSE).
