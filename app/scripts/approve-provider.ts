/**
 * Approves a provider wallet in the Origina registry. Only the registry authority can do this, so run it with the
 * authority's keypair. It checks that before sending anything and only sends when the approval is actually needed.
 *
 *   AUTHORITY_KEYPAIR=~/.config/solana/origina.json \
 *   PROVIDER_ADDRESS=<the provider wallet address> \
 *   pnpm --filter @origina/app approve:provider
 *
 * Optional: PROVIDER_NAME (default "Origina"), RPC_URL (default public devnet), C2PA_CERT_IDENTITY (64 hex chars).
 * The keypair file is read locally and never printed or sent.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { address, createClient, createKeyPairSignerFromBytes, isAddress } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import {
  fetchMaybeRegistryAccount,
  findRegistryAccountPda,
  getApproveProviderInstructionAsync,
} from "../lib/generated/origina/src/generated";
import { getProviderStatus } from "../lib/chain/chain";

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
  const providerRaw = process.env.PROVIDER_ADDRESS;
  const name = (process.env.PROVIDER_NAME ?? "Origina").trim();
  if (!keyPath) fail("Set AUTHORITY_KEYPAIR to the registry authority's keypair file, e.g. ~/.config/solana/origina.json");
  if (!providerRaw || !isAddress(providerRaw)) fail("Set PROVIDER_ADDRESS to the provider wallet's address (the public address, not a key).");
  if (!name || name.length > 32) fail("PROVIDER_NAME must be 1 to 32 characters.");

  const path = keyPath!.startsWith("~") ? keyPath!.replace("~", homedir()) : keyPath!;
  let authority;
  try {
    authority = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
  } catch {
    return fail(`Couldn't read a keypair from ${path}. It should be the JSON file solana-keygen wrote.`);
  }
  const provider = address(providerRaw!);

  // The program stores a 32-byte identifier of the provider's C2PA signing certificate and rejects all zeros.
  // Origina has no C2PA certificate, so by default this is a fixed, labelled value rather than a real one.
  const certHex = process.env.C2PA_CERT_IDENTITY ?? createHash("sha256").update("origina:no-c2pa-certificate:v1").digest("hex");
  if (!/^[0-9a-f]{64}$/i.test(certHex) || /^0+$/.test(certHex)) fail("C2PA_CERT_IDENTITY must be 64 hex characters and not all zero.");
  const c2paCertIdentity = new Uint8Array(Buffer.from(certHex, "hex"));

  const client = createClient().use(signer(authority)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL })) as any;
  console.log(`Network:            ${RPC_URL}`);
  console.log(`Signing as:         ${authority.address}`);
  console.log(`Approving provider: ${provider}  (name "${name}")`);

  // Only the registry authority can approve: say so before sending anything.
  const [registryPda] = await findRegistryAccountPda();
  const registry = await fetchMaybeRegistryAccount(client.rpc, registryPda);
  if (!registry.exists) fail("\nThe registry hasn't been initialised on this network yet (init_registry has not been run).");
  if (registry.data.authority !== authority.address) {
    fail(`\nThis key is not the registry authority.\n  registry authority: ${registry.data.authority}\n  this key:           ${authority.address}\nUse the authority's keypair.`);
  }

  const status = await getProviderStatus(client.rpc, provider);
  if (status.kind === "active") return console.log(`\nAlready active as "${status.name}". Nothing to do.`);
  if (status.kind === "pending") return console.log(`\nAlready approved as "${status.name}" and waiting for the provider to claim it. Nothing to do.`);
  if (status.kind === "revoked") fail(`\nThis provider was revoked ("${status.name}"). Revocation is permanent; a new wallet is needed.`);

  const { context } = await client.sendTransaction([
    await getApproveProviderInstructionAsync({ authority, provider, name, c2paCertIdentity }),
  ]);
  console.log(`\nApproved. Transaction: ${explorerTx(context.signature)}`);
  console.log("The provider wallet now claims it with: pnpm claim:provider");
}

main().catch((err) => fail(`\nFailed: ${err instanceof Error ? err.message : err}`));
