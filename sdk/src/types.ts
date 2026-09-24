export type MediaType = "image" | "video" | "audio" | "text";

export const MEDIA_TYPE_CODES: Record<MediaType, number> = {
  image: 0,
  video: 1,
  audio: 2,
  text: 3,
};

export const MEDIA_TYPE_NAMES: Record<number, MediaType> = {
  0: "image",
  1: "video",
  2: "audio",
  3: "text",
};

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
  /**
   * Descriptive only — read from the file's own header, not part of the
   * fingerprint. Never used to decide whether a match is authentic; both
   * change on any resize/re-encode and are trivially spoofable.
   */
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
  /** Descriptive only, from the matched record's original file — see AnchorResult. */
  width: number | null;
  height: number | null;
  format: string | null;
}

export interface OriginaClientOptions {
  apiBaseUrl?: string;
  programId?: import("@solana/web3.js").PublicKey;
  cluster?: "devnet" | "mainnet-beta" | "testnet" | "localnet";
}
