import {
  AccountRole,
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
import { anchorMemoText } from "../models";

/** The SPL Memo program (v2). */
export const MEMO_PROGRAM_ADDRESS = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");

/** SystemProgram::Transfer: instruction index 2 (u32 LE), then the amount (u64 LE). */
function transferData(lamports: bigint): Uint8Array {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return data;
}

export interface AnchorTxInput {
  provider: Address;
  /**
   * The wallet that co-signs as creator, or null to record no creator. A creator also pays: it is the transaction's
   * fee payer and reimburses Origina for the record's rent. With no creator, Origina is the fee payer and pays.
   */
  creator: Address | null;
  /** The record account's rent-exempt deposit; the creator sends exactly this to Origina. Required with a creator. */
  rentLamports: bigint;
  fileHashHex: string;
  phash: bigint;
  /** Hex SHA-256 of the image's C2PA manifest; null when it has none (the sentinel is stored instead). */
  c2paManifestHashHex: string | null;
  /** Unix seconds. */
  generatedAt: number;
  /** Written to the memo. */
  model: string;
  slot: number;
  bump: number;
  blockhash: Blockhash;
}

/** The instructions of the anchor transaction, in order: [creator reimburses Origina,] anchor_media, memo. */
export async function buildAnchorInstructions(input: AnchorTxInput) {
  const perceptual = packPerceptualHash(input.phash);
  const anchorIx = await getAnchorMediaInstructionAsync({
    provider: createNoopSigner(input.provider),
    ...(input.creator ? { creator: createNoopSigner(input.creator) } : {}),
    eventAuthority: await eventAuthority(),
    program: ORIGINA_PROGRAM_ADDRESS,
    fileSha256: hexToBytes(input.fileHashHex),
    perceptual: perceptual ? some(perceptual) : none(),
    c2paManifestHash: input.c2paManifestHashHex ? hexToBytes(input.c2paManifestHashHex) : await noC2paManifestHash(),
    generatedAt: some(BigInt(input.generatedAt)),
  });
  const memoIx: Instruction = {
    programAddress: MEMO_PROGRAM_ADDRESS,
    data: getUtf8Encoder().encode(
      anchorMemoText({ provider: "origina", model: input.model, slot: input.slot, bump: input.bump }),
    ),
  };
  // Origina fronts the record's rent inside the program (the program charges the provider); the creator pays it
  // back in the same transaction, ahead of anchor_media, so Origina ends up exactly where it started.
  const reimburseIx: Instruction | null = input.creator
    ? {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        accounts: [
          { address: input.creator, role: AccountRole.WRITABLE_SIGNER, signer: createNoopSigner(input.creator) },
          { address: input.provider, role: AccountRole.WRITABLE },
        ] as never,
        data: transferData(input.rentLamports),
      }
    : null;
  return { reimburseIx, anchorIx, memoIx };
}

/**
 * The transaction Origina signs: `anchor_media` (provider = Origina signs; creator = the user's wallet co-signs
 * when there is one) plus a Memo. With a creator, the creator is the fee payer and reimburses the rent. Built
 * deterministically from the inputs so that, at submit time, the server can rebuild it from what the user claims
 * to have anchored and check what was signed against it.
 * Nothing is signed here; the signers are placeholders that only mark which accounts must sign.
 */
export async function buildAnchorTransaction(input: AnchorTxInput) {
  const { reimburseIx, anchorIx, memoIx } = await buildAnchorInstructions(input);
  const instructions = reimburseIx ? [reimburseIx, anchorIx, memoIx] : [anchorIx, memoIx];
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(input.creator ?? input.provider), m),
    // The block height is only used by senders that track expiry; the transaction bytes do not contain it.
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: input.blockhash, lastValidBlockHeight: BigInt(0) }, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return compileTransaction(message);
}
