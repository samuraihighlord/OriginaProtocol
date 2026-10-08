/**
 * End-to-end check of the app's anchoring flow against a local validator running the program's real bytecode.
 * Exercises the server logic (prepare / submit) exactly as the API routes call it, with a test "wallet" that holds
 * no SOL playing the user who co-signs as creator.
 *
 *   solana program dump <PROGRAM_ID> origina.so --url devnet
 *   solana-test-validator --reset --upgradeable-program <PROGRAM_ID> origina.so <DEPLOYER_PUBKEY>
 *   DEPLOYER_KEYPAIR=deployer.json npx tsx scripts/chain-integration.ts
 *
 * The deployer is the program's upgrade authority, which is the only wallet that may call init_registry.
 */
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createClient,
  createKeyPairSignerFromBytes,
  createNoopSigner,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getProgramDerivedAddress,
  getTransactionDecoder,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type KeyPairSigner,
  type Transaction,
  type TransactionSigner,
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

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8899";
// The app's config reads these at import time, so set them before anything from lib/ that uses them is loaded.
process.env.NEXT_PUBLIC_SOLANA_CLUSTER = "localnet";
process.env.NEXT_PUBLIC_SOLANA_RPC_URL = RPC_URL;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

async function expectApiError(name: string, run: () => Promise<unknown>, status: number, pattern?: RegExp) {
  try {
    await run();
    check(name, false, "no error thrown");
  } catch (e) {
    const err = e as { status?: number; message?: string };
    check(name, err.status === status && (!pattern || pattern.test(err.message ?? "")), `${err.status}: ${err.message}`);
  }
}

/** Generates an ed25519 key and returns it as the 64-byte array `solana-keygen` writes (what the env var holds). */
function newKeyBytes(): Uint8Array {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" }) as { d: string; x: string };
  return new Uint8Array([...Buffer.from(jwk.d, "base64url"), ...Buffer.from(jwk.x, "base64url")]);
}

/** A wallet like the real ones: signs the transaction it is handed (keeping existing signatures) without sending it. */
function modifyingWallet(keypair: KeyPairSigner): TransactionSigner {
  return {
    address: keypair.address,
    async modifyAndSignTransactions(txs: readonly Transaction[]) {
      const out: Transaction[] = [];
      for (const tx of txs) {
        const [sigs] = await keypair.signTransactions([tx as never]);
        out.push({ ...tx, signatures: { ...tx.signatures, ...sigs } });
      }
      return out;
    },
  } as unknown as TransactionSigner;
}

const decodeTx = (b64: string) => getTransactionDecoder().decode(getBase64Encoder().encode(b64));

async function main() {
  const deployer = await createKeyPairSignerFromBytes(
    new Uint8Array(JSON.parse(readFileSync(process.env.DEPLOYER_KEYPAIR!, "utf8"))),
  );
  const originaKey = newKeyBytes();
  const origina = await createKeyPairSignerFromBytes(originaKey);
  const judge = await generateKeyPairSigner(); // never funded: the user's wallet holds no SOL
  const judge2 = await generateKeyPairSigner();
  const attacker = await generateKeyPairSigner();

  const makeClient = (s: KeyPairSigner) =>
    createClient().use(signer(s)).use(solanaRpc({ rpcUrl: RPC_URL, rpcSubscriptionsUrl: RPC_URL.replace("http", "ws").replace("8899", "8900") })) as any;
  const dc = makeClient(deployer);
  const oc = makeClient(origina);
  const rpc = dc.rpc;

  async function fund(to: KeyPairSigner, sol: number) {
    await rpc.requestAirdrop(to.address, lamports(BigInt(Math.round(sol * 1e9)))).send();
    for (let i = 0; i < 60; i++) {
      const { value } = await rpc.getBalance(to.address, { commitment: "confirmed" }).send();
      if (value > 0n) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("airdrop did not land");
  }
  await fund(deployer, 5);
  await fund(origina, 5);

  // Loaded only now that the app config env is set.
  const { computePHash, computeSHA256 } = await import("../lib/hash");
  const chain = await import("../lib/chain/chain");
  const { anchorWithOrigina } = await import("../lib/chain/cosign");
  const { prepareAnchor, submitAnchor } = await import("../lib/server/anchorService");
  const { buildAnchorTransaction } = await import("../lib/server/anchorTx");
  const { OriginaClient } = await import("../lib/originaClient");

  const fingerprint = async (seed: string) => {
    const data = new TextEncoder().encode(seed.repeat(200));
    const phash = computePHash(data);
    return { sha: await computeSHA256(data), phash, phashHex: "0x" + phash.toString(16).padStart(16, "0") };
  };
  const fields = (f: Awaited<ReturnType<typeof fingerprint>>, creator: KeyPairSigner, model = "Midjourney") => ({
    sha256: f.sha,
    phash: f.phashHex,
    model,
    creator: creator.address,
  });
  const prepared = async (f: Awaited<ReturnType<typeof fingerprint>>, creator: KeyPairSigner, ip: string, model?: string) => {
    const res = await prepareAnchor(fields(f, creator, model), ip);
    if (res.alreadyAnchored) throw new Error("expected a transaction to sign");
    return res;
  };

  // ---- configuration + registry gate ----
  await expectApiError("anchoring is unavailable (503) when the provider key is not configured", async () => prepareAnchor(fields(await fingerprint("cfg"), judge), "t0"), 503);
  process.env.ORIGINA_PROVIDER_SECRET_KEY = JSON.stringify(Array.from(originaKey));

  const [programData] = await getProgramDerivedAddress({
    programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
    seeds: [getAddressEncoder().encode(ORIGINA_PROGRAM_ADDRESS)],
  });
  await dc.sendTransaction([await getInitRegistryInstructionAsync({ authority: deployer, programData })]);
  check("init_registry succeeds for the upgrade authority", true);

  const imgGate = await fingerprint("gate");
  await expectApiError("not-yet-approved Origina cannot anchor (503)", () => prepareAnchor(fields(imgGate, judge), "t1"), 503);

  await dc.sendTransaction([
    await getApproveProviderInstructionAsync({ authority: deployer, provider: origina.address, name: "Origina", c2paCertIdentity: new Uint8Array(32).fill(7) }),
  ]);
  const pending = await chain.getProviderStatus(rpc, origina.address);
  check("approved-but-unclaimed provider reports 'pending'", pending.kind === "pending" && pending.name === "Origina");
  await expectApiError("pending provider cannot anchor yet (503)", () => prepareAnchor(fields(imgGate, judge), "t2"), 503);

  if (pending.kind === "pending") await chain.claimProvider(oc, pending.approvedBy);
  const active = await chain.getProviderStatus(rpc, origina.address);
  check("claim_provider activates Origina", active.kind === "active" && active.name === "Origina");

  // ---- input validation ----
  const good = await fingerprint("validation");
  const bad = (patch: Record<string, unknown>) => () => prepareAnchor({ ...fields(good, judge), ...patch }, "t3");
  await expectApiError("rejects a malformed SHA-256", bad({ sha256: "xyz" }), 400);
  await expectApiError("rejects an all-zero SHA-256", bad({ sha256: "0".repeat(64) }), 400);
  await expectApiError("rejects a malformed perceptual hash", bad({ phash: "12345" }), 400);
  await expectApiError("rejects a missing model", bad({ model: "" }), 400);
  await expectApiError("rejects a model with unsupported characters", bad({ model: "<script>" }), 400);
  await expectApiError("rejects a model that is too long", bad({ model: "a".repeat(65) }), 400);
  await expectApiError("rejects an invalid wallet address", bad({ creator: "not-an-address" }), 400);
  await expectApiError("rejects the provider wallet as creator", bad({ creator: origina.address }), 400);

  // ---- the co-sign flow ----
  const img = await fingerprint("origina-image-A");
  const originaBefore = (await rpc.getBalance(origina.address).send()).value;
  const prep = await prepared(img, judge, "t4", "DALL-E 3");

  const tx = decodeTx(prep.transaction);
  const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  check("Origina is the fee payer", compiled.staticAccounts[0] === origina.address);
  check("exactly two signers: Origina and the user's wallet", compiled.header.numSignerAccounts === 2 && compiled.staticAccounts[1] === judge.address);
  check("two instructions: anchor_media and the model memo", compiled.instructions.length === 2);
  check("nothing is signed yet when handed to the wallet", Object.values(tx.signatures).every((s) => s === null));

  const wallet = modifyingWallet(judge);
  const [signedByWallet] = await wallet.modifyAndSignTransactions!([tx as never]) as Transaction[];
  const result = await submitAnchor({ ...fields(img, judge, "DALL-E 3"), transaction: getBase64EncodedWireTransaction(signedByWallet) }, "t4");
  check("submit lands the anchor on-chain", typeof result.signature === "string" && result.recordAddress === prep.recordAddress, result.signature.slice(0, 12) + "…");

  const record = await chain.getRecord(rpc, address(result.recordAddress));
  check("record exists and is provider = Origina", !!record && record.provider === origina.address);
  check("record has the user's wallet as creator_wallet", record?.creatorWallet === judge.address);
  check("record stores the exact SHA-256", record?.fileSha256Hex === img.sha);
  check("record stores the perceptual hash (round-trips)", record?.phash === img.phash, `0x${img.phash.toString(16)}`);
  check("record slot is set", !!record && record.slot > 0n);
  const info = await rpc.getAccountInfo(result.recordAddress, { encoding: "base64" }).send();
  check(
    `account is program-owned and ${chain.PROVENANCE_RECORD_ACCOUNT_SIZE} bytes`,
    info.value?.owner === ORIGINA_PROGRAM_ADDRESS && Buffer.from(info.value.data[0], "base64").length === chain.PROVENANCE_RECORD_ACCOUNT_SIZE,
  );
  check("the model is read back from the transaction memo", (await chain.getRecordModel(rpc, address(result.recordAddress))) === "DALL-E 3");
  check("the provider name resolves to Origina", (await chain.getProviderName(rpc, origina.address)) === "Origina");

  const judgeBalance = (await rpc.getBalance(judge.address).send()).value;
  const originaAfter = (await rpc.getBalance(origina.address).send()).value;
  check("the user's wallet paid nothing (still 0 SOL)", judgeBalance === 0n);
  check("Origina paid the record's rent + fee", originaBefore - originaAfter >= BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(chain.PROVENANCE_RECORD_ACCOUNT_SIZE)).send()), `${(originaBefore - originaAfter)} lamports`);

  // ---- duplicates ----
  const again = await prepareAnchor(fields(img, judge2), "t5");
  check("anchoring the same file again returns the existing record (no new tx)", again.alreadyAnchored && again.recordAddress === result.recordAddress);
  await expectApiError(
    "re-submitting a signed transaction for an anchored file is refused (409)",
    () => submitAnchor({ ...fields(img, judge, "DALL-E 3"), transaction: getBase64EncodedWireTransaction(signedByWallet) }, "t5"),
    409,
  );

  // ---- verification ----
  const exact = await chain.findMatch(rpc, img.sha, img.phash);
  check("exact SHA-256 lookup finds the record", exact.kind === "exact" && exact.record.provider === origina.address);
  const near = await chain.findMatch(rpc, "ef".repeat(32), img.phash ^ 0b10101n);
  check("near-match lookup finds it at Hamming distance 3", near.kind === "near" && near.distance === 3);
  const far = await chain.findMatch(rpc, "01".repeat(32), ~img.phash & ((1n << 64n) - 1n));
  check("unrelated fingerprint finds nothing", far.kind === "none");

  // ---- the browser client end to end (fetch is routed to the service functions) ----
  const route = (handler: (body: unknown, ip: string) => Promise<unknown>) => async (_: string, init?: RequestInit) => {
    try {
      return new Response(JSON.stringify(await handler(JSON.parse(String(init?.body)), "client")), { status: 200 });
    } catch (e) {
      const err = e as { status?: number; message: string };
      return new Response(JSON.stringify({ error: err.message }), { status: err.status ?? 500 });
    }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/api/anchor/prepare")) return route(prepareAnchor)(url, init);
    if (url.endsWith("/api/anchor/submit")) return route(submitAnchor)(url, init);
    return realFetch(input as never, init);
  }) as typeof fetch;
  try {
    const app = new OriginaClient({ rpc, signer: wallet });
    const data = new TextEncoder().encode("browser-flow-image".repeat(200));
    const first = await app.anchor({ fileData: data, model: "Stable Diffusion XL" });
    check("OriginaClient.anchor completes the whole flow", !first.alreadyAnchored && !!first.signature && first.model === "Stable Diffusion XL");
    check("the result names Origina as provider and the wallet as creator", first.providerName === "Origina" && first.creatorWallet === judge.address);
    const second = await app.anchor({ fileData: data, model: "Midjourney" });
    check("anchoring again reports 'already anchored' and keeps the original model", second.alreadyAnchored && second.model === "Stable Diffusion XL");
    const verified = await app.verify({ fileData: data });
    check("OriginaClient.verify finds it, with provider, creator and model", verified.exactMatch && verified.providerName === "Origina" && verified.creatorWallet === judge.address && verified.model === "Stable Diffusion XL");
    await app.anchor({ fileData: data, model: "" }).then(
      () => check("the client refuses an empty model", false),
      (e: Error) => check("the client refuses an empty model", /model/i.test(e.message)),
    );
    // A wallet that only implements the partial-signer interface works too.
    const viaPartial = await anchorWithOrigina(judge2, { sha256: (await fingerprint("partial-path")).sha, phash: "0x0000000000000abc", model: "Flux" });
    check("a partial-signer wallet can co-sign as well", viaPartial.kind === "anchored");
  } finally {
    globalThis.fetch = realFetch;
  }

  // ---- tampering: Origina signs only the exact transaction it built ----
  const t = await fingerprint("tamper-target");
  const tp = await prepared(t, judge, "t6", "Midjourney");
  const [signedT] = (await wallet.modifyAndSignTransactions!([decodeTx(tp.transaction) as never])) as Transaction[];
  const wire = getBase64EncodedWireTransaction(signedT);
  await expectApiError("a different model than the one signed is refused", () => submitAnchor({ ...fields(t, judge, "DALL-E 3"), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different file than the one signed is refused", async () => submitAnchor({ ...fields(await fingerprint("other"), judge, "Midjourney"), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different claimed creator than the one signed is refused", () => submitAnchor({ ...fields(t, judge2, "Midjourney"), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError(
    "a transaction the user's wallet never signed is refused",
    () => submitAnchor({ ...fields(t, judge, "Midjourney"), transaction: tp.transaction }, "t6"),
    400,
    /wasn't signed/,
  );
  await expectApiError("garbage in place of a transaction is refused", () => submitAnchor({ ...fields(t, judge), transaction: "not base64 !!" }, "t6"), 400);

  // A hostile transaction: Origina as fee payer, moving Origina's SOL to the attacker, signed by the attacker.
  const { value: latest } = await rpc.getLatestBlockhash().send();
  const hostileIx = {
    programAddress: address("11111111111111111111111111111111"),
    accounts: [
      { address: origina.address, role: 3 /* writable signer */, signer: createNoopSigner(origina.address) },
      { address: attacker.address, role: 3 /* writable signer: the attacker signs it themselves */, signer: createNoopSigner(attacker.address) },
    ],
    data: new Uint8Array([2, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0]), // SystemProgram::Transfer of 1 SOL
  };
  const hostileMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(createNoopSigner(origina.address), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
    (m) => appendTransactionMessageInstructions([hostileIx as never], m),
  );
  const hostile = compileTransaction(hostileMessage);
  const [attackerSig] = await attacker.signTransactions([hostile as never]);
  const attackerBefore = (await rpc.getBalance(attacker.address).send()).value;
  await expectApiError(
    "a hostile transaction using Origina as fee payer never gets Origina's signature",
    () =>
      submitAnchor(
        { ...fields(t, attacker, "Midjourney"), transaction: getBase64EncodedWireTransaction({ ...hostile, signatures: { ...hostile.signatures, ...attackerSig } } as Transaction) },
        "t7",
      ),
    400,
  );
  check("no SOL left Origina's wallet to the attacker", (await rpc.getBalance(attacker.address).send()).value === attackerBefore);
  check("the tampered anchors never created records", (await chain.findExistingRecord(rpc, origina.address, t.sha)).record === null);

  // ---- abuse limits ----
  for (let i = 0; i < 60; i++) await prepareAnchor(fields(img, judge), "burst");
  await expectApiError("the 61st prepare in an hour from one address is rate-limited (429)", () => prepareAnchor(fields(img, judge), "burst"), 429);

  process.env.ORIGINA_RESERVE_LAMPORTS = String(10n ** 15n);
  await expectApiError("anchoring pauses (503) when Origina's wallet is below its reserve", async () => prepareAnchor(fields(await fingerprint("poor"), judge), "t8"), 503);
  delete process.env.ORIGINA_RESERVE_LAMPORTS;

  // ---- revocation ----
  await dc.sendTransaction([await getRevokeProviderInstructionAsync({ authority: deployer, provider: origina.address, reason: RevocationReason.Policy })]);
  check("revoked provider reports 'revoked'", (await chain.getProviderStatus(rpc, origina.address)).kind === "revoked");
  await expectApiError("a revoked Origina cannot anchor new files (503)", async () => prepareAnchor(fields(await fingerprint("after-revoke"), judge), "t9"), 503);
  check("records anchored before the revocation remain verifiable", (await chain.findMatch(rpc, img.sha, img.phash)).kind === "exact");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nTEST RUN CRASHED:", e);
  process.exit(2);
});
