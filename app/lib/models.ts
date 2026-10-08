/**
 * The AI model that generated an image. The Origina program has no model field, so the model travels in the
 * same transaction as the record, as a standard Solana Memo: `origina:v1 model=<name>`.
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

const MEMO_PREFIX = "origina:v1 model=";

export const modelMemoText = (model: string) => `${MEMO_PREFIX}${model}`;

/** Reads a model back out of a memo. Memos are untrusted on-chain data, so anything unexpected is ignored. */
export function parseModelMemo(memo: unknown): string | null {
  if (typeof memo !== "string" || !memo.startsWith(MEMO_PREFIX)) return null;
  return normalizeModel(memo.slice(MEMO_PREFIX.length));
}
