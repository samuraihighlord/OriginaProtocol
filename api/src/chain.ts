import crypto from "crypto";
import bs58 from "bs58";

/**
 * Mock chain clock/signature for the MVP API. This does not submit a real
 * Solana transaction — the reference `anchor_media` program instruction and
 * its integration tests (see /tests) are the source of truth for actual
 * on-chain behavior. Wiring this endpoint to a funded server-side signer
 * (or accepting a client-signed transaction) is a follow-up, not required
 * for the demo flow described in the README.
 */
let mockSlot = 250_000_000;

export function nextMockSlot(): number {
  mockSlot += 1;
  return mockSlot;
}

export function mockSignature(): string {
  return bs58.encode(crypto.randomBytes(64));
}
