import {
  type Address,
  type Blockhash,
  type Instruction,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getUtf8Encoder,
  none,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  some,
} from "@solana/kit";
import { ORIGINA_PROGRAM_ADDRESS, getAnchorMediaInstructionAsync } from "../generated/origina/src/generated";
import { eventAuthority } from "../chain/chain";
import { hexToBytes, noC2paManifestHash, packPerceptualHash } from "../chain/fingerprint";
import { modelMemoText } from "../models";

/** The SPL Memo program (v2). */
export const MEMO_PROGRAM_ADDRESS = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface AnchorTxInput {
  provider: Address;
  creator: Address;
  sha256Hex: string;
  phash: bigint;
  model: string;
  blockhash: Blockhash;
}

/**
 * The one transaction Origina ever signs: `anchor_media` (provider = Origina pays and signs, creator = the user's
 * wallet co-signs) plus a Memo recording the model. Built deterministically from the inputs so that, at submit time,
 * the server can rebuild it from what the user claims to have anchored and require the signed bytes to match exactly.
 * Nothing is signed here; the signers are placeholders that only mark which accounts must sign.
 */
export async function buildAnchorTransaction(input: AnchorTxInput) {
  const perceptual = packPerceptualHash(input.phash);
  const anchorIx = await getAnchorMediaInstructionAsync({
    provider: createNoopSigner(input.provider),
    creator: createNoopSigner(input.creator),
    eventAuthority: await eventAuthority(),
    program: ORIGINA_PROGRAM_ADDRESS,
    fileSha256: hexToBytes(input.sha256Hex),
    perceptual: perceptual ? some(perceptual) : none(),
    c2paManifestHash: await noC2paManifestHash(),
    generatedAt: none(),
  });
  const memoIx: Instruction = {
    programAddress: MEMO_PROGRAM_ADDRESS,
    data: getUtf8Encoder().encode(modelMemoText(input.model)),
  };

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(input.provider), m),
    // The block height is only used by senders that track expiry; the transaction bytes do not contain it.
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: input.blockhash, lastValidBlockHeight: BigInt(0) }, m),
    (m) => appendTransactionMessageInstructions([anchorIx, memoIx], m),
  );
  return compileTransaction(message);
}
