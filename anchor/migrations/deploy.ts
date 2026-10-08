// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.

import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Origina } from "../target/types/origina";

const { PublicKey } = anchor.web3;
const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

module.exports = async function (provider: anchor.AnchorProvider) {
  // Configure client to use the provider.
  anchor.setProvider(provider);

  const program = anchor.workspace.Origina as Program<Origina>;
  const authority = provider.wallet.publicKey;

  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    program.programId
  );
  const [programData] = PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE
  );

  const existing = await program.account.registryAccount.fetchNullable(
    registryPda
  );
  if (existing) {
    console.log(
      `Registry already initialized. Authority: ${existing.authority.toBase58()}`
    );
    return;
  }
  const pd = await provider.connection.getAccountInfo(programData);
  if (!pd) {
    throw new Error(
      "ProgramData not found. Is the program deployed to this cluster?"
    );
  }
  if (pd.data[12] !== 1) {
    throw new Error(
      "Program is immutable (no upgrade authority). The registry can never be initialized."
    );
  }

  const signature = await program.methods
    .initRegistry()
    .accountsPartial({
      authority: authority,
      registryAccount: registryPda,
      program: program.programId,
      programData,
    })
    .rpc();
  console.log(`init_registry tx: ${signature}`);

  const registry = await program.account.registryAccount.fetch(registryPda);
  if (!registry.authority.equals(authority)) {
    throw new Error("Registry authority does not match the deploying wallet.");
  }
  console.log(
    `Registry initialized at ${registryPda.toBase58()}. Authority: ${authority.toBase58()}`
  );
};
