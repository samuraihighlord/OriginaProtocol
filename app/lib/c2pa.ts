import { computeSHA256 } from "./hash";

/** JUMBF box type "jumb" — the container C2PA manifests live in. */
const JUMBF_SIGNATURE = [0x6a, 0x75, 0x6d, 0x62];
/** Only the start of the file is scanned: embedded manifests sit in the first segments of JPEG/PNG/WebP. */
const SCAN_LIMIT = 65536;
/** A box is at least its 4-byte length plus its 4-byte type. */
const MIN_BOX_LENGTH = 8;

/**
 * Finds a JUMBF box in the first 64 KiB and returns its bytes: from the signature's offset to that offset plus the
 * big-endian 4-byte length that immediately precedes the signature (clamped to the end of the file).
 * Null when there is no box, or the length field is not a usable length (0 and 1 mean "to end" / "extended length").
 */
export function findC2paManifestBytes(data: Uint8Array): Uint8Array | null {
  const limit = Math.min(data.length, SCAN_LIMIT) - JUMBF_SIGNATURE.length;
  for (let offset = 4; offset <= limit; offset++) {
    if (
      data[offset] !== JUMBF_SIGNATURE[0] ||
      data[offset + 1] !== JUMBF_SIGNATURE[1] ||
      data[offset + 2] !== JUMBF_SIGNATURE[2] ||
      data[offset + 3] !== JUMBF_SIGNATURE[3]
    ) {
      continue;
    }
    const length = ((data[offset - 4] << 24) | (data[offset - 3] << 16) | (data[offset - 2] << 8) | data[offset - 1]) >>> 0;
    if (length < MIN_BOX_LENGTH) continue;
    return data.subarray(offset, Math.min(offset + length, data.length));
  }
  return null;
}

/** Hex SHA-256 of the embedded C2PA manifest box, or null if the image carries none. */
export async function computeC2paManifestHash(data: Uint8Array): Promise<string | null> {
  const manifest = findC2paManifestBytes(data);
  return manifest ? computeSHA256(manifest) : null;
}
