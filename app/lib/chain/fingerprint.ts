import type { ReadonlyUint8Array } from "@solana/kit";
import { PerceptualAlg } from "../generated/origina/src/generated";
import { computeSHA256 } from "../hash";

export function hexToBytes(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})+$/i.test(hex)) throw new Error("Invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: ReadonlyUint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const ZERO = BigInt(0);
const BYTE = BigInt(8);
const MASK = BigInt(0xff);

/**
 * The program stores a 32-byte perceptual hash tagged with an algorithm. Our pHash is 64 bits,
 * so it is packed big-endian into the first 8 bytes and the remaining 24 bytes are zero.
 * The record's `perceptual` is left unset when the hash is all zeros (the program rejects a zero hash).
 */
export function packPerceptualHash(phash: bigint): { alg: PerceptualAlg; hash: Uint8Array } | null {
  if (phash === ZERO) return null;
  const hash = new Uint8Array(32);
  let v = phash;
  for (let i = 7; i >= 0; i--) {
    hash[i] = Number(v & MASK);
    v >>= BYTE;
  }
  return { alg: PerceptualAlg.PHash, hash };
}

/** Inverse of packPerceptualHash for PHash records; returns null for other algorithms or non-packed data. */
export function unpackPerceptualHash(alg: PerceptualAlg, hash: ReadonlyUint8Array): bigint | null {
  if (alg !== PerceptualAlg.PHash) return null;
  if (hash.slice(8).some((b) => b !== 0)) return null;
  let v = ZERO;
  for (let i = 0; i < 8; i++) v = (v << BYTE) | BigInt(hash[i]);
  return v;
}

/**
 * The program requires a non-zero `c2pa_manifest_hash`, but this app does not read C2PA manifests yet.
 * Until it does, records carry this fixed sentinel (SHA-256 of the string below) meaning "no C2PA manifest".
 */
export const NO_C2PA_MANIFEST_LABEL = "origina:no-c2pa-manifest:v1";

export async function noC2paManifestHash(): Promise<Uint8Array> {
  return hexToBytes(await computeSHA256(new TextEncoder().encode(NO_C2PA_MANIFEST_LABEL)));
}
