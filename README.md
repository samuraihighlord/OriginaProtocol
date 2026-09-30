# Origina Protocol — Demo App

Origina Protocol is open-source infrastructure that permanently anchors a cryptographic fingerprint of AI-generated media at the moment of creation, so any platform can verify a file's origin, model, and authenticity — without ever storing, uploading, or transmitting the media file itself.

**This repo is the demo app only.** The backend — fingerprint hashing, the API, the on-chain program, and the SDK that talks to them — is being built separately by another contributor and integrated here once ready. See [Backend integration](#backend-integration) below.

## Repo structure

```
origina-protocol/
├── app/                       # @origina/app — Next.js demo (two-panel checker)
│   ├── pages/index.tsx
│   ├── components/
│   │   ├── CreatorPanel.tsx  # "AI Tool — Creator" panel (anchor flow)
│   │   ├── PlatformPanel.tsx # "Platform" panel (verify flow)
│   │   └── ImageDrop.tsx     # shared drag-and-drop upload
│   └── lib/
│       ├── originaClient.ts  # backend integration point — see below
│       └── imageMeta.ts      # local, dependency-free image format/dimension reader
├── package.json                # root, pnpm workspaces
└── pnpm-workspace.yaml
```

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/installation) ≥ 9

### Install and run

```bash
pnpm install
pnpm dev:app     # http://localhost:3000
```

## How the demo works

The page has two panels, side by side:

- **AI Tool — Creator** (left): drag and drop an AI-generated image, pick the model that made it, type a wallet address, and click **Anchor**.
- **Platform — e.g. TikTok / Instagram** (right): drag and drop any image to check it against anchored records — exact match, near match (lightly edited), or not found.

Both panels call into `OriginaClient` (see below) for the actual anchor/verify work; image format and dimensions shown in the UI are read locally via `app/lib/imageMeta.ts` regardless of backend status.

## Backend integration

`app/lib/originaClient.ts` is the one file this demo app depends on for all backend behavior — fingerprint hashing, calling the API, and reading on-chain state. Right now its `OriginaClient.anchor()` and `.verify()` methods are placeholders that throw a clear "not connected yet" error (surfaced through the UI's existing error states), matching this contract:

```ts
class OriginaClient {
  constructor(options?: { apiBaseUrl?: string; cluster?: string });
  anchor(params: {
    fileData: Uint8Array;
    modelId: string;
    mediaType: "image" | "video" | "audio" | "text";
    walletPublicKey: string;
    metadataUri?: string;
  }): Promise<{
    signature: string;
    pdaAddress: string;
    sha256: string;
    phash: string;
    timestamp: number;
    slot: number;
    explorerUrl: string;
    width: number | null;
    height: number | null;
    format: string;
  }>;
  verify(params: { fileData: Uint8Array }): Promise<{
    found: boolean;
    exactMatch: boolean;
    nearMatch: boolean;
    creator: string | null;
    modelId: string | null;
    mediaType: "image" | "video" | "audio" | "text" | null;
    timestamp: number | null;
    pdaAddress: string | null;
    explorerUrl: string | null;
    pHashDistance: number | null;
    width: number | null;
    height: number | null;
    format: string | null;
  }>;
}
```

To wire in the real backend once it's ready: either replace the internals of `OriginaClient` in `app/lib/originaClient.ts` with real SDK/API calls, or swap the whole file for the SDK package the other contributor supplies (as long as it exports something matching this shape, no other app code needs to change).

## License

MIT — see [LICENSE](./LICENSE).
