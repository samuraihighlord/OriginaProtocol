import type { AnchorUnavailableReason } from "../anchorApi";

/** An error whose message is safe to show to the caller, with the HTTP status the API route should answer with. */
export class AnchorApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
    /** Set when anchoring is unavailable for an operational reason (see AnchorStatus). */
    public readonly reason?: AnchorUnavailableReason,
  ) {
    super(message);
  }
}
