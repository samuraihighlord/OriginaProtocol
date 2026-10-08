/** Request/response shapes shared by the anchor API routes (pages/api/anchor/*) and the browser client. */

export interface AnchorFields {
  /** Hex SHA-256 of the file. */
  sha256: string;
  /** 64-bit perceptual hash, 0x-prefixed hex. */
  phash: string;
  /** Model that generated the image. */
  model: string;
  /** The user's wallet; it co-signs the transaction and is recorded as the creator. */
  creator: string;
}

export type PrepareResponse =
  | { alreadyAnchored: true; recordAddress: string }
  | {
      alreadyAnchored: false;
      recordAddress: string;
      /** Base64 wire-format transaction, not yet signed by anyone. */
      transaction: string;
    };

export interface SubmitRequest extends AnchorFields {
  /** Base64 wire-format transaction signed by the user's wallet. */
  transaction: string;
}

export interface SubmitResponse {
  signature: string;
  recordAddress: string;
}

export interface ApiErrorBody {
  error: string;
}

/** An error answered by the anchor API; its message is already written for the user. */
export class AnchorApiResponseError extends Error {}
