# Origina Protocol

Origina Protocol is open-source infrastructure that permanently anchors a cryptographic fingerprint of AI-generated media at the moment of creation, so any platform can verify a file's origin, model, and authenticity — without ever storing, uploading, or transmitting the media file itself.

This repo is the Origina web app (MVP). The backend — fingerprint hashing, the API, the on-chain Solana program, and the SDK that talks to them — is being built separately and plugs in through a single file, `app/lib/originaClient.ts`. Until it lands, that file stands in for it in the browser: records are held in memory for the session and are **not yet anchored on Solana**. See [Backend integration](#backend-integration).

## Repo structure

```
origina-protocol/
├── app/                        # @origina/app — Next.js web app
│   ├── pages/
│   │   ├── _app.tsx            # loads global styles
│   │   ├── _document.tsx       # Inter + JetBrains Mono
│   │   └── index.tsx           # page shell: nav, welcome modal, banners, the three pages
│   ├── components/
│   │   ├── NavBar.tsx          # sticky nav, bottom tab bar on mobile, wallet menu
│   │   ├── WelcomeModal.tsx    # first-visit introduction
│   │   ├── Toast.tsx           # transient notifications
│   │   ├── CursorFollower.tsx  # teal cursor ring (pointer devices only)
│   │   ├── IntroBanner.tsx     # per-page dismissable banner
│   │   ├── ImageDropzone.tsx   # shared drag-and-drop / click-to-browse upload
│   │   ├── AboutView.tsx       # overview, how it works, stored schema
│   │   ├── AnchorView.tsx      # anchor an AI-generated image
│   │   ├── SocialView.tsx      # X-style feed with provenance badges
│   │   ├── ProvenanceDrawer.tsx# provenance record viewer
│   │   ├── Icon.tsx, Row.tsx   # small shared pieces
│   ├── lib/
│   │   ├── originaClient.ts    # backend integration point (see below)
│   │   ├── hash.ts             # SHA-256, 64-bit pHash, Hamming distance
│   │   ├── imageMeta.ts        # image format/dimension reader (display only)
│   │   ├── feed.ts             # sample feed posts
│   │   ├── models.ts           # AI model list
│   │   ├── format.ts           # formatting helpers
│   │   └── storage.ts          # safe localStorage helpers
│   └── styles/globals.css      # all styling (CSS variables, no framework)
├── package.json                # root, pnpm workspaces
└── pnpm-workspace.yaml
```

## Quick start

Prerequisites: [Node.js](https://nodejs.org/) ≥ 18 and [pnpm](https://pnpm.io/installation) ≥ 9.

```bash
pnpm install
pnpm dev:app     # http://localhost:3000
pnpm build       # production build
```

## What the app does

- **About** — what Origina is, how it works, and the record schema.
- **Anchor** — drop an AI-generated image, choose the model that made it, and anchor its fingerprint. The image is fingerprinted in the browser (SHA-256 for exact matching, a 64-bit perceptual hash for near matching) and never uploaded. Anchoring the same file twice returns the original record, since anchors are immutable.
- **Social** — an X-style feed. Upload an image under "Add to feed" and it is checked against anchored records: an exact SHA-256 match earns an **AI-generated** badge, a perceptual-hash match within Hamming distance 12 earns **AI-generated · modified**, and no match gets no badge. Click a badge to open the provenance record.

A wallet address can be entered from the nav to label records with a creator; direct wallet-adapter connections (Phantom, Backpack) are planned. Nothing is signed or sent from the wallet.

## Backend integration

`app/lib/originaClient.ts` is the single seam between the UI and the backend, and the UI imports nothing else backend-related. To connect the real backend, replace the bodies of `anchor()` and `verify()` (or the whole file) with calls into the SDK/API, keeping this contract so no other app code changes:

```ts
class OriginaClient {
  constructor(options?: { apiBaseUrl?: string; cluster?: string });

  anchor(params: {
    fileData: Uint8Array;
    modelId: string;
    mediaType: "image" | "video" | "audio" | "text";
    walletPublicKey: string;
  }): Promise<{
    modelId: string;
    creator: string;
    sha256: string;
    phash: string;              // 0x-prefixed hex
    timestamp: number;          // unix seconds
    slot: number | null;        // chain-derived; null until the on-chain program is connected
    pdaAddress: string | null;
    explorerUrl: string | null;
    alreadyAnchored?: boolean;  // true if this file was anchored before (existing record returned)
  }>;

  verify(params: { fileData: Uint8Array }): Promise<{
    found: boolean;
    exactMatch: boolean;
    nearMatch: boolean;
    pHashDistance: number | null; // 0 for exact, Hamming distance for near, null if no match
    modelId: string | null;
    creator: string | null;
    sha256: string | null;
    timestamp: number | null;
    slot: number | null;
    pdaAddress: string | null;
    explorerUrl: string | null;
  }>;
}
```

The chain-derived fields (`slot`, `pdaAddress`, `explorerUrl`) are optional in the UI: when the backend returns them they are shown (including a "View on Solana Explorer" link), and when they are `null` they are simply omitted. The stand-in client in this repo returns `null` for all three, because it does not talk to Solana.

**Perceptual hash note:** `computePHash` in `app/lib/hash.ts` samples raw file bytes rather than decoded pixels, so how reliably a crop or re-save registers as a near match depends on the file format. A production implementation should use a pixel-domain perceptual hash.

## License

MIT — see [LICENSE](./LICENSE).
