/**
 * The app-facing Origina API. The UI imports only this file (plus the wallet/provider hook) — it never touches
 * Solana types directly.
 *
 * - anchor(): fingerprints the file in the browser and writes a provenance record to the Origina program
 *   (the connected wallet signs; it must be an active, registry-approved provider).
 * - verify(): fingerprints the file in the browser and looks it up on-chain (read-only; no wallet needed).
 *
 * The image itself is never sent anywhere — only its fingerprint goes on-chain.
 */
import type { Rpc, SolanaRpcApi } from "@solana/kit";
import {
  type ChainClient,
  anchorMedia,
  findMatch,
  getProviderName,
  getSlotTime,
} from "./chain/chain";
import { explorerAddressUrl, explorerTxUrl } from "./chain/config";
import { computePHash, computeSHA256 } from "./hash";

export interface AnchorParams {
  fileData: Uint8Array;
}

export interface AnchorResult {
  sha256: string;
  /** 64-bit perceptual hash as 0x-prefixed hex. */
  phash: string;
  /** The provider wallet that anchored the record, and its registered name. */
  provider: string;
  providerName: string | null;
  /** The on-chain record account. */
  recordAddress: string;
  recordUrl: string;
  /** Transaction that created the record; null when the file was already anchored by this provider. */
  signature: string | null;
  transactionUrl: string | null;
  slot: number;
  /** Unix seconds, best effort (null if the RPC can't resolve the slot's time). */
  timestamp: number | null;
  /** True when this provider had already anchored this exact file (anchors are immutable). */
  alreadyAnchored: boolean;
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
  sha256: string | null;
  provider: string | null;
  providerName: string | null;
  creatorWallet: string | null;
  recordAddress: string | null;
  recordUrl: string | null;
  slot: number | null;
  timestamp: number | null;
}

export interface OriginaClientDeps {
  /** Read-only RPC (always available). */
  rpc: Rpc<SolanaRpcApi>;
  /** Wallet-backed client; null while no wallet is connected. */
  chain: ChainClient | null;
}

const phashHex = (phash: bigint) => "0x" + phash.toString(16).padStart(16, "0");

export class OriginaClient {
  constructor(private readonly deps: OriginaClientDeps) {}

  async anchor(params: AnchorParams): Promise<AnchorResult> {
    const { chain, rpc } = this.deps;
    if (!chain) throw new Error("Connect a wallet before anchoring.");

    const sha256 = await computeSHA256(params.fileData);
    const phash = computePHash(params.fileData);
    const outcome = await anchorMedia(chain, { sha256Hex: sha256, phash });

    const { record } = outcome;
    const [providerName, timestamp] = await Promise.all([
      getProviderName(rpc, record.provider),
      getSlotTime(rpc, record.slot),
    ]);
    const signature = outcome.kind === "anchored" ? outcome.signature : null;
    return {
      sha256,
      phash: phashHex(phash),
      provider: record.provider,
      providerName,
      recordAddress: record.address,
      recordUrl: explorerAddressUrl(record.address),
      signature,
      transactionUrl: signature ? explorerTxUrl(signature) : null,
      slot: Number(record.slot),
      timestamp,
      alreadyAnchored: outcome.kind === "already-anchored",
    };
  }

  async verify(params: VerifyParams): Promise<VerifyResult> {
    const { rpc } = this.deps;
    const sha256 = await computeSHA256(params.fileData);
    const phash = computePHash(params.fileData);
    const match = await findMatch(rpc, sha256, phash);

    if (match.kind === "none") {
      return {
        found: false,
        exactMatch: false,
        nearMatch: false,
        pHashDistance: null,
        sha256: null,
        provider: null,
        providerName: null,
        creatorWallet: null,
        recordAddress: null,
        recordUrl: null,
        slot: null,
        timestamp: null,
      };
    }

    const { record } = match;
    const [providerName, timestamp] = await Promise.all([
      getProviderName(rpc, record.provider),
      getSlotTime(rpc, record.slot),
    ]);
    return {
      found: true,
      exactMatch: match.kind === "exact",
      nearMatch: match.kind === "near",
      pHashDistance: match.kind === "near" ? match.distance : 0,
      sha256: record.fileSha256Hex,
      provider: record.provider,
      providerName,
      creatorWallet: record.creatorWallet,
      recordAddress: record.address,
      recordUrl: explorerAddressUrl(record.address),
      slot: Number(record.slot),
      timestamp,
    };
  }
}
