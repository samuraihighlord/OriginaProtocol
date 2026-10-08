// Sets up a local registry for manual UI testing: init_registry + approve one provider (left UNCLAIMED).
//   DEPLOYER_KEYPAIR=deployer.json PROVIDER_ADDRESS=<pubkey> npx tsx scripts/local-setup.ts
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
  getInitRegistryInstructionAsync,
} from "../lib/generated/origina/src/generated";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";

async function main() {
  const deployer = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(process.env.DEPLOYER_KEYPAIR!, "utf8"))));
  const client = createClient().use(signer(deployer)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: "ws://127.0.0.1:8900" }));
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

  const [programData] = await getProgramDerivedAddress({
    programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
    seeds: [getAddressEncoder().encode(ORIGINA_PROGRAM_ADDRESS)],
  });
  await client.sendTransaction([await getInitRegistryInstructionAsync({ authority: deployer, programData })]);
  console.log("registry initialized; authority =", deployer.address);

  for (const raw of (process.env.PROVIDER_ADDRESSES ?? "").split(",").filter(Boolean)) {
    const [addr, name] = raw.split(":");
    await airdrop(addr, 2);
    await client.sendTransaction([
      await getApproveProviderInstructionAsync({
        authority: deployer,
        provider: address(addr),
        name,
        c2paCertIdentity: new Uint8Array(32).fill(9),
      }),
    ]);
    console.log(`approved + funded provider "${name}" = ${addr} (unclaimed)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
