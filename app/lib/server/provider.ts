import { type KeyPairSigner, createKeyPairSignerFromBytes } from "@solana/kit";
import { AnchorApiError } from "./errors";

const NOT_CONFIGURED = "Anchoring isn't available yet: Origina's provider wallet hasn't been set up on the server.";

let cached: Promise<KeyPairSigner> | null = null;

/**
 * Origina's provider wallet: the registry-approved provider that signs every record (and pays for wallet-less ones).
 * The secret key lives only in the server-side env var ORIGINA_PROVIDER_SECRET_KEY, as the JSON byte array that
 * `solana-keygen new` writes. It is never sent to the browser and never logged.
 */
export function getProviderSigner(): Promise<KeyPairSigner> {
  if (!cached) {
    cached = load().catch((err) => {
      cached = null; // let a fixed configuration be picked up without a restart
      throw err;
    });
  }
  return cached;
}

async function load(): Promise<KeyPairSigner> {
  const raw = process.env.ORIGINA_PROVIDER_SECRET_KEY;
  if (!raw) {
    console.error("ORIGINA_PROVIDER_SECRET_KEY is not set; anchoring is unavailable.");
    throw new AnchorApiError(503, NOT_CONFIGURED, undefined, "not-configured");
  }
  try {
    const bytes = new Uint8Array(JSON.parse(raw));
    return await createKeyPairSignerFromBytes(bytes);
  } catch {
    console.error("ORIGINA_PROVIDER_SECRET_KEY is not a valid 64-byte key array; anchoring is unavailable.");
    throw new AnchorApiError(503, NOT_CONFIGURED, undefined, "not-configured");
  }
}
