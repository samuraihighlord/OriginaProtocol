/**
 * The app-facing Origina API. The UI imports only this file (plus the wallet/provider hook) — it never touches
 * Solana types directly.
 *
 * - anchor(): fingerprints the file in the browser and writes a provenance record to the Origina program.
 *   Origina is the registered provider and signs the record. A connected wallet co-signs as the creator and pays:
 *   it is the transaction's fee payer and reimburses the record's rent. With no wallet, Origina pays.
 * - verify(): fingerprints the file in the browser and looks it up on-chain (read-only; no wallet needed).
 *
 * The image itself is never sent anywhere — only its fingerprint goes on-chain.
 */
import { type Address, type Rpc, type SolanaRpcApi, type TransactionSigner, address } from "@solana/kit";
import type { AnchorFields, AnchorStatus } from "./anchorApi";
import { findMatch, getProviderName, getRecord, getRecordMemo, getRecordModel, getSlotTime } from "./chain/chain";
import { explorerAddressUrl, explorerTxUrl } from "./chain/config";
import { anchorWithOrigina, canCosign, fetchAnchorStatus } from "./chain/cosign";
import { computePHash, computeSHA256 } from "./hash";
import { normalizeModel } from "./models";
import { type ProvenanceRecordData, type StoredRecord, extractProvenanceRecord } from "./provenance";
import { recordStore } from "./recordStore";

export interface AnchorParams {
  /** The record extracted from the image by analyse(). */
  record: ProvenanceRecordData;
  /** The AI model that generated the image. */
  model: string;
}

export interface AnchorResult {
  /** The full record, as kept in the in-memory store. */
  record: StoredRecord;
  recordUrl: string;
  /** Null when the file had already been anchored (no new transaction). */
  transactionUrl: string | null;
  providerName: string | null;
  /** True when Origina had already anchored this exact file (anchors are immutable). */
  alreadyAnchored: boolean;
  /**
   * Set when alreadyAnchored: who the existing record names as creator (null = anchored without a wallet) and
   * when it was anchored (unix seconds; the record's block time, else its generated_at).
   */
  existing: { creator: string | null; anchoredAt: number } | null;
  /** True when a wallet was connected but couldn't co-sign, so the record has no creator. */
  creatorSkipped: boolean;
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

const CONFIRMED = { commitment: "confirmed" } as const;

/** The server confirms before answering, but our own RPC node can lag a moment behind it. */
async function readRecordWhenVisible(rpc: Rpc<SolanaRpcApi>, address: Parameters<typeof getRecord>[1]) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const record = await getRecord(rpc, address);
    if (record) return record;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The anchor was confirmed but the record can't be read back yet. Check the Social page in a moment.");
}

/** Origina's provider wallet, learned from the status endpoint or a previous anchor. Shared by all clients. */
let knownProvider: Address | null = null;

export class OriginaClient {
  constructor(private readonly deps: OriginaClientDeps) {}

  /** SOL balance of a wallet in lamports; null if the RPC can't be reached. */
  async getWalletBalance(wallet: string): Promise<bigint | null> {
    try {
      return (await this.deps.rpc.getBalance(address(wallet), CONFIRMED).send()).value;
    } catch {
      return null;
    }
  }

  /** Origina's provider wallet and whether it can anchor right now (null if the status couldn't be fetched). */
  async getAnchorStatus(): Promise<AnchorStatus | null> {
    const status = await fetchAnchorStatus();
    if (status?.provider) knownProvider = address(status.provider);
    return status;
  }

  /**
   * Extracts every image-derived field of the provenance record in the browser (SHA-256, dHash, C2PA manifest hash,
   * timestamp and the PDA bump). Nothing leaves the device.
   */
  async analyse(fileData: Uint8Array): Promise<ProvenanceRecordData> {
    if (!knownProvider) await this.getAnchorStatus();
    return extractProvenanceRecord(fileData, knownProvider);
  }

  async anchor(params: AnchorParams): Promise<AnchorResult> {
    const { signer, rpc } = this.deps;
    const model = normalizeModel(params.model);
    if (!model) throw new Error("Choose the model that generated this image.");

    // A wallet that can't sign without sending can't co-sign; anchor without a creator rather than failing.
    const cosigner = signer && canCosign(signer) ? signer : null;
    const creator = cosigner?.address ?? null;

    // The slot is read immediately before submitting.
    const slot = Number(await rpc.getSlot(CONFIRMED).send());
    const draft: ProvenanceRecordData = { ...params.record, creator, slot };

    const fields: AnchorFields = {
      provider: draft.provider,
      file_hash: draft.file_hash,
      perceptual_hash: phashHex(draft.perceptual_hash),
      c2pa_manifest_hash: draft.c2pa_manifest_hash,
      creator: draft.creator,
      slot,
      generated_at: draft.generated_at,
      bump: draft.bump,
      model,
    };
    const outcome = await anchorWithOrigina(cosigner, fields);
    knownProvider = outcome.provider;

    const onChain = await readRecordWhenVisible(rpc, outcome.recordAddress);
    const alreadyAnchored = outcome.kind === "already-anchored";
    const [providerName, memo, blockTime] = await Promise.all([
      getProviderName(rpc, onChain.provider),
      alreadyAnchored ? getRecordMemo(rpc, onChain.address) : Promise.resolve(null),
      alreadyAnchored ? getSlotTime(rpc, onChain.slot) : Promise.resolve(null),
    ]);
    const signature = outcome.kind === "anchored" ? outcome.signature : null;

    const record: StoredRecord = {
      ...draft,
      // What the chain holds is authoritative; for an existing record that is the earlier anchor's values.
      creator: onChain.creatorWallet,
      generated_at: onChain.generatedAt === null ? draft.generated_at : Number(onChain.generatedAt),
      bump: onChain.bump,
      slot: alreadyAnchored ? Number(onChain.slot) : slot,
      confirmed_slot: Number(onChain.slot),
      model: alreadyAnchored ? memo?.model ?? null : model,
      pda: onChain.address,
      signature,
    };
    recordStore.set(record);

    return {
      record,
      recordUrl: explorerAddressUrl(onChain.address),
      transactionUrl: signature ? explorerTxUrl(signature) : null,
      providerName,
      alreadyAnchored,
      existing: alreadyAnchored
        ? { creator: onChain.creatorWallet, anchoredAt: blockTime ?? record.generated_at }
        : null,
      creatorSkipped: !!signer && !cosigner,
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
