import { PublicKey } from "@solana/web3.js";
import { DEFAULT_API_BASE_URL, DEFAULT_PROGRAM_ID, EXPLORER_BASE_URL } from "./constants";
import { sha256, computePhash, toHex } from "./hash";
import { detectImageFormat, readImageDimensions } from "./imageMeta";
import { deriveProvenancePda } from "./pda";
import {
  AnchorParams,
  AnchorResult,
  MEDIA_TYPE_CODES,
  MEDIA_TYPE_NAMES,
  OriginaClientOptions,
  VerifyParams,
  VerifyResult,
} from "./types";

interface AnchorApiResponse {
  signature: string;
  pdaAddress: string;
  timestamp: number;
  slot: number;
}

interface VerifyApiResponse {
  found: boolean;
  exactMatch: boolean;
  nearMatch: boolean;
  pHashDistance: number | null;
  creator: string | null;
  modelId: string | null;
  mediaType: number | null;
  phash: string | null;
  timestamp: number | null;
  slot: number | null;
  pdaAddress: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
}

/**
 * Client for anchoring and verifying AI-media provenance records.
 * Fingerprints (SHA-256 + perceptual hash) are always computed locally —
 * the media file itself is never sent over the network.
 */
export class OriginaClient {
  private readonly apiBaseUrl: string;
  private readonly programId: PublicKey;
  private readonly cluster: string;

  constructor(options: OriginaClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.programId = options.programId ?? DEFAULT_PROGRAM_ID;
    this.cluster = options.cluster ?? "devnet";
  }

  async anchor(params: AnchorParams): Promise<AnchorResult> {
    const hashBytes = await sha256(params.fileData);
    const phash = computePhash(params.fileData);
    const [pda] = deriveProvenancePda(hashBytes, this.programId);

    // Display-only — read from the file's own header, never used to decide
    // whether a future verification matches (see imageMeta.ts).
    const format = detectImageFormat(params.fileData);
    const dimensions = readImageDimensions(params.fileData);

    const response = await fetch(`${this.apiBaseUrl}/v1/anchor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sha256: toHex(hashBytes),
        phash: phash.toString(),
        modelId: params.modelId,
        mediaType: MEDIA_TYPE_CODES[params.mediaType],
        metadataUri: params.metadataUri ?? "",
        creator: params.walletPublicKey,
        pdaAddress: pda.toBase58(),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        format,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Origina anchor failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as AnchorApiResponse;

    return {
      signature: data.signature,
      pdaAddress: data.pdaAddress,
      sha256: toHex(hashBytes),
      phash: phash.toString(),
      timestamp: data.timestamp,
      slot: data.slot,
      explorerUrl: this.explorerUrlForAddress(data.pdaAddress),
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      format,
    };
  }

  async verify(params: VerifyParams): Promise<VerifyResult> {
    const hashBytes = await sha256(params.fileData);
    const phash = computePhash(params.fileData);

    const query = new URLSearchParams({
      hash: toHex(hashBytes),
      phash: phash.toString(),
    });

    const response = await fetch(`${this.apiBaseUrl}/v1/verify?${query.toString()}`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Origina verify failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as VerifyApiResponse;
    return this.toVerifyResult(data);
  }

  private toVerifyResult(data: VerifyApiResponse): VerifyResult {
    if (!data.found) {
      return {
        found: false,
        exactMatch: false,
        nearMatch: false,
        creator: null,
        modelId: null,
        mediaType: null,
        timestamp: null,
        pdaAddress: null,
        explorerUrl: null,
        pHashDistance: data.pHashDistance ?? null,
        width: null,
        height: null,
        format: null,
      };
    }

    return {
      found: true,
      exactMatch: data.exactMatch,
      nearMatch: data.nearMatch,
      creator: data.creator,
      modelId: data.modelId,
      mediaType: data.mediaType !== null ? MEDIA_TYPE_NAMES[data.mediaType] ?? null : null,
      timestamp: data.timestamp,
      pdaAddress: data.pdaAddress,
      explorerUrl: data.pdaAddress ? this.explorerUrlForAddress(data.pdaAddress) : null,
      pHashDistance: data.pHashDistance,
      width: data.width,
      height: data.height,
      format: data.format,
    };
  }

  private explorerUrlForAddress(address: string): string {
    const clusterQuery = this.cluster === "mainnet-beta" ? "" : `?cluster=${this.cluster}`;
    return `${EXPLORER_BASE_URL}/address/${address}${clusterQuery}`;
  }
}
