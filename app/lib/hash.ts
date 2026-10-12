export const NEAR_MATCH_THRESHOLD = 12;

const ZERO = BigInt(0);
const ONE = BigInt(1);

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export async function computeSHA256(data: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    // WebCrypto only exists in secure contexts (https or localhost).
    throw new Error("Hashing needs a secure connection. Open this page over https (or on localhost).");
  }
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 64-bit dHash over raw bytes: bit i is set when chunk i's average exceeds the
// next chunk's average (the last chunk wraps around to compare with the first).
export function computePHash(data: Uint8Array): bigint {
  const CHUNKS = 64;
  const size = Math.max(1, Math.floor(data.length / CHUNKS));
  const avgs: number[] = [];
  for (let i = 0; i < CHUNKS; i++) {
    const start = i * size;
    const end = i === CHUNKS - 1 ? data.length : Math.min(start + size, data.length);
    let sum = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
      n++;
    }
    avgs.push(n ? sum / n : 0);
  }
  let hash = ZERO;
  for (let i = 0; i < CHUNKS; i++) {
    if (avgs[i] > avgs[(i + 1) % CHUNKS]) hash |= ONE << BigInt(i);
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > ZERO) {
    count += Number(x & ONE);
    x >>= ONE;
  }
  return count;
}
