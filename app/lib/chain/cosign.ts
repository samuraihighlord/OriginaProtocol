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
import {
  AnchorApiResponseError,
  type AnchorFields,
  type AnchorStatus,
  type ApiErrorBody,
  type PrepareResponse,
  type SubmitResponse,
} from "../anchorApi";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new AnchorApiResponseError("Couldn't reach Origina. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !data) throw new AnchorApiResponseError(data?.error ?? "Something went wrong. Please try again.");
  return data;
}

const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Whether Origina can anchor right now, and Origina's provider wallet. Never throws on a failed request. */
export async function fetchAnchorStatus(): Promise<AnchorStatus | null> {
  try {
    return await request<AnchorStatus>("/api/anchor/status");
  } catch {
    return null;
  }
}

/** Can this wallet sign a transaction without sending it? (Wallets that only sign-and-send cannot co-sign.) */
export const canCosign = (signer: TransactionSigner) =>
  isTransactionModifyingSigner(signer) || isTransactionPartialSigner(signer);

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
  throw new AnchorApiResponseError("This wallet can only sign and send in one step, which Origina doesn't support. Try another wallet.");
}

export type CosignOutcome =
  | { kind: "anchored"; signature: string; recordAddress: Address; provider: Address }
  | { kind: "already-anchored"; recordAddress: Address; provider: Address };

/**
 * Anchors a file through Origina. The server builds the transaction (Origina signs as the registered provider);
 * when a wallet is connected it signs first as the creator and pays (fee payer, plus reimbursing the rent), and the
 * server adds its signature last and submits. With no wallet the server signs and submits alone, paying itself, and
 * the record has no creator.
 */
export async function anchorWithOrigina(signer: TransactionSigner | null, fields: AnchorFields): Promise<CosignOutcome> {
  if ((signer?.address ?? null) !== fields.creator) throw new Error("The creator must be the connected wallet.");

  const prepared = await postJson<PrepareResponse>("/api/anchor/prepare", fields);
  const recordAddress = address(prepared.recordAddress);
  const provider = address(prepared.provider);
  if (prepared.alreadyAnchored) return { kind: "already-anchored", recordAddress, provider };

  let transaction: string | null = null;
  if (signer && prepared.transaction) {
    const unsigned = getTransactionDecoder().decode(getBase64Encoder().encode(prepared.transaction));
    transaction = getBase64EncodedWireTransaction(await signWithWallet(signer, unsigned));
  }

  const submitted = await postJson<SubmitResponse>("/api/anchor/submit", { ...fields, transaction });
  return { kind: "anchored", signature: submitted.signature, recordAddress, provider };
}
