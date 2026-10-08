import {
  type Address,
  type Transaction,
  type TransactionSigner,
  address,
  getBase64Encoder,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  isTransactionModifyingSigner,
  isTransactionPartialSigner,
} from "@solana/kit";
import { AnchorApiResponseError, type AnchorFields, type ApiErrorBody, type PrepareResponse, type SubmitResponse } from "../anchorApi";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Origina. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !data) throw new AnchorApiResponseError(data?.error ?? "Something went wrong. Please try again.");
  return data;
}

/** Has the user's wallet sign the transaction (without sending it), keeping any signatures already on it. */
async function signWithWallet(signer: TransactionSigner, transaction: Transaction): Promise<Transaction> {
  if (isTransactionModifyingSigner(signer)) {
    const [signed] = await signer.modifyAndSignTransactions([transaction]);
    return signed;
  }
  if (isTransactionPartialSigner(signer)) {
    // A decoded transaction is already compiled; Kit's size-limit brand is enforced by the server (it caps the size).
    const [signatures] = await signer.signTransactions([transaction as Parameters<typeof signer.signTransactions>[0][number]]);
    return { ...transaction, signatures: { ...transaction.signatures, ...signatures } };
  }
  throw new Error("This wallet can only sign and send in one step, which Origina doesn't support. Try another wallet.");
}

export type CosignOutcome = { kind: "anchored"; signature: string; recordAddress: Address } | { kind: "already-anchored"; recordAddress: Address };

/**
 * Anchors a file through Origina: the server builds the transaction (Origina pays and signs as the registered
 * provider), the user's wallet co-signs it as the creator, and the server adds its signature last and submits it.
 * The wallet never pays; it only approves being recorded as the creator.
 */
export async function anchorWithOrigina(signer: TransactionSigner, fields: Omit<AnchorFields, "creator">): Promise<CosignOutcome> {
  const request: AnchorFields = { ...fields, creator: signer.address };

  const prepared = await postJson<PrepareResponse>("/api/anchor/prepare", request);
  const recordAddress = address(prepared.recordAddress);
  if (prepared.alreadyAnchored) return { kind: "already-anchored", recordAddress };

  const unsigned = getTransactionDecoder().decode(getBase64Encoder().encode(prepared.transaction));
  const signed = await signWithWallet(signer, unsigned);

  const submitted = await postJson<SubmitResponse>("/api/anchor/submit", {
    ...request,
    transaction: getBase64EncodedWireTransaction(signed),
  });
  return { kind: "anchored", signature: submitted.signature, recordAddress };
}
