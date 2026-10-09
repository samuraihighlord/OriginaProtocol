/**
 * The AI model that generated an image. The Origina program has no model field, so the model travels in the
 * same transaction as the record, as a standard Solana Memo (see AnchorMemo).
 */

export const MODEL_OPTIONS = [
  "Midjourney",
  "DALL-E 3",
  "Stable Diffusion XL",
  "Adobe Firefly",
  "Flux",
  "Imagen",
  "Ideogram",
] as const;

export const OTHER_MODEL = "Other";

export const MAX_MODEL_LENGTH = 64;

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._+\-/]*$/;

/** Trims and validates a model name; null when it is empty, too long or contains unsupported characters. */
export function normalizeModel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const model = input.trim().replace(/\s+/g, " ");
  if (model.length === 0 || model.length > MAX_MODEL_LENGTH) return null;
  return MODEL_PATTERN.test(model) ? model : null;
}

const MEMO_V1 = "origina:v1 model=";
const MEMO_V2 = "origina:v2 ";

/**
 * Everything the record's account can't hold travels in the same transaction as a Memo: the provider name, the
 * model, the slot the browser observed and the PDA bump. (The account itself has the provider's pubkey, the program's
 * own slot and bump, and the fingerprints.) Compact JSON after a version prefix.
 */
export interface AnchorMemo {
  provider: string;
  model: string;
  slot: number;
  bump: number;
}

export const anchorMemoText = (memo: AnchorMemo) =>
  `${MEMO_V2}${JSON.stringify({ provider: memo.provider, model: memo.model, slot: memo.slot, bump: memo.bump })}`;

/** Reads a memo back. Memos are untrusted on-chain data, so every field is validated; null when it isn't ours. */
export function parseAnchorMemo(memo: unknown): Partial<AnchorMemo> & { model: string } | null {
  if (typeof memo !== "string") return null;
  if (memo.startsWith(MEMO_V1)) {
    const model = normalizeModel(memo.slice(MEMO_V1.length));
    return model ? { model } : null;
  }
  if (!memo.startsWith(MEMO_V2)) return null;
  try {
    const data = JSON.parse(memo.slice(MEMO_V2.length)) as Record<string, unknown>;
    const model = normalizeModel(data.model);
    if (!model) return null;
    return {
      model,
      provider: typeof data.provider === "string" && data.provider.length <= 32 ? data.provider : undefined,
      slot: Number.isSafeInteger(data.slot) && (data.slot as number) >= 0 ? (data.slot as number) : undefined,
      bump: Number.isInteger(data.bump) && (data.bump as number) >= 0 && (data.bump as number) <= 255 ? (data.bump as number) : undefined,
    };
  } catch {
    return null;
  }
}
