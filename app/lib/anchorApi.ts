/** Request/response shapes shared by the anchor API routes (pages/api/anchor/*) and the browser client. */

/** The provenance record fields plus the model, as the browser sends them. */
export interface AnchorFields {
  /** Always "origina". */
  provider: string;
  /** Hex SHA-256 of the file. */
  file_hash: string;
  /** 64-bit perceptual hash, 0x-prefixed hex. */
  perceptual_hash: string;
  /** Hex SHA-256 of the embedded C2PA manifest, or null when there is none. */
  c2pa_manifest_hash: string | null;
  /** The user's wallet (co-signs the transaction), or null when no wallet is connected. */
  creator: string | null;
  /** Devnet slot the browser observed just before submitting. */
  slot: number;
  /** Unix seconds. */
  generated_at: number;
  /** The record PDA's canonical bump as the browser derived it (null if it could not yet). */
  bump: number | null;
  /** Model that generated the image. */
  model: string;
}

export type PrepareResponse =
  | { alreadyAnchored: true; recordAddress: string; provider: string }
  | {
      alreadyAnchored: false;
      recordAddress: string;
      /** Origina's provider wallet. */
      provider: string;
      /** Base64 wire-format transaction for the creator's wallet to sign; null when there is no creator to co-sign. */
      transaction: string | null;
    };

export interface SubmitRequest extends AnchorFields {
  /** Base64 wire-format transaction signed by the creator's wallet. Required when `creator` is set. */
  transaction?: string | null;
}

export interface SubmitResponse {
  signature: string;
  recordAddress: string;
  provider: string;
}

export type AnchorUnavailableReason =
  | "not-configured"
  | "not-registered"
  | "not-claimed"
  | "revoked"
  | "low-balance"
  | "insufficient-funds"
  | "network";

/** What one anchor costs the wallet that pays for it, in lamports. */
export interface AnchorCost {
  /** The record account's rent-exempt deposit. */
  rentLamports: number;
  /** Network fee for the two signatures. */
  feeLamports: number;
  /** The least a connected wallet must hold to anchor: rent + fee + the minimum a wallet account must keep. */
  requiredLamports: number;
}

export interface AnchorStatus {
  /** The registry side is in order: Origina's wallet is configured, approved and claimed. */
  ready: boolean;
  /** Origina can also pay for anchors itself (used when no wallet is connected). */
  originaPays?: boolean;
  cost?: AnchorCost;
  /** Origina's provider wallet, when configured. */
  provider: string | null;
  reason?: AnchorUnavailableReason;
  /** What to tell the person using the site. */
  message?: string;
}

export interface ApiErrorBody {
  error: string;
}

/** An error answered by the anchor API; its message is already written for the user. */
export class AnchorApiResponseError extends Error {}
