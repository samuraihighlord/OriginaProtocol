import { type Address, type ReadonlyUint8Array, address, getCompiledTransactionMessageDecoder } from "@solana/kit";
import { AnchorApiError } from "./errors";

const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");
/** Phantom's transaction guard: it appends assertion instructions that only read the wallet's own accounts. */
const LIGHTHOUSE_PROGRAM = address("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95");

/** Priority fees are capped (0.1 lamport per compute unit): a wallet may add one, but not an extravagant one. */
const MAX_PRIORITY_MICROLAMPORTS = BigInt(100_000);
const MAX_EXTRA_INSTRUCTIONS = 6;

interface ResolvedInstruction {
  program: Address;
  accounts: Address[];
  data: Uint8Array;
}

interface ResolvedMessage {
  signers: Address[];
  feePayer: Address;
  instructions: ResolvedInstruction[];
  /** Per account: [isSigner, isWritable], for the accounts the instructions reference. */
  roles: Map<Address, { signer: boolean; writable: boolean }>;
}

const mismatch = () =>
  new AnchorApiError(400, "The signed transaction doesn't match this anchor. If your wallet modified it, try another wallet.");

function resolve(messageBytes: ReadonlyUint8Array): ResolvedMessage {
  const compiled = getCompiledTransactionMessageDecoder().decode(messageBytes);
  // We only build legacy/v0 messages without lookup tables; anything else is not our transaction.
  if (compiled.version !== 0 && compiled.version !== "legacy") throw mismatch();
  if (compiled.version === 0 && compiled.addressTableLookups && compiled.addressTableLookups.length > 0) throw mismatch();
  const keys = compiled.staticAccounts;
  const { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts } = compiled.header;
  const roles = new Map<Address, { signer: boolean; writable: boolean }>();
  keys.forEach((key, i) => {
    const signer = i < numSignerAccounts;
    const writable = signer ? i < numSignerAccounts - numReadonlySignerAccounts : i < keys.length - numReadonlyNonSignerAccounts;
    roles.set(key, { signer, writable });
  });
  return {
    signers: keys.slice(0, numSignerAccounts),
    feePayer: keys[0],
    roles,
    instructions: compiled.instructions.map((ix) => ({
      program: keys[ix.programAddressIndex],
      accounts: (ix.accountIndices ?? []).map((i) => keys[i]),
      data: ix.data ? new Uint8Array(ix.data) : new Uint8Array(),
    })),
  };
}

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) =>
  a.length === b.length && Array.prototype.every.call(a, (v, i) => v === b[i]);

const sameInstruction = (a: ResolvedInstruction, b: ResolvedInstruction) =>
  a.program === b.program && a.accounts.length === b.accounts.length && a.accounts.every((k, i) => k === b.accounts[i]) && sameBytes(a.data, b.data);

/**
 * Decides whether Origina may sign `submitted`. It must contain exactly the instructions the server would build
 * (`expected`), with the same accounts in the same roles, and be signed by exactly the same signers. The one
 * allowance is wallets that append their own guard instructions (Lighthouse) or compute-budget instructions:
 * those may add nothing that touches Origina's wallet, no extra signers, and only a capped priority fee.
 * Anything else — a different memo, another program, an extra signer, Origina's wallet used by another
 * instruction — is refused, so Origina's signature can never be applied to a transaction it did not intend.
 */
export function validateSignedAnchorTransaction(
  expectedBytes: ReadonlyUint8Array,
  submittedBytes: ReadonlyUint8Array,
  provider: Address,
): void {
  let expected: ResolvedMessage;
  let submitted: ResolvedMessage;
  try {
    expected = resolve(expectedBytes);
    submitted = resolve(submittedBytes);
  } catch (err) {
    if (err instanceof AnchorApiError) throw err;
    throw new AnchorApiError(400, "That transaction isn't valid.");
  }

  // The fee payer is the creator when there is one (who then also reimburses the rent), else Origina.
  if (submitted.feePayer !== expected.feePayer) throw mismatch();

  // Same signers, nobody else.
  const wanted = new Set(expected.signers);
  if (submitted.signers.length !== wanted.size || !submitted.signers.every((s) => wanted.has(s))) throw mismatch();

  // Every expected instruction appears exactly once, in order, with unchanged account roles.
  const extras: ResolvedInstruction[] = [];
  let next = 0;
  for (const ix of submitted.instructions) {
    if (next < expected.instructions.length && sameInstruction(ix, expected.instructions[next])) {
      for (const key of ix.accounts) {
        const a = expected.roles.get(key);
        const b = submitted.roles.get(key);
        // The creator is the user's own account: a wallet's guard may mark it writable, which cannot affect Origina.
        const isCreator = key !== provider && wanted.has(key);
        if (!a || !b || a.signer !== b.signer || (!isCreator && a.writable !== b.writable)) throw mismatch();
      }
      next++;
    } else {
      extras.push(ix);
    }
  }
  if (next !== expected.instructions.length) throw mismatch();

  if (extras.length > MAX_EXTRA_INSTRUCTIONS) throw mismatch();
  for (const ix of extras) {
    if (ix.accounts.includes(provider)) throw mismatch();
    if (ix.program === LIGHTHOUSE_PROGRAM) continue;
    if (ix.program === COMPUTE_BUDGET_PROGRAM && ix.accounts.length === 0 && isCappedComputeBudget(ix.data)) continue;
    throw mismatch();
  }
}

/** SetComputeUnitLimit (2), SetComputeUnitPrice (3, capped) and SetLoadedAccountsDataSizeLimit (4) only. */
function isCappedComputeBudget(data: Uint8Array): boolean {
  if (data.length === 0) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  switch (data[0]) {
    case 2:
    case 4:
      return data.length === 5;
    case 3:
      return data.length === 9 && view.getBigUint64(1, true) <= MAX_PRIORITY_MICROLAMPORTS;
    default:
      return false;
  }
}
