/**
 * Hashing primitives for Origina Protocol. sha256 is the exact-match
 * fingerprint (32 bytes); computePhash is a coarse, dependency-free
 * perceptual hash used only to flag "probably the same media, lightly
 * modified" — it samples raw file bytes, not decoded pixels, so it is a
 * deliberate MVP approximation, not a true image perceptual hash.
 */

const PHASH_CHUNKS = 64;
export const NEAR_MATCH_THRESHOLD = 12;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.crypto?.subtle !== "undefined";
}

/** SHA-256 of `data`. Uses Web Crypto in the browser, Node's crypto module on the server. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (isBrowser()) {
    const digest = await window.crypto.subtle.digest("SHA-256", toArrayBuffer(data));
    return new Uint8Array(digest);
  }
  const { createHash } = await import("crypto");
  return new Uint8Array(createHash("sha256").update(data).digest());
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * 64-bit difference hash (dHash). Samples `data` into 64 chunks, averages
 * each chunk, and sets bit i when chunk[i]'s average exceeds the next
 * chunk's average (wrapping around), producing a deterministic bigint.
 */
export function computePhash(data: Uint8Array): bigint {
  if (data.length === 0) {
    return 0n;
  }

  const chunkSize = Math.max(1, Math.floor(data.length / PHASH_CHUNKS));
  const averages: number[] = [];

  for (let i = 0; i < PHASH_CHUNKS; i++) {
    const start = i * chunkSize;
    const end = i === PHASH_CHUNKS - 1 ? data.length : Math.min(start + chunkSize, data.length);

    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
      count++;
    }
    averages.push(count > 0 ? sum / count : 0);
  }

  let hash = 0n;
  for (let i = 0; i < PHASH_CHUNKS; i++) {
    const left = averages[i];
    const right = averages[(i + 1) % PHASH_CHUNKS];
    hash = (hash << 1n) | (left > right ? 1n : 0n);
  }

  return hash;
}

/** Converts bytes to a lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Converts a lowercase hex string back to bytes. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Number of differing bits between two 64-bit perceptual hashes. */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** Classifies two perceptual hashes as an exact, near, or different match. */
export function comparePhash(a: bigint, b: bigint): "exact" | "near" | "different" {
  const distance = hammingDistance(a, b);
  if (distance === 0) return "exact";
  if (distance < NEAR_MATCH_THRESHOLD) return "near";
  return "different";
}
