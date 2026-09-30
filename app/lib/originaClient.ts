/**
 * Placeholder for the Origina backend integration.
 *
 * The actual fingerprint hashing, on-chain anchoring, and verification are
 * supplied by a separate contributor's SDK/API/blockchain program — not yet
 * wired into this demo app. The types and class below are the contract this
 * UI is built against; swap OriginaClient's method bodies for real calls
 * into their SDK/API once it's available. Until then, calling anchor() or
 * verify() fails with a clear "not connected" error, which the UI already
 * surfaces through its existing error states.
 */

export type MediaType = "image" | "video" | "audio" | "text";

export interface AnchorParams {
  fileData: Uint8Array;
  modelId: string;
  mediaType: MediaType;
  walletPublicKey: string;
  metadataUri?: string;
}

export interface AnchorResult {
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
}

export interface VerifyParams {
  fileData: Uint8Array;
}

export interface VerifyResult {
  found: boolean;
  exactMatch: boolean;
  nearMatch: boolean;
  creator: string | null;
  modelId: string | null;
  mediaType: MediaType | null;
  timestamp: number | null;
  pdaAddress: string | null;
  explorerUrl: string | null;
  pHashDistance: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
}

export interface OriginaClientOptions {
  apiBaseUrl?: string;
  cluster?: "devnet" | "mainnet-beta" | "testnet" | "localnet";
}

const NOT_CONNECTED =
  "Origina backend not connected yet — this call is pending integration with the SDK/API/blockchain contributor's code.";

export class OriginaClient {
  constructor(_options: OriginaClientOptions = {}) {}

  async anchor(_params: AnchorParams): Promise<AnchorResult> {
    throw new Error(`anchor(): ${NOT_CONNECTED}`);
  }

  async verify(_params: VerifyParams): Promise<VerifyResult> {
    throw new Error(`verify(): ${NOT_CONNECTED}`);
  }
}
