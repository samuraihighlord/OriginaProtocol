import { PublicKey } from "@solana/web3.js";
import { DEFAULT_PROGRAM_ID, SEED_PREFIX } from "./constants";

/** Derives the deterministic ProvenanceRecord PDA for a given SHA-256 hash. */
export function deriveProvenancePda(
  sha256Hash: Uint8Array,
  programId: PublicKey = DEFAULT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_PREFIX), Buffer.from(sha256Hash)],
    programId
  );
}
