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
import type { AnchorFields, PrepareResponse, SubmitRequest, SubmitResponse } from "../anchorApi";
import { PROVENANCE_RECORD_ACCOUNT_SIZE, findExistingRecord, getProviderStatus } from "../chain/chain";
import { RPC_URL } from "../chain/config";
import { describeChainError } from "../chain/errors";
import { normalizeModel } from "../models";
import { buildAnchorTransaction } from "./anchorTx";
import { AnchorApiError } from "./errors";
import { getProviderSigner } from "./provider";
import { rateLimit } from "./rateLimit";

/** Per client IP: how many transactions Origina will prepare / sign per hour. */
const PREPARE_LIMIT = 60;
const SUBMIT_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

/** Anchoring stops (rather than draining the wallet to zero) when the provider wallet falls below this many lamports of headroom. */
const DEFAULT_RESERVE_LAMPORTS = BigInt(10_000_000); // 0.01 SOL
const NETWORK_FEE_ALLOWANCE = BigInt(10_000);

const MAX_TRANSACTION_BASE64_LENGTH = 2000; // a legal transaction is at most 1232 bytes
const CONFIRM_ATTEMPTS = 30;
const CONFIRM_INTERVAL_MS = 1000;

let rpcSingleton: Rpc<SolanaRpcApi> | null = null;
const getRpc = () => (rpcSingleton ??= createSolanaRpc(process.env.SOLANA_RPC_URL ?? RPC_URL));

/* ------------------------------- validation ------------------------------- */

const HEX_SHA256 = /^[0-9a-f]{64}$/i;
const HEX_PHASH = /^0x[0-9a-f]{1,16}$/i;

interface ParsedFields {
  sha256Hex: string;
  phash: bigint;
  model: string;
  creator: Address;
}

function parseFields(body: unknown): ParsedFields {
  const f = (body ?? {}) as Partial<Record<keyof AnchorFields, unknown>>;
  if (typeof f.sha256 !== "string" || !HEX_SHA256.test(f.sha256) || /^0+$/.test(f.sha256)) {
    throw new AnchorApiError(400, "That file fingerprint isn't valid.");
  }
  if (typeof f.phash !== "string" || !HEX_PHASH.test(f.phash)) {
    throw new AnchorApiError(400, "That perceptual hash isn't valid.");
  }
  const model = normalizeModel(f.model);
  if (!model) throw new AnchorApiError(400, "Choose the model that generated the image (letters, numbers and . _ + - / only, up to 64 characters).");
  if (typeof f.creator !== "string" || !isAddress(f.creator)) {
    throw new AnchorApiError(400, "That wallet address isn't valid.");
  }
  return { sha256Hex: f.sha256.toLowerCase(), phash: BigInt(f.phash), model, creator: address(f.creator) };
}

function checkRate(kind: "prepare" | "submit", ip: string) {
  const retryAfter = rateLimit(`${kind}:${ip}`, kind === "prepare" ? PREPARE_LIMIT : SUBMIT_LIMIT, HOUR_MS);
  if (retryAfter > 0) {
    throw new AnchorApiError(429, "Too many anchors from this connection. Please try again later.", retryAfter);
  }
}

/** Origina must be an active registered provider with enough SOL left to pay for one more record. */
async function ensureCanAnchor(rpc: Rpc<SolanaRpcApi>, provider: Address) {
  const status = await getProviderStatus(rpc, provider);
  if (status.kind !== "active") {
    console.error(`Provider ${provider} is not active in the registry (status: ${status.kind}); anchoring is unavailable.`);
    throw new AnchorApiError(503, "Anchoring is temporarily unavailable.");
  }
  const rent = await rpc.getMinimumBalanceForRentExemption(BigInt(PROVENANCE_RECORD_ACCOUNT_SIZE)).send();
  const { value: balance } = await rpc.getBalance(provider).send();
  const reserve = process.env.ORIGINA_RESERVE_LAMPORTS ? BigInt(process.env.ORIGINA_RESERVE_LAMPORTS) : DEFAULT_RESERVE_LAMPORTS;
  if (balance < BigInt(rent) + NETWORK_FEE_ALLOWANCE + reserve) {
    console.error(`Provider ${provider} is low on SOL (${balance} lamports); anchoring paused until it is topped up.`);
    throw new AnchorApiError(503, "Anchoring is temporarily unavailable.");
  }
}

/* --------------------------------- prepare --------------------------------- */

/**
 * Step 1. Builds the unsigned transaction for the user's wallet to sign (or reports the file is already anchored).
 */
export async function prepareAnchor(body: unknown, ip: string): Promise<PrepareResponse> {
  checkRate("prepare", ip);
  const fields = parseFields(body);
  const providerSigner = await getProviderSigner();
  const provider = providerSigner.address;
  if (fields.creator === provider) throw new AnchorApiError(400, "That wallet address isn't valid.");

  const rpc = getRpc();
  const { recordAddress, record } = await findExistingRecord(rpc, provider, fields.sha256Hex);
  if (record) return { alreadyAnchored: true, recordAddress };

  await ensureCanAnchor(rpc, provider);
  const { value: latest } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const transaction = await buildAnchorTransaction({ ...fields, provider, blockhash: latest.blockhash });
  return {
    alreadyAnchored: false,
    recordAddress,
    transaction: getBase64EncodedWireTransaction(transaction),
  };
}

/* --------------------------------- submit ---------------------------------- */

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v, i) => v === b[i]);

/**
 * Step 2. Receives the transaction after the user's wallet has signed it. Origina adds its own signature only if
 * the signed bytes are exactly the transaction it would have built for these fields, then sends and confirms it.
 * Because Origina signs last and only that exact message, a tampered or unrelated transaction can never get
 * Origina's signature, and a signature obtained for one anchor is useless for anything else.
 */
export async function submitAnchor(body: unknown, ip: string): Promise<SubmitResponse> {
  checkRate("submit", ip);
  const fields = parseFields(body);
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

  const providerSigner = await getProviderSigner();
  const provider = providerSigner.address;
  if (fields.creator === provider) throw new AnchorApiError(400, "That wallet address isn't valid.");

  const expected = await buildAnchorTransaction({ ...fields, provider, blockhash });
  if (!sameBytes(expected.messageBytes, submitted.messageBytes)) {
    throw new AnchorApiError(
      400,
      "The signed transaction doesn't match this anchor. If your wallet modified it, try another wallet.",
    );
  }

  // The user must actually have signed (consented to being recorded as the creator).
  const creatorSignature = submitted.signatures[fields.creator];
  const creatorSigned =
    creatorSignature && (await verifySignature(await getPublicKeyFromAddress(fields.creator), creatorSignature, submitted.messageBytes));
  if (!creatorSigned) throw new AnchorApiError(400, "The transaction wasn't signed by your wallet.");

  const rpc = getRpc();
  const { recordAddress, record } = await findExistingRecord(rpc, provider, fields.sha256Hex);
  if (record) throw new AnchorApiError(409, "This file has already been anchored.");
  await ensureCanAnchor(rpc, provider);

  const providerSignature = await signBytes(providerSigner.keyPair.privateKey, submitted.messageBytes);
  const signed: Transaction = { ...submitted, signatures: { ...submitted.signatures, [provider]: providerSignature } };
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
      return { signature, recordAddress };
    }
    await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
  }
  throw new AnchorApiError(504, "The anchor was submitted but hasn't confirmed yet. Check again in a moment.");
}
