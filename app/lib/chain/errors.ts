import { SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, isSolanaError } from "@solana/kit";
import { getOriginaErrorMessage, type OriginaError } from "../generated/origina/src/generated";
import { InsufficientFundsError } from "./chain";

const SOL = 1_000_000_000;

function customProgramErrorCode(err: unknown): number | null {
  // Preflight failures wrap the instruction error a few levels down the cause chain.
  for (let e: unknown = err, depth = 0; e && depth < 6; e = (e as { cause?: unknown }).cause, depth++) {
    if (isSolanaError(e, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) return e.context.code;
  }
  return null;
}

/** Turns anything thrown while talking to the wallet / RPC / program into a message a user can act on. */
export function describeChainError(err: unknown): string {
  if (err instanceof InsufficientFundsError) {
    return `Not enough SOL: this anchor needs about ${(Number(err.needed) / SOL).toFixed(4)} SOL (record rent plus fee) and the wallet has ${(Number(err.have) / SOL).toFixed(4)} SOL.`;
  }

  const code = customProgramErrorCode(err);
  if (code !== null) {
    try {
      return `The Origina program rejected this: ${getOriginaErrorMessage(code as OriginaError)}.`;
    } catch {
      return `The Origina program rejected this (error ${code}).`;
    }
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/reject|denied|declin|cancel|user closed/i.test(message)) return "The request was declined in your wallet.";
  if (/blockhash|expired/i.test(message)) return "The transaction expired before it confirmed. Please try again.";
  if (/failed to fetch|network|timed? ?out|429|too many requests|rate/i.test(message)) {
    return "Couldn't reach the Solana network (the public RPC may be busy). Please try again in a moment.";
  }
  return message;
}
