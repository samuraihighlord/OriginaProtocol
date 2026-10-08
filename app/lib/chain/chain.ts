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
  none,
  some,
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
  getAnchorMediaInstructionAsync,
  getClaimProviderInstructionAsync,
  getProvenanceRecordDecoder,
} from "../generated/origina/src/generated";
import { NEAR_MATCH_THRESHOLD, hammingDistance } from "../hash";
import { hexToBytes, bytesToHex, noC2paManifestHash, packPerceptualHash, unpackPerceptualHash } from "./fingerprint";

/** Anything built with the Kit RPC + payer plugins — a wallet-backed client in the app, a keypair-backed one in tests. */
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

const eventAuthority = async () =>
  (
    await getProgramDerivedAddress({
      programAddress: ORIGINA_PROGRAM_ADDRESS,
      seeds: [getUtf8Encoder().encode("__event_authority")],
    })
  )[0];

export interface AnchorInput {
  sha256Hex: string;
  phash: bigint;
}

export type AnchorOutcome =
  | { kind: "anchored"; signature: string; record: OnChainRecord }
  | { kind: "already-anchored"; record: OnChainRecord };

export class InsufficientFundsError extends Error {
  constructor(public readonly needed: bigint, public readonly have: bigint) {
    super("Not enough SOL to cover the record's rent and the network fee.");
  }
}

export class NotAProviderError extends Error {
  constructor(public readonly status: ProviderStatus) {
    super("This wallet is not an active Origina provider.");
  }
}

export async function anchorMedia(client: ChainClient, input: AnchorInput): Promise<AnchorOutcome> {
  const provider = client.payer.address;

  const status = await getProviderStatus(client.rpc, provider);
  if (status.kind !== "active") throw new NotAProviderError(status);

  const fileSha256 = hexToBytes(input.sha256Hex);
  const [recordAddress] = await findProvenanceRecordPda({ provider, fileSha256 });

  // Anchors are immutable: if this provider already anchored the file, return that record instead of failing.
  const existing = await fetchMaybeProvenanceRecord(client.rpc, recordAddress);
  if (existing.exists && existing.programAddress === ORIGINA_PROGRAM_ADDRESS) {
    return { kind: "already-anchored", record: normalizeRecord(recordAddress, existing.data) };
  }

  // Fail early with a clear message instead of a wallet-side simulation error.
  const rent = await client.getMinimumBalance(PROVENANCE_RECORD_ACCOUNT_SIZE);
  const { value: balance } = await client.rpc.getBalance(provider).send();
  const needed = BigInt(rent) + BigInt(10_000);
  if (balance < needed) throw new InsufficientFundsError(needed, balance);

  const perceptual = packPerceptualHash(input.phash);
  const ix = await getAnchorMediaInstructionAsync({
    provider: client.payer,
    // Optional creator co-signer is omitted: a wallet cannot be both provider and creator.
    eventAuthority: await eventAuthority(),
    program: ORIGINA_PROGRAM_ADDRESS,
    fileSha256,
    perceptual: perceptual ? some(perceptual) : none(),
    c2paManifestHash: await noC2paManifestHash(),
    generatedAt: none(),
  });

  const result = await client.sendTransaction([ix]);

  const created = await fetchMaybeProvenanceRecord(client.rpc, recordAddress, { commitment: "confirmed" });
  if (!created.exists) throw new Error("The transaction was sent but the record could not be read back yet.");
  return {
    kind: "anchored",
    signature: result.context.signature,
    record: normalizeRecord(recordAddress, created.data),
  };
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
