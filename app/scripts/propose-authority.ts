/**
 * Step 1 of handing the registry to a new authority: the CURRENT authority names its successor.
 * Nothing changes until the successor runs accept-authority.ts, and the current authority can still cancel.
 *
 *   AUTHORITY_KEYPAIR=<current authority's keypair file> NEW_AUTHORITY=<successor's public address> \
 *   pnpm --filter @origina/app propose:authority
 *
 * Optional: RPC_URL (default public devnet). The keypair is read locally and never printed or sent.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { address, createClient, createKeyPairSignerFromBytes, isAddress, isSome } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import { fetchMaybeRegistryAccount, findRegistryAccountPda, getProposeAuthorityInstructionAsync } from "../lib/generated/origina/src/generated";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = RPC_URL.replace(/^http/, "ws").replace("8899", "8900");
const isLocal = /127\.0\.0\.1|localhost/.test(RPC_URL);
const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${isLocal ? `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}` : "?cluster=devnet"}`;
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

async function main() {
  const keyPath = process.env.AUTHORITY_KEYPAIR;
  const next = process.env.NEW_AUTHORITY;
  if (!keyPath) fail("Set AUTHORITY_KEYPAIR to the current registry authority's keypair file.");
  if (!next || !isAddress(next)) fail("Set NEW_AUTHORITY to the successor's public address (the address, not a key).");

  const path = keyPath!.startsWith("~") ? keyPath!.replace("~", homedir()) : keyPath!;
  let authority;
  try {
    authority = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
  } catch {
    return fail(`Couldn't read a keypair from ${path}. It should be the JSON file solana-keygen wrote.`);
  }
  const successor = address(next!);

  const client = createClient().use(signer(authority)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL })) as any;
  console.log(`Network:            ${RPC_URL}`);
  console.log(`Signing as:         ${authority.address}`);
  console.log(`Proposed successor: ${successor}`);

  const [registryPda] = await findRegistryAccountPda();
  const registry = await fetchMaybeRegistryAccount(client.rpc, registryPda);
  if (!registry.exists) fail("\nThe registry hasn't been initialised on this network yet.");
  if (registry.data.authority !== authority.address) {
    fail(`\nThis key is not the current registry authority.\n  registry authority: ${registry.data.authority}\n  this key:           ${authority.address}`);
  }
  if (successor === authority.address) fail("\nThe successor is already the authority.");
  if (isSome(registry.data.pendingAuthority) && registry.data.pendingAuthority.value === successor) {
    return console.log("\nThis transfer is already proposed and waiting for the successor to accept. Nothing to do.");
  }
  if (isSome(registry.data.pendingAuthority)) {
    console.log(`\nNote: this replaces an earlier proposal for ${registry.data.pendingAuthority.value}.`);
  }

  const { context } = await client.sendTransaction([
    await getProposeAuthorityInstructionAsync({ authority, pendingAuthority: successor }),
  ]);
  console.log(`\nProposed. Transaction: ${explorerTx(context.signature)}`);
  console.log("The registry is unchanged until the successor accepts. They run: pnpm accept:authority");
}

main().catch((err) => fail(`\nFailed: ${err instanceof Error ? err.message : err}`));
