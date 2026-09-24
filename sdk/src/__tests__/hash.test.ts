import { sha256, computePhash, hammingDistance, comparePhash } from "../hash";

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

/** Monotonic ramp so chunk averages trend in one direction — gives computePhash a stable, non-degenerate signal (a uniform buffer produces an all-zero phash regardless of value, which is useless for a "different data" comparison). */
function rampBytes(length: number, ascending: boolean): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const v = i % 256;
    out[i] = ascending ? v : 255 - v;
  }
  return out;
}

describe("sha256", () => {
  it("produces a 32-byte hash", async () => {
    const hash = await sha256(randomBytes(1024));
    expect(hash.length).toBe(32);
  });

  it("is deterministic", async () => {
    const data = randomBytes(2048);
    const first = await sha256(data);
    const second = await sha256(data);
    expect(Buffer.from(first)).toEqual(Buffer.from(second));
  });

  it("produces different hashes for different inputs", async () => {
    const a = await sha256(new Uint8Array([1, 2, 3, 4]));
    const b = await sha256(new Uint8Array([1, 2, 3, 5]));
    expect(Buffer.from(a)).not.toEqual(Buffer.from(b));
  });
});

describe("computePhash", () => {
  it("produces a bigint", () => {
    const phash = computePhash(randomBytes(4096));
    expect(typeof phash).toBe("bigint");
  });

  it("is consistent for the same data", () => {
    const data = randomBytes(4096);
    expect(computePhash(data)).toBe(computePhash(data));
  });
});

describe("hammingDistance", () => {
  it("is 0 for identical hashes", () => {
    const data = randomBytes(4096);
    const phash = computePhash(data);
    expect(hammingDistance(phash, phash)).toBe(0);
  });

  it("is small for similar data", () => {
    const base = randomBytes(4096);
    const similar = new Uint8Array(base);
    // Flip a single byte deep inside one chunk — most chunk averages are unaffected.
    similar[2048] = (similar[2048] + 1) % 256;

    const distance = hammingDistance(computePhash(base), computePhash(similar));
    expect(distance).toBeLessThan(12);
  });

  it("is large for different data", () => {
    const a = rampBytes(4096, true);
    const b = rampBytes(4096, false);

    const distance = hammingDistance(computePhash(a), computePhash(b));
    expect(distance).toBeGreaterThan(32);
  });
});

describe("comparePhash", () => {
  it("returns 'exact' for identical hashes", () => {
    const data = randomBytes(4096);
    const phash = computePhash(data);
    expect(comparePhash(phash, phash)).toBe("exact");
  });

  it("returns 'different' for unrelated data", () => {
    const a = rampBytes(4096, true);
    const b = rampBytes(4096, false);
    expect(comparePhash(computePhash(a), computePhash(b))).toBe("different");
  });
});
