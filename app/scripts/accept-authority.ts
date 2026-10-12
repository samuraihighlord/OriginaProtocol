/**
 * Step 2 of handing the registry to a new authority: the SUCCESSOR accepts. Only works after the current authority
 * has proposed this exact wallet. Afterwards this wallet is the registry authority (it can approve and revoke
 * providers), and the previous authority no longer is.
 *
 *   NEW_AUTHORITY_KEYPAIR=<the successor's keypair file> pnpm --filter @origina/app accept:authority
 *
 * The successor's wallet needs a little SOL for the transaction fee. Optional: RPC_URL (default public devnet).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient, createKeyPairSignerFromBytes, isSome } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import { fetchMaybeRegistryAccount, findRegistryAccountPda, getAcceptAuthorityInstructionAsync } from "../lib/generated/origina/src/generated";

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
  const keyPath = process.env.NEW_AUTHORITY_KEYPAIR;
  if (!keyPath) fail("Set NEW_AUTHORITY_KEYPAIR to your keypair file (the wallet that was proposed as the new authority).");
  const path = keyPath!.startsWith("~") ? keyPath!.replace("~", homedir()) : keyPath!;
  let me;
  try {
    me = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
  } catch {
    return fail(`Couldn't read a keypair from ${path}. It should be the JSON file solana-keygen wrote.`);
  }

  const client = createClient().use(signer(me)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL })) as any;
  console.log(`Network:    ${RPC_URL}`);
  console.log(`Your wallet: ${me.address}`);

  const [registryPda] = await findRegistryAccountPda();
  const registry = await fetchMaybeRegistryAccount(client.rpc, registryPda);
  if (!registry.exists) fail("\nThe registry hasn't been initialised on this network yet.");
  console.log(`Current registry authority: ${registry.data.authority}`);

  if (registry.data.authority === me.address) return console.log("\nThis wallet is already the registry authority. Nothing to do.");
  if (!isSome(registry.data.pendingAuthority) || registry.data.pendingAuthority.value !== me.address) {
    const pending = isSome(registry.data.pendingAuthority) ? registry.data.pendingAuthority.value : "nobody";
    fail(`\nNo transfer to this wallet is pending (pending successor: ${pending}).\nThe current authority has to run propose:authority for ${me.address} first.`);
  }
  const { value: balance } = await client.rpc.getBalance(me.address).send();
  if (balance === 0n) fail("\nThis wallet has no SOL for the transaction fee. Fund it (faucet.solana.com on devnet) and run this again.");

  const { context } = await client.sendTransaction([await getAcceptAuthorityInstructionAsync({ newAuthority: me })]);
  console.log(`\nAccepted. This wallet is now the registry authority. Transaction: ${explorerTx(context.signature)}`);
  console.log("You can now approve providers with: pnpm approve:provider (using this wallet's keypair as AUTHORITY_KEYPAIR).");
}

main().catch((err) => fail(`\nFailed: ${err instanceof Error ? err.message : err}`));
