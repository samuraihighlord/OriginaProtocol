/**
 * End-to-end check of the app's chain layer against a local validator running the program's real bytecode.
 *
 *   solana program dump <PROGRAM_ID> origina.so --url devnet
 *   solana-test-validator --reset --upgradeable-program <PROGRAM_ID> origina.so <DEPLOYER_PUBKEY>
 *   DEPLOYER_KEYPAIR=deployer.json npx tsx scripts/chain-integration.ts
 *
 * The deployer is the program's upgrade authority, which is the only wallet that may call init_registry.
 */
import { readFileSync } from "node:fs";
import {
  address,
  createClient,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  getProgramDerivedAddress,
  getAddressEncoder,
  lamports,
  type KeyPairSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signer } from "@solana/kit-plugin-signer";
import {
  ORIGINA_PROGRAM_ADDRESS,
  RevocationReason,
  getApproveProviderInstructionAsync,
  getInitRegistryInstructionAsync,
  getRevokeProviderInstructionAsync,
} from "../lib/generated/origina/src/generated";
import {
  InsufficientFundsError,
  NotAProviderError,
  PROVENANCE_RECORD_ACCOUNT_SIZE,
  anchorMedia,
  claimProvider,
  findMatch,
  getProviderName,
  getProviderStatus,
  type ChainClient,
} from "../lib/chain/chain";
import { computePHash, computeSHA256 } from "../lib/hash";
import { bytesToHex } from "../lib/chain/fingerprint";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const makeClient = (s: KeyPairSigner) =>
  createClient().use(signer(s)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: RPC_URL.replace("http", "ws").replace("8899", "8900") })) as unknown as ChainClient & {
    rpc: any;
    rpcSubscriptions: any;
  };

async function fund(rpc: any, to: KeyPairSigner, sol: number) {
  await rpc.requestAirdrop(to.address, lamports(BigInt(Math.round(sol * 1e9)))).send();
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getBalance(to.address, { commitment: "confirmed" }).send();
    if (value > 0n) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("airdrop did not land");
}

const bytesOf = async (seed: string) => {
  const data = new TextEncoder().encode(seed.repeat(200));
  return { data, sha: await computeSHA256(data), phash: computePHash(data) };
};

async function main() {
  const deployer = await createKeyPairSignerFromBytes(
    new Uint8Array(JSON.parse(readFileSync(process.env.DEPLOYER_KEYPAIR!, "utf8"))),
  );
  const provider = await generateKeyPairSigner();
  const stranger = await generateKeyPairSigner();
  const poor = await generateKeyPairSigner();
  const dc = makeClient(deployer);
  const pc = makeClient(provider);
  const sc = makeClient(stranger);
  const poorc = makeClient(poor);
  for (const [s, sol] of [[deployer, 5], [provider, 5], [stranger, 5], [poor, 0.004]] as const) await fund(dc.rpc, s, sol);

  // ---- registry setup (authority-only; what the program's deployer does once) ----
  const [programData] = await getProgramDerivedAddress({
    programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
    seeds: [getAddressEncoder().encode(ORIGINA_PROGRAM_ADDRESS)],
  });
  await dc.sendTransaction([await getInitRegistryInstructionAsync({ authority: deployer, programData })]);
  check("init_registry succeeds for the upgrade authority", true);

  // ---- provider lifecycle through the app's functions ----
  check("unknown wallet reports status 'none'", (await getProviderStatus(sc.rpc, stranger.address)).kind === "none");
  try {
    await anchorMedia(sc, { sha256Hex: "ab".repeat(32), phash: 1n });
    check("non-provider cannot anchor", false, "no error thrown");
  } catch (e) {
    check("non-provider cannot anchor (NotAProviderError, status none)", e instanceof NotAProviderError && e.status.kind === "none");
  }

  const cert = new Uint8Array(32).fill(7);
  await dc.sendTransaction([
    await getApproveProviderInstructionAsync({ authority: deployer, provider: provider.address, name: "Test Studio", c2paCertIdentity: cert }),
  ]);
  const pending = await getProviderStatus(pc.rpc, provider.address);
  check("approved-but-unclaimed wallet reports 'pending'", pending.kind === "pending" && pending.name === "Test Studio");
  try {
    await anchorMedia(pc, { sha256Hex: "cd".repeat(32), phash: 1n });
    check("pending provider cannot anchor", false, "no error thrown");
  } catch (e) {
    check("pending provider cannot anchor (NotAProviderError, status pending)", e instanceof NotAProviderError && e.status.kind === "pending");
  }

  if (pending.kind === "pending") await claimProvider(pc, pending.approvedBy);
  const active = await getProviderStatus(pc.rpc, provider.address);
  check("claim_provider activates the provider", active.kind === "active" && active.name === "Test Studio");
  check("getProviderName resolves the registered name", (await getProviderName(pc.rpc, provider.address)) === "Test Studio");

  // ---- anchoring ----
  const img = await bytesOf("origina-image-A");
  const first = await anchorMedia(pc, { sha256Hex: img.sha, phash: img.phash });
  check("anchor_media writes a record on-chain", first.kind === "anchored" && first.record.provider === provider.address);
  if (first.kind === "anchored") {
    check("record stores the exact SHA-256", first.record.fileSha256Hex === img.sha);
    check("record stores the perceptual hash (round-trips)", first.record.phash === img.phash, `0x${img.phash.toString(16)}`);
    check("record has no creator wallet", first.record.creatorWallet === null);
    check("record slot is set", first.record.slot > 0n, `slot ${first.record.slot}`);
    const info = await pc.rpc.getAccountInfo(first.record.address, { encoding: "base64" }).send();
    check(
      `account is program-owned and ${PROVENANCE_RECORD_ACCOUNT_SIZE} bytes`,
      info.value?.owner === ORIGINA_PROGRAM_ADDRESS && Buffer.from(info.value.data[0], "base64").length === PROVENANCE_RECORD_ACCOUNT_SIZE,
    );
  }
  const again = await anchorMedia(pc, { sha256Hex: img.sha, phash: img.phash });
  check("re-anchoring the same file returns the existing record (no second tx)", again.kind === "already-anchored");

  // ---- verification ----
  const exact = await findMatch(sc.rpc, img.sha, img.phash);
  check("exact SHA-256 lookup finds the record", exact.kind === "exact" && exact.record.provider === provider.address);

  const flipped = img.phash ^ 0b10101n; // 3 bits different, different file hash
  const near = await findMatch(sc.rpc, "ef".repeat(32), flipped);
  check("near-match lookup finds it at Hamming distance 3", near.kind === "near" && near.distance === 3);

  const far = await findMatch(sc.rpc, "01".repeat(32), ~img.phash & ((1n << 64n) - 1n));
  check("unrelated fingerprint finds nothing", far.kind === "none");

  // ---- failure modes ----
  const p2 = await bytesOf("origina-image-B");
  await dc.sendTransaction([
    await getApproveProviderInstructionAsync({ authority: deployer, provider: poor.address, name: "Poor Studio", c2paCertIdentity: cert }),
  ]);
  const poorPending = await getProviderStatus(poorc.rpc, poor.address);
  if (poorPending.kind === "pending") await claimProvider(poorc, poorPending.approvedBy);
  try {
    await anchorMedia(poorc, { sha256Hex: p2.sha, phash: p2.phash });
    check("underfunded provider is stopped before sending", false, "no error thrown");
  } catch (e) {
    check("underfunded provider gets InsufficientFundsError", e instanceof InsufficientFundsError, e instanceof Error ? e.message : String(e));
  }

  await dc.sendTransaction([
    await getRevokeProviderInstructionAsync({ authority: deployer, provider: provider.address, reason: RevocationReason.Policy }),
  ]);
  check("revoked provider reports 'revoked'", (await getProviderStatus(pc.rpc, provider.address)).kind === "revoked");
  try {
    await anchorMedia(pc, { sha256Hex: p2.sha, phash: p2.phash });
    check("revoked provider cannot anchor", false, "no error thrown");
  } catch (e) {
    check("revoked provider cannot anchor (NotAProviderError, status revoked)", e instanceof NotAProviderError && e.status.kind === "revoked");
  }
  const stillThere = await findMatch(sc.rpc, img.sha, img.phash);
  check("records anchored before revocation remain verifiable", stillThere.kind === "exact");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nTEST RUN CRASHED:", e);
  process.exit(2);
});
