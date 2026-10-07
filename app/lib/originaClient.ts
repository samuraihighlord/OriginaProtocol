/**
 * The Origina backend seam for this app.
 *
 * The real fingerprint hashing, on-chain anchoring, and verification are being
 * built separately (SDK / API / Solana program). Until that lands, this class
 * stands in for them in the browser: fingerprints are computed locally and
 * anchored records are held in an in-memory Map for the session, with a short
 * delay standing in for the network round trip. Nothing is sent anywhere and
 * nothing is written to Solana, so the chain-derived fields (pdaAddress, slot,
 * explorerUrl) are null here and the UI omits them.
 *
 * The UI only uses the types and methods exported from this file. To connect
 * the real backend, replace the bodies of anchor() and verify() (or this whole
 * file) with calls into the SDK/API and keep these shapes — no other app code
 * needs to change.
 */

import { computePHash, computeSHA256, hammingDistance, NEAR_MATCH_THRESHOLD } from "./hash";

export type MediaType = "image" | "video" | "audio" | "text";

export interface AnchorParams {
  fileData: Uint8Array;
  modelId: string;
  mediaType: MediaType;
  walletPublicKey: string;
}

export interface AnchorResult {
  /** The anchored record. If the file was anchored before, this is the original record. */
  modelId: string;
  creator: string;
  sha256: string;
  /** 64-bit perceptual hash as 0x-prefixed hex. */
  phash: string;
  /** Unix seconds. */
  timestamp: number;
  /** Chain-derived; null until the on-chain program is connected. */
  slot: number | null;
  pdaAddress: string | null;
  explorerUrl: string | null;
  /** True when this file was already anchored and the existing record was returned (anchors are immutable). */
  alreadyAnchored?: boolean;
}

export interface VerifyParams {
  fileData: Uint8Array;
}

export interface VerifyResult {
  found: boolean;
  exactMatch: boolean;
  nearMatch: boolean;
  /** Hamming distance between perceptual hashes: 0 for an exact match, null when nothing matched. */
  pHashDistance: number | null;
  modelId: string | null;
  creator: string | null;
  sha256: string | null;
  timestamp: number | null;
  slot: number | null;
  pdaAddress: string | null;
  explorerUrl: string | null;
}

export interface OriginaClientOptions {
  apiBaseUrl?: string;
  cluster?: "devnet" | "mainnet-beta" | "testnet" | "localnet";
}

interface StoredRecord {
  sha256: string;
  phash: bigint;
  modelId: string;
  creator: string;
  timestamp: number;
}

const ANCHOR_LATENCY_MS = 1200;
const VERIFY_LATENCY_MS = 900;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function phashHex(phash: bigint): string {
  return "0x" + phash.toString(16).padStart(16, "0");
}

export class OriginaClient {
  private readonly records = new Map<string, StoredRecord>();

  constructor(_options: OriginaClientOptions = {}) {}

  async anchor(params: AnchorParams): Promise<AnchorResult> {
    const sha256 = await computeSHA256(params.fileData);
    const phash = computePHash(params.fileData);
    await sleep(ANCHOR_LATENCY_MS);

    let record = this.records.get(sha256);
    const alreadyAnchored = record !== undefined;

    if (!record) {
      record = {
        sha256,
        phash,
        modelId: params.modelId,
        creator: params.walletPublicKey,
        timestamp: Math.floor(Date.now() / 1000),
      };
      this.records.set(sha256, record);
    }

    return {
      modelId: record.modelId,
      creator: record.creator,
      sha256: record.sha256,
      phash: phashHex(record.phash),
      timestamp: record.timestamp,
      slot: null,
      pdaAddress: null,
      explorerUrl: null,
      alreadyAnchored,
    };
  }

  async verify(params: VerifyParams): Promise<VerifyResult> {
    const sha256 = await computeSHA256(params.fileData);
    const phash = computePHash(params.fileData);
    await sleep(VERIFY_LATENCY_MS);

    const exact = this.records.get(sha256);
    if (exact) return this.toVerifyResult(exact, true, 0);

    let best: { record: StoredRecord; distance: number } | null = null;
    for (const record of Array.from(this.records.values())) {
      const distance = hammingDistance(phash, record.phash);
      if (distance < NEAR_MATCH_THRESHOLD && (!best || distance < best.distance)) {
        best = { record, distance };
      }
    }
    if (best) return this.toVerifyResult(best.record, false, best.distance);

    return {
      found: false,
      exactMatch: false,
      nearMatch: false,
      pHashDistance: null,
      modelId: null,
      creator: null,
      sha256: null,
      timestamp: null,
      slot: null,
      pdaAddress: null,
      explorerUrl: null,
    };
  }

  private toVerifyResult(record: StoredRecord, exact: boolean, distance: number): VerifyResult {
    return {
      found: true,
      exactMatch: exact,
      nearMatch: !exact,
      pHashDistance: distance,
      modelId: record.modelId,
      creator: record.creator,
      sha256: record.sha256,
      timestamp: record.timestamp,
      slot: null,
      pdaAddress: null,
      explorerUrl: null,
    };
  }
}
