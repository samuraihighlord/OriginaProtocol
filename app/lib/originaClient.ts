/**
 * The app-facing Origina API. The UI imports only this file (plus the wallet/provider hook) — it never touches
 * Solana types directly.
 *
 * - anchor(): fingerprints the file in the browser and writes a provenance record to the Origina program.
 *   Origina is the registered provider: it pays for and signs the record, and the connected wallet co-signs as the
 *   creator. The wallet needs no SOL.
 * - verify(): fingerprints the file in the browser and looks it up on-chain (read-only; no wallet needed).
 *
 * The image itself is never sent anywhere — only its fingerprint goes on-chain.
 */
import type { Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { findMatch, getProviderName, getRecord, getRecordModel, getSlotTime } from "./chain/chain";
import { explorerAddressUrl, explorerTxUrl } from "./chain/config";
import { anchorWithOrigina } from "./chain/cosign";
import { computePHash, computeSHA256 } from "./hash";
import { normalizeModel } from "./models";

export interface AnchorParams {
  fileData: Uint8Array;
  /** The AI model that generated the image. */
  model: string;
}

export interface AnchorResult {
  sha256: string;
  /** 64-bit perceptual hash as 0x-prefixed hex. */
  phash: string;
  /** The provider wallet that anchored the record, and its registered name. */
  provider: string;
  providerName: string | null;
  /** The wallet that co-signed as the creator. */
  creatorWallet: string | null;
  /** The model recorded with the anchor (null if it can't be read back). */
  model: string | null;
  /** The on-chain record account. */
  recordAddress: string;
  recordUrl: string;
  /** Transaction that created the record; null when the file was already anchored by this provider. */
  signature: string | null;
  transactionUrl: string | null;
  slot: number;
  /** Unix seconds, best effort (null if the RPC can't resolve the slot's time). */
  timestamp: number | null;
  /** True when Origina had already anchored this exact file (anchors are immutable). */
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
  /** The AI model recorded with the anchor, when it can be read back. */
  model: string | null;
  recordAddress: string | null;
  recordUrl: string | null;
  slot: number | null;
  timestamp: number | null;
}

export interface OriginaClientDeps {
  /** Read-only RPC (always available). */
  rpc: Rpc<SolanaRpcApi>;
  /** The connected wallet's signer; null while no wallet is connected. */
  signer: TransactionSigner | null;
}

const phashHex = (phash: bigint) => "0x" + phash.toString(16).padStart(16, "0");

/** The server confirms before answering, but our own RPC node can lag a moment behind it. */
async function readRecordWhenVisible(rpc: Rpc<SolanaRpcApi>, address: Parameters<typeof getRecord>[1]) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const record = await getRecord(rpc, address);
    if (record) return record;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The anchor was confirmed but the record can't be read back yet. Check the Social page in a moment.");
}

export class OriginaClient {
  constructor(private readonly deps: OriginaClientDeps) {}

  async anchor(params: AnchorParams): Promise<AnchorResult> {
    const { signer, rpc } = this.deps;
    if (!signer) throw new Error("Connect a wallet before anchoring.");
    const model = normalizeModel(params.model);
    if (!model) throw new Error("Choose the model that generated this image.");

    const sha256 = await computeSHA256(params.fileData);
    const phash = computePHash(params.fileData);
    const outcome = await anchorWithOrigina(signer, { sha256, phash: phashHex(phash), model });

    const record = await readRecordWhenVisible(rpc, outcome.recordAddress);
    const [providerName, timestamp, storedModel] = await Promise.all([
      getProviderName(rpc, record.provider),
      getSlotTime(rpc, record.slot),
      outcome.kind === "anchored" ? Promise.resolve(model) : getRecordModel(rpc, record.address),
    ]);
    const signature = outcome.kind === "anchored" ? outcome.signature : null;
    return {
      sha256,
      phash: phashHex(phash),
      provider: record.provider,
      providerName,
      creatorWallet: record.creatorWallet,
      model: storedModel,
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
        model: null,
        recordAddress: null,
        recordUrl: null,
        slot: null,
        timestamp: null,
      };
    }

    const { record } = match;
    const [providerName, timestamp, model] = await Promise.all([
      getProviderName(rpc, record.provider),
      getSlotTime(rpc, record.slot),
      getRecordModel(rpc, record.address),
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
      model,
      recordAddress: record.address,
      recordUrl: explorerAddressUrl(record.address),
      slot: Number(record.slot),
      timestamp,
    };
  }
}
