// Sets up a local registry for manual UI testing: init_registry, then approve, fund and claim Origina's provider wallet.
//   DEPLOYER_KEYPAIR=deployer.json ORIGINA_PROVIDER_KEYPAIR=origina-provider.json npx tsx scripts/local-setup.ts
// Then run the app with ORIGINA_PROVIDER_SECRET_KEY set to the contents of that same keypair file.
import { readFileSync } from "node:fs";
import {
  address,
  createClient,
  createKeyPairSignerFromBytes,
  getAddressEncoder,
  getProgramDerivedAddress,
  lamports,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import {
  ORIGINA_PROGRAM_ADDRESS,
  getApproveProviderInstructionAsync,
  getClaimProviderInstructionAsync,
  getInitRegistryInstructionAsync,
} from "../lib/generated/origina/src/generated";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const loadKeypair = async (path: string) => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
const makeClient = (s: Awaited<ReturnType<typeof loadKeypair>>) =>
  createClient().use(signer(s)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: "ws://127.0.0.1:8900" }));

async function main() {
  const deployer = await loadKeypair(process.env.DEPLOYER_KEYPAIR!);
  const origina = await loadKeypair(process.env.ORIGINA_PROVIDER_KEYPAIR!);
  const client = makeClient(deployer);
  const rpc = client.rpc;

  const airdrop = async (to: string, sol: number) => {
    await rpc.requestAirdrop(address(to), lamports(BigInt(Math.round(sol * 1e9)))).send();
    for (let i = 0; i < 60; i++) {
      const { value } = await rpc.getBalance(address(to), { commitment: "confirmed" }).send();
      if (value > 0n) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await airdrop(deployer.address, 5);
  await airdrop(origina.address, 5);

  const [programData] = await getProgramDerivedAddress({
    programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
    seeds: [getAddressEncoder().encode(ORIGINA_PROGRAM_ADDRESS)],
  });
  await client.sendTransaction([await getInitRegistryInstructionAsync({ authority: deployer, programData })]);
  console.log("registry initialized; authority =", deployer.address);

  await client.sendTransaction([
    await getApproveProviderInstructionAsync({
      authority: deployer,
      provider: origina.address,
      name: "Origina",
      c2paCertIdentity: new Uint8Array(32).fill(9),
    }),
  ]);
  await makeClient(origina).sendTransaction([
    await getClaimProviderInstructionAsync({ provider: origina, approvedBy: deployer.address }),
  ]);
  console.log(`approved, funded and claimed provider "Origina" = ${origina.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
