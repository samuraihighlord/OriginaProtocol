import { type Address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { ORIGINA_PROGRAM_ADDRESS } from "./generated/origina/src/generated";
import { hexToBytes } from "./chain/fingerprint";
import { computeC2paManifestHash } from "./c2pa";
import { computePHash, computeSHA256 } from "./hash";

/** Every record this site writes names Origina as its provider. */
export const PROVIDER_NAME = "origina";

/**
 * The provenance record for one upload session. All eight fields are extracted client-side; `slot` and `creator`
 * are filled in at anchor time (the connected wallet and the current devnet slot are not known earlier).
 */
export interface ProvenanceRecordData {
  provider: typeof PROVIDER_NAME;
  /** Hex SHA-256 of the raw image bytes (32 bytes): the primary fingerprint. */
  file_hash: string;
  /** 64-bit dHash backup fingerprint. */
  perceptual_hash: bigint;
  /** Hex SHA-256 of the embedded C2PA manifest, or null when the image carries none. */
  c2pa_manifest_hash: string | null;
  /** Connected wallet, or null when none is connected. */
  creator: string | null;
  /** Devnet slot read immediately before submitting; null until then. */
  slot: number | null;
  /** Unix seconds when the image was analysed. */
  generated_at: number;
  /** Canonical bump of the record's PDA; null until the provider address is known. */
  bump: number | null;
}

/** A record after anchoring: the fields above plus where it landed. Kept in the in-memory Map, keyed by file_hash. */
export interface StoredRecord extends ProvenanceRecordData {
  model: string | null;
  /** The record's on-chain account (PDA) and the transaction that created it (null if it already existed). */
  pda: string;
  signature: string | null;
  /** The slot the program stamped on the account, which can trail `slot` by a few slots. */
  confirmed_slot: number | null;
}

/** The record PDA and its canonical bump, using the seeds the deployed program derives it from. */
export async function deriveRecordPda(provider: Address, fileHashHex: string): Promise<{ address: Address; bump: number }> {
  const [address, bump] = await getProgramDerivedAddress({
    programAddress: ORIGINA_PROGRAM_ADDRESS,
    seeds: [getUtf8Encoder().encode("media"), getAddressEncoder().encode(provider), hexToBytes(fileHashHex)],
  });
  return { address, bump };
}

/**
 * Extracts every field that depends only on the image. `providerAddress` (Origina's wallet) is needed for the bump;
 * when it isn't known yet the bump stays null and is filled in at anchor time.
 */
export async function extractProvenanceRecord(
  bytes: Uint8Array,
  providerAddress: Address | null,
): Promise<ProvenanceRecordData> {
  const [fileHash, c2pa] = await Promise.all([computeSHA256(bytes), computeC2paManifestHash(bytes)]);
  return {
    provider: PROVIDER_NAME,
    file_hash: fileHash,
    perceptual_hash: computePHash(bytes),
    c2pa_manifest_hash: c2pa,
    creator: null,
    slot: null,
    generated_at: Math.floor(Date.now() / 1000),
    bump: providerAddress ? (await deriveRecordPda(providerAddress, fileHash)).bump : null,
  };
}
