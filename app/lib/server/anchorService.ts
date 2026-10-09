import {
  type Address,
  type Blockhash,
  type Rpc,
  type SolanaRpcApi,
  type Transaction,
  address,
  blockhash as toBlockhash,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  getTransactionDecoder,
  isAddress,
  signBytes,
  verifySignature,
} from "@solana/kit";
import type {
  AnchorCost,
  AnchorFields,
  AnchorStatus,
  AnchorUnavailableReason,
  PrepareResponse,
  SubmitRequest,
  SubmitResponse,
} from "../anchorApi";
import { PROVENANCE_RECORD_ACCOUNT_SIZE, findExistingRecord, getProviderStatus } from "../chain/chain";
import { RPC_URL } from "../chain/config";
import { describeChainError } from "../chain/errors";
import { normalizeModel } from "../models";
import { deriveRecordPda } from "../provenance";
import { type AnchorTxInput, buildAnchorTransaction } from "./anchorTx";
import { validateSignedAnchorTransaction } from "./anchorValidate";
import { AnchorApiError } from "./errors";
import { getProviderSigner } from "./provider";
import { rateLimit } from "./rateLimit";

/** Per client IP: how many transactions Origina will prepare / sign per hour. */
const PREPARE_LIMIT = 60;
const SUBMIT_LIMIT = 20;
const STATUS_LIMIT = 240;
const HOUR_MS = 60 * 60 * 1000;

/** When Origina itself pays (no wallet connected) it stops rather than draining its wallet to zero. */
const DEFAULT_RESERVE_LAMPORTS = BigInt(10_000_000); // 0.01 SOL
/** Two signatures at 5000 lamports each: the creator's and Origina's. */
const NETWORK_FEE_LAMPORTS = BigInt(10_000);

const MAX_TRANSACTION_BASE64_LENGTH = 2000; // a legal transaction is at most 1232 bytes
const GENERATED_AT_WINDOW_SECONDS = 24 * 60 * 60;
const CONFIRM_ATTEMPTS = 30;
const CONFIRM_INTERVAL_MS = 1000;

let rpcSingleton: Rpc<SolanaRpcApi> | null = null;
const getRpc = () => (rpcSingleton ??= createSolanaRpc(process.env.SOLANA_RPC_URL ?? RPC_URL));

/* ------------------------------- validation ------------------------------- */

const HEX_32 = /^[0-9a-f]{64}$/i;
const HEX_PHASH = /^0x[0-9a-f]{1,16}$/i;
const isNonZeroHex32 = (v: unknown): v is string => typeof v === "string" && HEX_32.test(v) && !/^0+$/.test(v);

interface ParsedFields {
  fileHashHex: string;
  phash: bigint;
  c2paManifestHashHex: string | null;
  creator: Address | null;
  slot: number;
  generatedAt: number;
  model: string;
}

function parseFields(body: unknown): ParsedFields {
  const f = (body ?? {}) as Partial<Record<keyof AnchorFields, unknown>>;
  if (f.provider !== "origina") throw new AnchorApiError(400, "Origina is the provider for every record.");
  if (!isNonZeroHex32(f.file_hash)) throw new AnchorApiError(400, "That file fingerprint isn't valid.");
  if (typeof f.perceptual_hash !== "string" || !HEX_PHASH.test(f.perceptual_hash)) {
    throw new AnchorApiError(400, "That perceptual hash isn't valid.");
  }
  if (f.c2pa_manifest_hash !== null && f.c2pa_manifest_hash !== undefined && !isNonZeroHex32(f.c2pa_manifest_hash)) {
    throw new AnchorApiError(400, "That C2PA manifest hash isn't valid.");
  }
  if (f.creator !== null && f.creator !== undefined && (typeof f.creator !== "string" || !isAddress(f.creator))) {
    throw new AnchorApiError(400, "That wallet address isn't valid.");
  }
  if (!Number.isSafeInteger(f.slot) || (f.slot as number) < 0) throw new AnchorApiError(400, "That slot isn't valid.");
  if (!Number.isSafeInteger(f.generated_at)) throw new AnchorApiError(400, "That timestamp isn't valid.");
  const skew = Math.abs(Math.floor(Date.now() / 1000) - (f.generated_at as number));
  if (skew > GENERATED_AT_WINDOW_SECONDS) {
    throw new AnchorApiError(400, "Your device's clock looks wrong (more than a day off). Fix it and try again.");
  }
  if (f.bump !== null && f.bump !== undefined && !(Number.isInteger(f.bump) && (f.bump as number) >= 0 && (f.bump as number) <= 255)) {
    throw new AnchorApiError(400, "That bump isn't valid.");
  }
  const model = normalizeModel(f.model);
  if (!model) throw new AnchorApiError(400, "Choose the model that generated the image (letters, numbers and . _ + - / only, up to 64 characters).");

  return {
    fileHashHex: (f.file_hash as string).toLowerCase(),
    phash: BigInt(f.perceptual_hash as string),
    c2paManifestHashHex: f.c2pa_manifest_hash ? (f.c2pa_manifest_hash as string).toLowerCase() : null,
    creator: f.creator ? address(f.creator as string) : null,
    slot: f.slot as number,
    generatedAt: f.generated_at as number,
    model,
  };
}

function checkRate(kind: "prepare" | "submit" | "status", ip: string) {
  const limit = kind === "prepare" ? PREPARE_LIMIT : kind === "submit" ? SUBMIT_LIMIT : STATUS_LIMIT;
  const retryAfter = rateLimit(`${kind}:${ip}`, limit, HOUR_MS);
  if (retryAfter > 0) {
    throw new AnchorApiError(429, "Too many requests from this connection. Please try again later.", retryAfter);
  }
}

/* ----------------------------- provider readiness ----------------------------- */

const MESSAGES: Record<AnchorUnavailableReason, string> = {
  "not-configured": "Anchoring isn't available yet: Origina's provider wallet hasn't been set up on the server.",
  "not-registered": "Anchoring isn't available yet: Origina's provider wallet hasn't been approved in the on-chain registry.",
  "not-claimed": "Anchoring isn't available yet: Origina's provider wallet was approved but hasn't claimed its registration.",
  revoked: "Anchoring is unavailable: Origina's provider registration has been revoked.",
  "low-balance": "Anchoring without a wallet is paused: Origina's provider wallet is out of devnet SOL. Connect a wallet to pay for the anchor yourself, or try again later.",
  "insufficient-funds": "Your wallet doesn't have enough devnet SOL to anchor.",
  network: "Anchoring is temporarily unavailable: couldn't reach the Solana network. Please try again in a moment.",
};

const unavailable = (reason: AnchorUnavailableReason) => new AnchorApiError(503, MESSAGES[reason], undefined, reason);

/** What one anchor costs the paying wallet. Read from the cluster, so it follows rent-parameter changes. */
async function getCost(rpc: Rpc<SolanaRpcApi>): Promise<AnchorCost & { rent: bigint }> {
  const rent = BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(PROVENANCE_RECORD_ACCOUNT_SIZE)).send());
  // A wallet account must stay at zero or at its own rent-exempt minimum after paying.
  const accountMinimum = BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(0)).send());
  return {
    rent,
    rentLamports: Number(rent),
    feeLamports: Number(NETWORK_FEE_LAMPORTS),
    requiredLamports: Number(rent + NETWORK_FEE_LAMPORTS + accountMinimum),
  };
}

const SOL = 1_000_000_000;
const sol = (lamports: number | bigint) => (Number(lamports) / SOL).toFixed(4);

/** Is Origina's wallet configured and registered — and can it also pay itself? Reports why not; never throws on that. */
export async function getAnchorStatus(ip: string): Promise<AnchorStatus> {
  checkRate("status", ip);
  try {
    const signer = await getProviderSigner();
    const rpc = getRpc();
    await ensureProviderRegistered(rpc, signer.address);
    const cost = await getCost(rpc);
    const originaPays = await providerCanPay(rpc, signer.address, cost.rent).catch(() => false);
    const { rent: _rent, ...publicCost } = cost;
    return { ready: true, provider: signer.address, originaPays, cost: publicCost };
  } catch (err) {
    if (err instanceof AnchorApiError && err.reason) {
      let provider: string | null = null;
      if (err.reason !== "not-configured") provider = (await getProviderSigner().catch(() => null))?.address ?? null;
      return { ready: false, provider, reason: err.reason, message: err.message };
    }
    throw err;
  }
}

/** Origina must be an active registered provider. */
async function ensureProviderRegistered(rpc: Rpc<SolanaRpcApi>, provider: Address) {
  let status;
  try {
    status = await getProviderStatus(rpc, provider);
  } catch (err) {
    console.error("Could not read Origina's provider state:", err);
    throw unavailable("network");
  }
  if (status.kind === "none") throw unavailable("not-registered");
  if (status.kind === "pending") throw unavailable("not-claimed");
  if (status.kind === "revoked") throw unavailable("revoked");
}

/** Can Origina's wallet pay for one more record itself, keeping its reserve? Only needed when no wallet pays. */
async function providerCanPay(rpc: Rpc<SolanaRpcApi>, provider: Address, rent: bigint): Promise<boolean> {
  const { value: balance } = await rpc.getBalance(provider).send();
  const reserve = process.env.ORIGINA_RESERVE_LAMPORTS ? BigInt(process.env.ORIGINA_RESERVE_LAMPORTS) : DEFAULT_RESERVE_LAMPORTS;
  return balance >= rent + NETWORK_FEE_LAMPORTS + reserve;
}

/**
 * Makes sure whoever pays for this anchor can: the creator's wallet when there is one (it pays the network fee and
 * reimburses the rent), otherwise Origina's. Fails with a message the person can act on.
 */
async function ensureCanPay(rpc: Rpc<SolanaRpcApi>, provider: Address, creator: Address | null): Promise<bigint> {
  let cost;
  try {
    cost = await getCost(rpc);
  } catch (err) {
    console.error("Could not read the rent parameters:", err);
    throw unavailable("network");
  }
  if (creator) {
    let balance: bigint;
    try {
      balance = (await rpc.getBalance(creator).send()).value;
    } catch (err) {
      console.error("Could not read the creator's balance:", err);
      throw unavailable("network");
    }
    if (balance < BigInt(cost.requiredLamports)) {
      throw new AnchorApiError(
        400,
        `Your wallet needs about ${sol(cost.requiredLamports)} devnet SOL to anchor (the record's ${sol(cost.rentLamports)} SOL deposit plus network fees) and has ${sol(balance)}. Get free devnet SOL at faucet.solana.com.`,
        undefined,
        "insufficient-funds",
      );
    }
  } else {
    let canPay = false;
    try {
      canPay = await providerCanPay(rpc, provider, cost.rent);
    } catch (err) {
      console.error("Could not read Origina's balance:", err);
      throw unavailable("network");
    }
    if (!canPay) {
      console.error(`Provider ${provider} is low on SOL; anchoring without a wallet is paused until it is topped up.`);
      throw unavailable("low-balance");
    }
  }
  return cost.rent;
}

async function txInput(fields: ParsedFields, provider: Address, blockhash: Blockhash, rentLamports: bigint): Promise<AnchorTxInput> {
  const { bump } = await deriveRecordPda(provider, fields.fileHashHex);
  return {
    provider,
    creator: fields.creator,
    rentLamports,
    fileHashHex: fields.fileHashHex,
    phash: fields.phash,
    c2paManifestHashHex: fields.c2paManifestHashHex,
    generatedAt: fields.generatedAt,
    model: fields.model,
    slot: fields.slot,
    bump, // always the server's own derivation: the memo never carries a client-supplied bump
    blockhash,
  };
}

/* --------------------------------- prepare --------------------------------- */

/**
 * Step 1. Reports whether the file is already anchored, and otherwise checks the payer can afford it and builds
 * the unsigned transaction for the creator's wallet to sign (there is nothing to sign when no wallet is connected).
 */
export async function prepareAnchor(body: unknown, ip: string): Promise<PrepareResponse> {
  checkRate("prepare", ip);
  const fields = parseFields(body);
  const providerSigner = await getProviderSigner();
  const provider = providerSigner.address;
  if (fields.creator === provider) throw new AnchorApiError(400, "That wallet address isn't valid.");

  const rpc = getRpc();
  const { recordAddress, record } = await findExistingRecord(rpc, provider, fields.fileHashHex);
  if (record) return { alreadyAnchored: true, recordAddress, provider };

  await ensureProviderRegistered(rpc, provider);
  const rent = await ensureCanPay(rpc, provider, fields.creator);
  if (!fields.creator) return { alreadyAnchored: false, recordAddress, provider, transaction: null };

  const { value: latest } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const transaction = await buildAnchorTransaction(await txInput(fields, provider, latest.blockhash, rent));
  return { alreadyAnchored: false, recordAddress, provider, transaction: getBase64EncodedWireTransaction(transaction) };
}

/* --------------------------------- submit ---------------------------------- */

/**
 * Step 2. With a creator: receives the transaction after the user's wallet (the fee payer, who also reimburses
 * the rent) has signed it, and adds Origina's signature only if what was signed is the transaction the server would
 * build (see validateSignedAnchorTransaction). Without one: builds, signs and sends the transaction itself, paying
 * for it. Then sends and waits for confirmation.
 */
export async function submitAnchor(body: unknown, ip: string): Promise<SubmitResponse> {
  checkRate("submit", ip);
  const fields = parseFields(body);
  const providerSigner = await getProviderSigner();
  const provider = providerSigner.address;
  if (fields.creator === provider) throw new AnchorApiError(400, "That wallet address isn't valid.");
  const rpc = getRpc();
  await ensureProviderRegistered(rpc, provider);
  const rent = await ensureCanPay(rpc, provider, fields.creator);

  let toSend: Transaction;
  if (fields.creator) {
    const encoded = (body as Partial<SubmitRequest>).transaction;
    if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_TRANSACTION_BASE64_LENGTH) {
      throw new AnchorApiError(400, "That transaction isn't valid.");
    }
    let submitted: Transaction;
    let blockhash: Blockhash;
    try {
      submitted = getTransactionDecoder().decode(getBase64Encoder().encode(encoded));
      blockhash = toBlockhash(getCompiledTransactionMessageDecoder().decode(submitted.messageBytes).lifetimeToken);
    } catch {
      throw new AnchorApiError(400, "That transaction isn't valid.");
    }

    const expected = await buildAnchorTransaction(await txInput(fields, provider, blockhash, rent));
    validateSignedAnchorTransaction(expected.messageBytes, submitted.messageBytes, provider);

    // The user must actually have signed (consented to being recorded as the creator).
    const creatorSignature = submitted.signatures[fields.creator];
    const creatorSigned =
      creatorSignature && (await verifySignature(await getPublicKeyFromAddress(fields.creator), creatorSignature, submitted.messageBytes));
    if (!creatorSigned) throw new AnchorApiError(400, "The transaction wasn't signed by your wallet.");
    toSend = submitted;
  } else {
    const { value: latest } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    toSend = await buildAnchorTransaction(await txInput(fields, provider, latest.blockhash, rent));
  }

  const { recordAddress, record } = await findExistingRecord(rpc, provider, fields.fileHashHex);
  if (record) throw new AnchorApiError(409, "This file has already been anchored.");

  const providerSignature = await signBytes(providerSigner.keyPair.privateKey, toSend.messageBytes);
  const signed: Transaction = { ...toSend, signatures: { ...toSend.signatures, [provider]: providerSignature } };
  const signature = getSignatureFromTransaction(signed);

  try {
    // Preflight (simulation) stays on: a program rejection comes back here instead of landing as a failed transaction.
    await rpc
      .sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" })
      .send();
  } catch (err) {
    throw new AnchorApiError(422, describeChainError(err).slice(0, 300));
  }

  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new AnchorApiError(422, "The transaction failed on-chain.");
    if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
      return { signature, recordAddress, provider };
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
  }
  throw new AnchorApiError(504, "The anchor was submitted but hasn't confirmed yet. Check again in a moment.");
}
