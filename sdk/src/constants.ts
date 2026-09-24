import { PublicKey } from "@solana/web3.js";

export const SEED_PREFIX = "provenance";

/**
 * Placeholder program ID. Replace after running `anchor build && anchor
 * keys sync && anchor deploy` — see README "Quick start".
 */
export const DEFAULT_PROGRAM_ID = new PublicKey(
  "EyfitU6WEPfrtmvGxhzZdn8vruro2SY4oaeNtAFST6g4"
);

export const DEFAULT_API_BASE_URL = "http://localhost:3001";

export const EXPLORER_BASE_URL = "https://explorer.solana.com";
