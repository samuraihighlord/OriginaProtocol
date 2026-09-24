import { hammingDistance, NEAR_MATCH_THRESHOLD } from "@origina/sdk";
import { all, getBySha256, ProvenanceEntry } from "./store";

export interface VerifyResponseBody {
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

const NOT_FOUND: VerifyResponseBody = {
  found: false,
  exactMatch: false,
  nearMatch: false,
  pHashDistance: null,
  creator: null,
  modelId: null,
  mediaType: null,
  phash: null,
  timestamp: null,
  slot: null,
  pdaAddress: null,
  width: null,
  height: null,
  format: null,
};

function toResponse(
  entry: ProvenanceEntry,
  exactMatch: boolean,
  nearMatch: boolean,
  pHashDistance: number | null
): VerifyResponseBody {
  return {
    found: true,
    exactMatch,
    nearMatch,
    pHashDistance,
    creator: entry.creator,
    modelId: entry.modelId,
    mediaType: entry.mediaType,
    phash: entry.phash,
    timestamp: entry.timestamp,
    slot: entry.slot,
    pdaAddress: entry.pdaAddress,
    width: entry.width,
    height: entry.height,
    format: entry.format,
  };
}

/**
 * Checks the store for an exact SHA-256 match first; if none exists and a
 * perceptual hash was supplied, scans for the closest record within the
 * near-match Hamming distance threshold.
 */
export function verifyFingerprint(sha256Hex: string, phashDecimal?: string): VerifyResponseBody {
  const exact = getBySha256(sha256Hex);
  if (exact) {
    return toResponse(exact, true, false, 0);
  }

  if (!phashDecimal) {
    return NOT_FOUND;
  }

  let queryPhash: bigint;
  try {
    queryPhash = BigInt(phashDecimal);
  } catch {
    return NOT_FOUND;
  }

  let best: { entry: ProvenanceEntry; distance: number } | null = null;
  for (const entry of all()) {
    const distance = hammingDistance(queryPhash, BigInt(entry.phash));
    if (distance < NEAR_MATCH_THRESHOLD && (!best || distance < best.distance)) {
      best = { entry, distance };
    }
  }

  return best ? toResponse(best.entry, false, true, best.distance) : NOT_FOUND;
}
