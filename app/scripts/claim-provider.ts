/**
 * Claims Origina's provider registration once the registry authority has approved its wallet, and reports the
 * wallet's state. Safe to run any number of times: it only sends a transaction when a claim is actually pending.
 *
 *   PROVIDER_KEYPAIR=~/origina-provider.json pnpm --filter @origina/app claim:provider
 *
 * RPC_URL defaults to the public devnet endpoint. The keypair file is read locally and never printed or sent.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient, createKeyPairSignerFromBytes } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import { type ChainClient, claimProvider, getProviderStatus } from "../lib/chain/chain";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = RPC_URL.replace(/^http/, "ws").replace("8899", "8900");
const isLocal = /127\.0\.0\.1|localhost/.test(RPC_URL);
const explorer = (path: string) =>
  `https://explorer.solana.com/${path}${isLocal ? `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}` : "?cluster=devnet"}`;

const SOL = 1_000_000_000;
const MIN_SOL = 0.01;

async function main() {
  const raw = process.env.PROVIDER_KEYPAIR;
  if (!raw) {
    console.error("Set PROVIDER_KEYPAIR to the path of the provider keypair file, e.g. ~/origina-provider.json");
    process.exit(1);
  }
  const path = raw.startsWith("~") ? raw.replace("~", homedir()) : raw;
  let keypair;
  try {
    keypair = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
  } catch {
    console.error(`Couldn't read a keypair from ${path}. It should be the JSON file solana-keygen wrote.`);
    process.exit(1);
  }

  const client = createClient().use(signer(keypair)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: WS_URL })) as unknown as ChainClient;
  const address = keypair.address;
  console.log(`Provider wallet: ${address}`);
  console.log(`Network:         ${RPC_URL}`);

  const { value: balance } = await client.rpc.getBalance(address).send();
  const sol = Number(balance) / SOL;
  console.log(`Balance:         ${sol.toFixed(4)} SOL${sol < MIN_SOL ? "  (low: fund it with devnet SOL, see faucet.solana.com)" : ""}`);

  let status = await getProviderStatus(client.rpc, address);
  console.log(`Registry status: ${status.kind}${"name" in status ? ` ("${status.name}")` : ""}`);

  if (status.kind === "none") {
    console.log("\nNot approved yet. Ask amxrac to approve this address in the registry (name: Origina), then run this again.");
    return;
  }
  if (status.kind === "revoked") {
    console.log("\nThis registration was revoked. A new wallet has to be approved.");
    return;
  }
  if (status.kind === "pending") {
    if (balance === BigInt(0)) {
      console.log("\nApproved, but the wallet has no SOL to pay the claim's fee. Fund it, then run this again.");
      return;
    }
    console.log("\nApproved. Claiming the registration...");
    const { signature } = await claimProvider(client, status.approvedBy);
    console.log(`Claimed. Transaction: ${explorer(`tx/${signature}`)}`);
    status = await getProviderStatus(client.rpc, address);
    console.log(`Registry status: ${status.kind}`);
  }
  if (status.kind === "active") {
    console.log("\nOrigina's provider wallet is active. Anchoring is ready (check /api/anchor/status on the site).");
  }
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
