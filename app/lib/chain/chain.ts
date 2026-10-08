import {
  type Address,
  type ClientWithPayer,
  type ClientWithRpc,
  type ClientWithTransactionSending,
  type ClientWithGetMinimumBalance,
  type Rpc,
  type SolanaRpcApi,
  getBase64Decoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  isSome,
} from "@solana/kit";
import {
  ORIGINA_PROGRAM_ADDRESS,
  PROVENANCE_RECORD_DISCRIMINATOR,
  fetchMaybeProvenanceRecord,
  fetchMaybeProviderAccount,
  fetchMaybeProviderApproval,
  findProvenanceRecordPda,
  findProviderAccountPda,
  findProviderApprovalPda,
  getClaimProviderInstructionAsync,
  getProvenanceRecordDecoder,
} from "../generated/origina/src/generated";
import { NEAR_MATCH_THRESHOLD, hammingDistance } from "../hash";
import { parseModelMemo } from "../models";
import { hexToBytes, bytesToHex, unpackPerceptualHash } from "./fingerprint";

/** Anything built with the Kit RPC + payer plugins — a keypair-backed client in scripts and tests. */
export type ChainClient = ClientWithRpc<SolanaRpcApi> &
  ClientWithPayer &
  ClientWithTransactionSending &
  ClientWithGetMinimumBalance;

type ChainRpc = Rpc<SolanaRpcApi>;

/** 8-byte discriminator + the record's maximum serialized size (the program allocates the max). */
export const PROVENANCE_RECORD_ACCOUNT_SIZE = 189;

/* ----------------------------- provider status ----------------------------- */

export type ProviderStatus =
  | { kind: "active"; address: Address; name: string }
  | { kind: "revoked"; address: Address; name: string }
  | { kind: "pending"; address: Address; name: string; approvedBy: Address }
  | { kind: "none"; address: Address };

export async function getProviderStatus(rpc: ChainRpc, wallet: Address): Promise<ProviderStatus> {
  const [providerPda] = await findProviderAccountPda({ provider: wallet });
  const provider = await fetchMaybeProviderAccount(rpc, providerPda);
  if (provider.exists && provider.programAddress === ORIGINA_PROGRAM_ADDRESS) {
    const name = provider.data.name;
    return isSome(provider.data.revocation)
      ? { kind: "revoked", address: wallet, name }
      : { kind: "active", address: wallet, name };
  }

  const [approvalPda] = await findProviderApprovalPda({ provider: wallet });
  const approval = await fetchMaybeProviderApproval(rpc, approvalPda);
  if (approval.exists && approval.programAddress === ORIGINA_PROGRAM_ADDRESS) {
    return { kind: "pending", address: wallet, name: approval.data.name, approvedBy: approval.data.approvedBy };
  }
  return { kind: "none", address: wallet };
}

/** Completes a pending provider approval. Signed by the provider wallet itself. */
export async function claimProvider(client: ChainClient, approvedBy: Address) {
  const ix = await getClaimProviderInstructionAsync({ provider: client.payer, approvedBy });
  const result = await client.sendTransaction([ix]);
  return { signature: result.context.signature };
}

/* -------------------------------- anchoring -------------------------------- */

export const eventAuthority = async () =>
  (
    await getProgramDerivedAddress({
      programAddress: ORIGINA_PROGRAM_ADDRESS,
      seeds: [getUtf8Encoder().encode("__event_authority")],
    })
  )[0];

/** The provenance record this provider would hold for a file, and whether it already exists on-chain. */
export async function findExistingRecord(rpc: ChainRpc, provider: Address, sha256Hex: string) {
  const [recordAddress] = await findProvenanceRecordPda({ provider, fileSha256: hexToBytes(sha256Hex) });
  const existing = await fetchMaybeProvenanceRecord(rpc, recordAddress);
  const exists = existing.exists && existing.programAddress === ORIGINA_PROGRAM_ADDRESS;
  return { recordAddress, record: exists ? normalizeRecord(recordAddress, existing.data) : null };
}

/* ------------------------------- verification ------------------------------ */

export interface OnChainRecord {
  address: Address;
  provider: Address;
  fileSha256Hex: string;
  phash: bigint | null;
  creatorWallet: Address | null;
  slot: bigint;
  generatedAt: bigint | null;
}

type DecodedRecord = ReturnType<ReturnType<typeof getProvenanceRecordDecoder>["decode"]>;

function normalizeRecord(address: Address, data: DecodedRecord): OnChainRecord {
  const perceptual = isSome(data.perceptual) ? unpackPerceptualHash(data.perceptual.value.alg, data.perceptual.value.hash) : null;
  return {
    address,
    provider: data.provider,
    fileSha256Hex: bytesToHex(data.fileSha256),
    phash: perceptual,
    creatorWallet: isSome(data.creatorWallet) ? data.creatorWallet.value : null,
    slot: data.slot,
    generatedAt: isSome(data.generatedAt) ? data.generatedAt.value : null,
  };
}

const toBase64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);

async function programRecords(rpc: ChainRpc, extraFilters: { offset: number; bytes: Uint8Array }[]) {
  const filters = [{ offset: 0, bytes: new Uint8Array(PROVENANCE_RECORD_DISCRIMINATOR) }, ...extraFilters].map((f) => ({
    memcmp: { offset: BigInt(f.offset), bytes: toBase64(f.bytes) as never, encoding: "base64" as const },
  }));
  const accounts = await rpc.getProgramAccounts(ORIGINA_PROGRAM_ADDRESS, { encoding: "base64", filters }).send();

  const decoder = getProvenanceRecordDecoder();
  const records: OnChainRecord[] = [];
  for (const { pubkey, account } of accounts) {
    // On-chain data is untrusted: check ownership and size, and skip anything that does not decode.
    if (account.owner !== ORIGINA_PROGRAM_ADDRESS) continue;
    const bytes = new Uint8Array(getBase64Encoder().encode(account.data[0]));
    if (bytes.length !== PROVENANCE_RECORD_ACCOUNT_SIZE) continue;
    try {
      records.push(normalizeRecord(pubkey, decoder.decode(bytes)));
    } catch {
      continue;
    }
  }
  return records;
}

export type RecordMatch =
  | { kind: "exact"; record: OnChainRecord }
  | { kind: "near"; record: OnChainRecord; distance: number }
  | { kind: "none" };

/** Exact match on SHA-256 across all providers (earliest slot wins), else the closest perceptual hash within the threshold. */
export async function findMatch(rpc: ChainRpc, sha256Hex: string, phash: bigint): Promise<RecordMatch> {
  const exact = await programRecords(rpc, [{ offset: 40, bytes: hexToBytes(sha256Hex) }]);
  if (exact.length > 0) {
    exact.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
    return { kind: "exact", record: exact[0] };
  }

  const all = await programRecords(rpc, []);
  let best: { record: OnChainRecord; distance: number } | null = null;
  for (const record of all) {
    if (record.phash === null) continue;
    const distance = hammingDistance(phash, record.phash);
    if (distance < NEAR_MATCH_THRESHOLD && (!best || distance < best.distance)) best = { record, distance };
  }
  return best ? { kind: "near", ...best } : { kind: "none" };
}

export async function getProviderName(rpc: ChainRpc, provider: Address): Promise<string | null> {
  const [pda] = await findProviderAccountPda({ provider });
  const account = await fetchMaybeProviderAccount(rpc, pda);
  return account.exists && account.programAddress === ORIGINA_PROGRAM_ADDRESS ? account.data.name : null;
}

/** Best-effort wall-clock time for a slot; null if the RPC no longer has it. */
export async function getSlotTime(rpc: ChainRpc, slot: bigint): Promise<number | null> {
  try {
    const t = await rpc.getBlockTime(slot).send();
    return t === null ? null : Number(t);
  } catch {
    return null;
  }
}

/** Reads one record account; null if it does not exist (or is not owned by the program). */
export async function getRecord(rpc: ChainRpc, address: Address): Promise<OnChainRecord | null> {
  const account = await fetchMaybeProvenanceRecord(rpc, address, { commitment: "confirmed" });
  return account.exists && account.programAddress === ORIGINA_PROGRAM_ADDRESS
    ? normalizeRecord(address, account.data)
    : null;
}

/**
 * The AI model recorded with a record: the Memo in the transaction that created it. A record account is only ever
 * touched by that one transaction, so its oldest signature is the creation. Memos are untrusted data and are
 * validated before use; null when there is no (valid) memo or the RPC can no longer serve the transaction.
 */
export async function getRecordModel(rpc: ChainRpc, recordAddress: Address): Promise<string | null> {
  try {
    const signatures = await rpc.getSignaturesForAddress(recordAddress, { limit: 10, commitment: "confirmed" }).send();
    const creation = [...signatures].reverse().find((s) => s.err === null);
    if (!creation) return null;
    const tx = await rpc
      .getTransaction(creation.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .send();
    const instructions = (tx?.transaction.message.instructions ?? []) as readonly { program?: string; parsed?: unknown }[];
    for (const ix of instructions) {
      if (ix.program !== "spl-memo") continue;
      const model = parseModelMemo(ix.parsed);
      if (model) return model;
    }
    return null;
  } catch {
    return null;
  }
}
