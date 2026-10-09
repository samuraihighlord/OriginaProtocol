/**
 * End-to-end check of the app's anchoring flow against a local validator running the program's real bytecode.
 * Exercises the server logic (status / prepare / submit) exactly as the API routes call it, with a test "wallet"
 * that holds no SOL playing the user who co-signs as creator.
 *
 *   solana program dump <PROGRAM_ID> origina.so --url devnet
 *   solana-test-validator --reset --upgradeable-program <PROGRAM_ID> origina.so <DEPLOYER_PUBKEY>
 *   DEPLOYER_KEYPAIR=deployer.json npx tsx scripts/chain-integration.ts
 *
 * The deployer is the program's upgrade authority, which is the only wallet that may call init_registry.
 * Start the validator fresh for every run.
 */
import { createHash, generateKeyPairSync } from "node:crypto";
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
  getCompiledTransactionMessageEncoder,
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
function modifyingWallet(keypair: KeyPairSigner, alter?: (tx: Transaction) => Transaction): TransactionSigner {
  return {
    address: keypair.address,
    async modifyAndSignTransactions(txs: readonly Transaction[]) {
      const out: Transaction[] = [];
      for (const original of txs) {
        const tx = alter ? alter(original) : original;
        const [sigs] = await keypair.signTransactions([tx as never]);
        out.push({ ...tx, signatures: { ...tx.signatures, ...sigs } });
      }
      return out;
    },
  } as unknown as TransactionSigner;
}

const decodeTx = (b64: string) => getTransactionDecoder().decode(getBase64Encoder().encode(b64));

/** What a wallet that appends its own instruction (a guard, a priority fee) does to a transaction it signs. */
function appendInstruction(tx: Transaction, program: string, data: Uint8Array, extraAccounts: string[] = []): Transaction {
  const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (compiled.version === 1) throw new Error("unexpected v1 message");
  const keys = [...compiled.staticAccounts];
  const indexOf = (a: string) => {
    let i = keys.indexOf(address(a));
    if (i < 0) {
      keys.push(address(a));
      i = keys.length - 1;
    }
    return i;
  };
  const before = keys.length;
  const programAddressIndex = indexOf(program);
  const accountIndices = extraAccounts.map(indexOf);
  const added = keys.length - before; // appended as readonly non-signers, which keeps the account ordering valid
  const next = {
    ...compiled,
    header: { ...compiled.header, numReadonlyNonSignerAccounts: compiled.header.numReadonlyNonSignerAccounts + added },
    staticAccounts: keys,
    instructions: [...compiled.instructions, { programAddressIndex, accountIndices, data }],
  };
  return { ...tx, messageBytes: getCompiledTransactionMessageEncoder().encode(next as never) as never };
}

/** What a hostile client does to cheat Origina: shrink the rent reimbursement transfer. */
function withTransferAmount(tx: Transaction, lamports: bigint): Transaction {
  const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (compiled.version === 1) throw new Error("unexpected v1 message");
  const instructions = compiled.instructions.map((ix) => {
    if (compiled.staticAccounts[ix.programAddressIndex] !== "11111111111111111111111111111111") return ix;
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true);
    view.setBigUint64(4, lamports, true);
    return { ...ix, data };
  });
  return { ...tx, messageBytes: getCompiledTransactionMessageEncoder().encode({ ...compiled, instructions } as never) as never };
}

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
const u32 = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
const computeUnitLimit = (n: number) => new Uint8Array([2, ...u32(n)]);
const computeUnitPrice = (microLamports: bigint) => new Uint8Array([3, ...new Uint8Array(new BigUint64Array([microLamports]).buffer)]);

async function main() {
  const deployer = await createKeyPairSignerFromBytes(
    new Uint8Array(JSON.parse(readFileSync(process.env.DEPLOYER_KEYPAIR!, "utf8"))),
  );
  const originaKey = newKeyBytes();
  const origina = await createKeyPairSignerFromBytes(originaKey);
  const judge = await generateKeyPairSigner(); // the user's wallet: it pays for what it anchors
  const judge2 = await generateKeyPairSigner();
  const attacker = await generateKeyPairSigner();
  const pauper = await generateKeyPairSigner(); // never funded

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
  for (const w of [judge, judge2, attacker]) await fund(w, 1);

  // Loaded only now that the app config env is set.
  const { computePHash, computeSHA256 } = await import("../lib/hash");
  const chain = await import("../lib/chain/chain");
  const { anchorWithOrigina } = await import("../lib/chain/cosign");
  const { findC2paManifestBytes, computeC2paManifestHash } = await import("../lib/c2pa");
  const { extractProvenanceRecord, deriveRecordPda } = await import("../lib/provenance");
  const { recordStore } = await import("../lib/recordStore");
  const { getAnchorStatus, prepareAnchor, submitAnchor } = await import("../lib/server/anchorService");
  const { buildAnchorTransaction } = await import("../lib/server/anchorTx");
  const { validateSignedAnchorTransaction } = await import("../lib/server/anchorValidate");
  const { noC2paManifestHash } = await import("../lib/chain/fingerprint");
  const { OriginaClient } = await import("../lib/originaClient");

  const fingerprint = async (seed: string) => {
    const data = new TextEncoder().encode(seed.repeat(200));
    const phash = computePHash(data);
    return { data, sha: await computeSHA256(data), phash, phashHex: "0x" + phash.toString(16).padStart(16, "0") };
  };
  type Fingerprint = Awaited<ReturnType<typeof fingerprint>>;
  const NOW = () => Math.floor(Date.now() / 1000);
  const fields = (f: Fingerprint, creator: KeyPairSigner | null, over: Record<string, unknown> = {}) => ({
    provider: "origina",
    file_hash: f.sha,
    perceptual_hash: f.phashHex,
    c2pa_manifest_hash: null,
    creator: creator?.address ?? null,
    slot: 123,
    generated_at: NOW(),
    bump: null,
    model: "Midjourney",
    ...over,
  });
  const prepared = async (f: Fingerprint, creator: KeyPairSigner | null, ip: string, over: Record<string, unknown> = {}) => {
    const res = await prepareAnchor(fields(f, creator, over), ip);
    if (res.alreadyAnchored) throw new Error("expected a transaction to sign");
    return res;
  };

  // ---- C2PA manifest extraction (pure) ----
  {
    const box = (payload: number[]) => [0, 0, 0, 8 + payload.length, 0x6a, 0x75, 0x6d, 0x62, ...payload];
    const image = new Uint8Array([1, 2, 3, ...box([9, 8, 7, 6, 5, 4, 3, 2]), 42, 42, 42, 42, 42]);
    const found = findC2paManifestBytes(image);
    // From the signature offset (3 + 4) to offset + the box length, clamped to the file.
    check("finds a JUMBF box and slices from the signature by the preceding length", !!found && found[0] === 0x6a && found.length === 16, `${found?.length} bytes`);
    const expectedHash = createHash("sha256").update(found ?? new Uint8Array()).digest("hex");
    check("hashes the extracted manifest bytes with SHA-256", (await computeC2paManifestHash(image)) === expectedHash);
    check("returns null when there is no JUMBF signature", (await computeC2paManifestHash(new TextEncoder().encode("plain image bytes".repeat(50)))) === null);
    const beyond = new Uint8Array(70000);
    beyond.set(box([1, 2, 3, 4]), 66000);
    check("ignores a signature past the first 65536 bytes", findC2paManifestBytes(beyond) === null);
    check("ignores a box whose length field is unusable", findC2paManifestBytes(new Uint8Array([0, 0, 0, 0, 0x6a, 0x75, 0x6d, 0x62, 1, 2, 3])) === null);
    check("clamps a length that runs past the end of the file", (findC2paManifestBytes(new Uint8Array([0, 0, 0, 200, 0x6a, 0x75, 0x6d, 0x62, 1, 2, 3, 4]))?.length ?? 0) === 8);
  }

  // ---- readiness is reported with a reason before anything is set up ----
  const status0 = await getAnchorStatus("s0");
  check("status: not configured while the provider key is missing", !status0.ready && status0.reason === "not-configured" && status0.provider === null);
  await expectApiError("prepare is refused (503) when the provider key is not configured", async () => prepareAnchor(fields(await fingerprint("cfg"), judge), "t0"), 503, /set up on the server/);
  process.env.ORIGINA_PROVIDER_SECRET_KEY = JSON.stringify(Array.from(originaKey));
  await fund(origina, 5);

  const [programData] = await getProgramDerivedAddress({
    programAddress: address("BPFLoaderUpgradeab1e11111111111111111111111"),
    seeds: [getAddressEncoder().encode(ORIGINA_PROGRAM_ADDRESS)],
  });
  await dc.sendTransaction([await getInitRegistryInstructionAsync({ authority: deployer, programData })]);
  check("init_registry succeeds for the upgrade authority", true);

  const status1 = await getAnchorStatus("s1");
  check("status: not registered before approval", !status1.ready && status1.reason === "not-registered" && status1.provider === origina.address);
  const imgGate = await fingerprint("gate");
  await expectApiError("not-yet-approved Origina cannot anchor (503)", () => prepareAnchor(fields(imgGate, judge), "t1"), 503, /approved in the on-chain registry/);

  await dc.sendTransaction([
    await getApproveProviderInstructionAsync({ authority: deployer, provider: origina.address, name: "Origina", c2paCertIdentity: new Uint8Array(32).fill(7) }),
  ]);
  const pending = await chain.getProviderStatus(rpc, origina.address);
  check("approved-but-unclaimed provider reports 'pending'", pending.kind === "pending" && pending.name === "Origina");
  const status2 = await getAnchorStatus("s2");
  check("status: not claimed after approval", !status2.ready && status2.reason === "not-claimed");

  if (pending.kind === "pending") await chain.claimProvider(oc, pending.approvedBy);
  const active = await chain.getProviderStatus(rpc, origina.address);
  check("claim_provider activates Origina", active.kind === "active" && active.name === "Origina");
  const status3 = await getAnchorStatus("s3");
  check("status: ready once registered, claimed and funded", status3.ready && status3.provider === origina.address && status3.originaPays === true);
  const rent = BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(chain.PROVENANCE_RECORD_ACCOUNT_SIZE)).send());
  check("status reports what an anchor costs the paying wallet", status3.cost?.rentLamports === Number(rent) && status3.cost.feeLamports === 10_000 && status3.cost.requiredLamports > Number(rent) + 10_000, JSON.stringify(status3.cost));

  // ---- input validation ----
  const good = await fingerprint("validation");
  const bad = (patch: Record<string, unknown>) => () => prepareAnchor({ ...fields(good, judge), ...patch }, "t3");
  await expectApiError("rejects a provider other than 'origina'", bad({ provider: "someone-else" }), 400);
  await expectApiError("rejects a malformed file hash", bad({ file_hash: "xyz" }), 400);
  await expectApiError("rejects an all-zero file hash", bad({ file_hash: "0".repeat(64) }), 400);
  await expectApiError("rejects a malformed perceptual hash", bad({ perceptual_hash: "12345" }), 400);
  await expectApiError("rejects a malformed C2PA manifest hash", bad({ c2pa_manifest_hash: "abc" }), 400);
  await expectApiError("rejects an invalid creator address", bad({ creator: "not-an-address" }), 400);
  await expectApiError("rejects the provider wallet as creator", bad({ creator: origina.address }), 400);
  await expectApiError("rejects a negative slot", bad({ slot: -1 }), 400);
  await expectApiError("rejects a fractional slot", bad({ slot: 1.5 }), 400);
  await expectApiError("rejects a timestamp more than a day off", bad({ generated_at: NOW() - 3 * 86400 }), 400, /clock/);
  await expectApiError("rejects a bump above 255", bad({ bump: 300 }), 400);
  await expectApiError("rejects a missing model", bad({ model: "" }), 400);
  await expectApiError("rejects a model with unsupported characters", bad({ model: "<script>" }), 400);
  await expectApiError("rejects a model that is too long", bad({ model: "a".repeat(65) }), 400);

  // ---- the paying wallet must be able to afford the anchor ----
  const poor = await fingerprint("poor-wallet");
  await expectApiError("an unfunded wallet is told what it needs (400)", () => prepareAnchor(fields(poor, pauper), "t3b"), 400, /needs about .* devnet SOL/);
  await fund(pauper, 0.002); // covers the deposit but not the deposit plus fee plus the account minimum
  await expectApiError("a wallet with too little SOL is refused (400)", () => prepareAnchor(fields(poor, pauper), "t3b"), 400, /needs about/);

  // ---- the co-sign flow, with every field ----
  const img = await fingerprint("origina-image-A");
  const c2pa = createHash("sha256").update("manifest-A").digest("hex");
  const originaBefore = (await rpc.getBalance(origina.address).send()).value;
  const judgeBefore = (await rpc.getBalance(judge.address).send()).value;
  const { bump: derivedBump } = await deriveRecordPda(origina.address, img.sha);
  const generatedAt = NOW() - 30;
  const prep = await prepared(img, judge, "t4", { model: "DALL-E 3", c2pa_manifest_hash: c2pa, generated_at: generatedAt, slot: 4242, bump: derivedBump });

  const tx = decodeTx(prep.transaction!);
  const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  if (compiled.version === 1) throw new Error("unexpected v1 message");
  check("prepare reports Origina's provider wallet", prep.provider === origina.address);
  check("the user's wallet is the fee payer", compiled.staticAccounts[0] === judge.address);
  check("exactly two signers: the user's wallet and Origina", compiled.header.numSignerAccounts === 2 && compiled.staticAccounts[1] === origina.address);
  check("three instructions: rent reimbursement, anchor_media, memo", compiled.instructions.length === 3);
  check("the transaction fits well inside the 1232-byte limit", getBase64Encoder().encode(prep.transaction!).length < 1100, `${getBase64Encoder().encode(prep.transaction!).length} bytes`);
  check("nothing is signed yet when handed to the wallet", Object.values(tx.signatures).every((s) => s === null));

  const wallet = modifyingWallet(judge);
  const [signedByWallet] = (await wallet.modifyAndSignTransactions!([tx as never])) as Transaction[];
  const result = await submitAnchor(
    { ...fields(img, judge, { model: "DALL-E 3", c2pa_manifest_hash: c2pa, generated_at: generatedAt, slot: 4242, bump: derivedBump }), transaction: getBase64EncodedWireTransaction(signedByWallet) },
    "t4",
  );
  check("submit lands the anchor on-chain", typeof result.signature === "string" && result.recordAddress === prep.recordAddress, result.signature.slice(0, 12) + "…");

  const record = await chain.getRecord(rpc, address(result.recordAddress));
  check("record exists and is provider = Origina", !!record && record.provider === origina.address);
  check("record has the user's wallet as creator_wallet", record?.creatorWallet === judge.address);
  check("record stores the exact SHA-256 (file_hash)", record?.fileSha256Hex === img.sha);
  check("record stores the perceptual hash (round-trips)", record?.phash === img.phash, `0x${img.phash.toString(16)}`);
  check("record stores the C2PA manifest hash when the image has one", record?.c2paManifestHashHex === c2pa);
  check("record stores generated_at", record?.generatedAt === BigInt(generatedAt));
  check("record slot is the program's slot (set on-chain)", !!record && record.slot > 0n, `slot ${record?.slot}`);
  check("record bump equals the bump derived client-side from the real seeds", record?.bump === derivedBump, `bump ${derivedBump}`);
  check("the derived PDA is the record's address", (await deriveRecordPda(origina.address, img.sha)).address === result.recordAddress);
  const info = await rpc.getAccountInfo(result.recordAddress, { encoding: "base64" }).send();
  check(
    `account is program-owned and ${chain.PROVENANCE_RECORD_ACCOUNT_SIZE} bytes`,
    info.value?.owner === ORIGINA_PROGRAM_ADDRESS && Buffer.from(info.value.data[0], "base64").length === chain.PROVENANCE_RECORD_ACCOUNT_SIZE,
  );
  const memo = await chain.getRecordMemo(rpc, address(result.recordAddress));
  check("the memo carries model, provider name, the browser's slot and the bump", memo?.model === "DALL-E 3" && memo.provider === "origina" && memo.slot === 4242 && memo.bump === derivedBump, JSON.stringify(memo));
  check("the provider name resolves to Origina", (await chain.getProviderName(rpc, origina.address)) === "Origina");

  const judgeAfter = (await rpc.getBalance(judge.address).send()).value;
  const originaAfter = (await rpc.getBalance(origina.address).send()).value;
  check("the user's wallet paid exactly the record's rent plus the two-signature fee", judgeBefore - judgeAfter === rent + 10_000n, `${judgeBefore - judgeAfter} lamports`);
  check("Origina's wallet is exactly where it started (reimbursed in the same transaction)", originaAfter === originaBefore, `${originaAfter - originaBefore} lamports`);

  // ---- a record without C2PA stores the sentinel ----
  const imgNoC2pa = await fingerprint("no-c2pa-image");
  const noC2paPrep = await prepared(imgNoC2pa, judge, "t4b");
  const [noC2paSigned] = (await wallet.modifyAndSignTransactions!([decodeTx(noC2paPrep.transaction!) as never])) as Transaction[];
  const noC2paResult = await submitAnchor({ ...fields(imgNoC2pa, judge), transaction: getBase64EncodedWireTransaction(noC2paSigned) }, "t4b");
  const noC2paRecord = await chain.getRecord(rpc, address(noC2paResult.recordAddress));
  check("with no C2PA manifest the record stores the 'no manifest' sentinel", noC2paRecord?.c2paManifestHashHex === bytesHex(await noC2paManifestHash()));

  // ---- anchoring with no wallet connected ----
  const imgAnon = await fingerprint("anonymous-image");
  const anonPrep = await prepared(imgAnon, null, "t4c");
  check("with no creator there is nothing for a wallet to sign", anonPrep.transaction === null);
  const anonBefore = (await rpc.getBalance(origina.address).send()).value;
  const anon = await submitAnchor(fields(imgAnon, null), "t4c");
  const anonAfter = (await rpc.getBalance(origina.address).send()).value;
  const anonRecord = await chain.getRecord(rpc, address(anon.recordAddress));
  check("a wallet-less anchor lands with creator_wallet = null", !!anonRecord && anonRecord.creatorWallet === null && anonRecord.provider === origina.address);
  check("with no wallet, Origina pays the rent and fee itself", anonBefore - anonAfter === rent + 5_000n, `${anonBefore - anonAfter} lamports`);
  await expectApiError("an anchor that names a creator but sends no transaction is refused", async () => submitAnchor(fields(await fingerprint("x1"), judge), "t4c"), 400, /transaction/);

  // ---- duplicates ----
  const again = await prepareAnchor(fields(img, judge2), "t5");
  check("anchoring the same file again returns the existing record (no new tx)", again.alreadyAnchored && again.recordAddress === result.recordAddress);
  await expectApiError(
    "re-submitting a signed transaction for an anchored file is refused (409)",
    () => submitAnchor({ ...fields(img, judge, { model: "DALL-E 3", c2pa_manifest_hash: c2pa, generated_at: generatedAt, slot: 4242, bump: derivedBump }), transaction: getBase64EncodedWireTransaction(signedByWallet) }, "t5"),
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
      return new Response(JSON.stringify(await handler(init?.body ? JSON.parse(String(init.body)) : undefined, "client")), { status: 200 });
    } catch (e) {
      const err = e as { status?: number; message: string };
      return new Response(JSON.stringify({ error: err.message }), { status: err.status ?? 500 });
    }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/api/anchor/status")) return route((_b, ip) => getAnchorStatus(ip))(url, init);
    if (url.endsWith("/api/anchor/prepare")) return route(prepareAnchor)(url, init);
    if (url.endsWith("/api/anchor/submit")) return route(submitAnchor)(url, init);
    return realFetch(input as never, init);
  }) as typeof fetch;
  try {
    const app = new OriginaClient({ rpc, signer: wallet });
    const data = new TextEncoder().encode("browser-flow-image".repeat(200));
    const draft = await app.analyse(data);
    check("analyse extracts all eight fields from the image", draft.provider === "origina" && draft.file_hash === (await computeSHA256(data)) && draft.perceptual_hash === computePHash(data) && draft.c2pa_manifest_hash === null && draft.creator === null && draft.slot === null && Math.abs(draft.generated_at - NOW()) < 5);
    check("analyse derives the bump from the status endpoint's provider", draft.bump === (await deriveRecordPda(origina.address, draft.file_hash)).bump);
    check("file_hash matches Node's SHA-256 of the same bytes", draft.file_hash === createHash("sha256").update(data).digest("hex"));

    const first = await app.anchor({ record: draft, model: "Stable Diffusion XL" });
    check("OriginaClient.anchor completes the whole flow", !first.alreadyAnchored && !!first.record.signature && first.record.model === "Stable Diffusion XL");
    check("the record gets the connected wallet as creator and a real slot just before submit", first.record.creator === judge.address && (first.record.slot ?? 0) > 0 && first.record.slot! <= first.record.confirmed_slot!);
    check("the record's PDA is the on-chain account", first.record.pda === (await deriveRecordPda(origina.address, draft.file_hash)).address);
    check("the full record is in the in-memory Map under the SHA-256 hex", recordStore.get(draft.file_hash)?.pda === first.record.pda && recordStore.get(draft.file_hash)?.perceptual_hash === draft.perceptual_hash);

    const second = await app.anchor({ record: draft, model: "Midjourney" });
    check("anchoring again reports 'already anchored' and keeps the original model", second.alreadyAnchored && second.record.model === "Stable Diffusion XL" && second.record.signature === null);
    check("an already-anchored result names who anchored first and when", second.existing?.creator === judge.address && (second.existing?.anchoredAt ?? 0) > 1_600_000_000 && first.existing === null);
    const stranger = new OriginaClient({ rpc, signer: null });
    const strangerResult = await stranger.anchor({ record: await stranger.analyse(data), model: "Flux" });
    check("a different (or no) wallet anchoring the same file gets the original record, naming the original creator", strangerResult.alreadyAnchored && strangerResult.existing?.creator === judge.address && strangerResult.record.pda === first.record.pda && strangerResult.record.signature === null);
    const verified = await app.verify({ fileData: data });
    check("OriginaClient.verify finds it, with provider, creator and model", verified.exactMatch && verified.providerName === "Origina" && verified.creatorWallet === judge.address && verified.model === "Stable Diffusion XL");
    await app.anchor({ record: draft, model: "" }).then(
      () => check("the client refuses an empty model", false),
      (e: Error) => check("the client refuses an empty model", /model/i.test(e.message)),
    );

    // No wallet connected: the creator is null and nothing is asked of a wallet.
    const lone = new OriginaClient({ rpc, signer: null });
    const loneDraft = await lone.analyse(new TextEncoder().encode("no-wallet-image".repeat(200)));
    const loneResult = await lone.anchor({ record: loneDraft, model: "Flux" });
    check("with no wallet connected the stored creator is null", !loneResult.alreadyAnchored && loneResult.record.creator === null && recordStore.get(loneDraft.file_hash)?.creator === null);

    // A wallet that can only sign-and-send cannot co-sign: anchored without a creator instead of failing.
    const sendOnly = { address: judge2.address, signAndSendTransactions: async () => [] } as unknown as TransactionSigner;
    const degraded = new OriginaClient({ rpc, signer: sendOnly });
    const degradedResult = await degraded.anchor({ record: await degraded.analyse(new TextEncoder().encode("send-only-wallet".repeat(200))), model: "Flux" });
    check("a wallet that cannot co-sign still anchors, without a creator", degradedResult.record.creator === null && degradedResult.creatorSkipped);

    // A wallet that implements only the partial-signer interface works too.
    const viaPartial = await anchorWithOrigina(judge2, fields(await fingerprint("partial-path"), judge2, { perceptual_hash: "0x0000000000000abc" }) as never);
    check("a partial-signer wallet can co-sign as well", viaPartial.kind === "anchored");
  } finally {
    globalThis.fetch = realFetch;
  }

  // ---- wallets that append their own instructions (guards, priority fees) ----
  const chatty = await fingerprint("wallet-adds-compute-budget");
  const chattyPrep = await prepared(chatty, judge, "t5b");
  const withBudget = modifyingWallet(judge, (t) =>
    appendInstruction(appendInstruction(t, COMPUTE_BUDGET, computeUnitLimit(200_000)), COMPUTE_BUDGET, computeUnitPrice(1_000n)),
  );
  const [chattySigned] = (await withBudget.modifyAndSignTransactions!([decodeTx(chattyPrep.transaction!) as never])) as Transaction[];
  const chattyResult = await submitAnchor({ ...fields(chatty, judge), transaction: getBase64EncodedWireTransaction(chattySigned) }, "t5b");
  check("a wallet that adds compute-budget instructions still anchors", !!(await chain.getRecord(rpc, address(chattyResult.recordAddress))));

  // Semantic validator, directly: what is allowed and what is not.
  {
    const base = await buildAnchorTransaction({
      provider: origina.address, creator: judge.address, rentLamports: rent, fileHashHex: good.sha, phash: good.phash, c2paManifestHashHex: null,
      generatedAt: NOW(), model: "Midjourney", slot: 1, bump: 255, blockhash: (await rpc.getLatestBlockhash().send()).value.blockhash,
    });
    const accepts = (t: Transaction) => { try { validateSignedAnchorTransaction(base.messageBytes, t.messageBytes, origina.address); return true; } catch { return false; } };
    check("validator accepts the exact transaction", accepts(base as never));
    check("validator accepts an appended Lighthouse guard that only touches the user's account", accepts(appendInstruction(base as never, LIGHTHOUSE, new Uint8Array([1, 2, 3]), [judge.address])));
    check("validator accepts a capped priority fee", accepts(appendInstruction(base as never, COMPUTE_BUDGET, computeUnitPrice(50_000n))));
    check("validator refuses an uncapped priority fee", !accepts(appendInstruction(base as never, COMPUTE_BUDGET, computeUnitPrice(5_000_000_000n))));
    check("validator refuses an extra instruction that touches Origina's wallet", !accepts(appendInstruction(base as never, LIGHTHOUSE, new Uint8Array([1]), [origina.address])));
    check("validator refuses an unknown extra program", !accepts(appendInstruction(base as never, "11111111111111111111111111111111", new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]), [attacker.address])));
    check("validator refuses a request-heap-frame compute instruction", !accepts(appendInstruction(base as never, COMPUTE_BUDGET, new Uint8Array([1, 0, 0, 4, 0]))));
  }

  // ---- tampering: Origina signs only what it intended ----
  const t = await fingerprint("tamper-target");
  const tp = await prepared(t, judge, "t6", { model: "Midjourney" });
  const [signedT] = (await wallet.modifyAndSignTransactions!([decodeTx(tp.transaction!) as never])) as Transaction[];
  const wire = getBase64EncodedWireTransaction(signedT);
  await expectApiError("a different model than the one signed is refused", () => submitAnchor({ ...fields(t, judge, { model: "DALL-E 3" }), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different file than the one signed is refused", async () => submitAnchor({ ...fields(await fingerprint("other"), judge), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different claimed creator than the one signed is refused", () => submitAnchor({ ...fields(t, judge2), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different generated_at than the one signed is refused", () => submitAnchor({ ...fields(t, judge, { generated_at: NOW() - 5000 }), transaction: wire }, "t6"), 400, /doesn't match/);
  await expectApiError("a different C2PA hash than the one signed is refused", () => submitAnchor({ ...fields(t, judge, { c2pa_manifest_hash: c2pa }), transaction: wire }, "t6"), 400, /doesn't match/);
  const cheaper = modifyingWallet(judge, (x) => withTransferAmount(x, 1n));
  const [signedCheap] = (await cheaper.modifyAndSignTransactions!([decodeTx(tp.transaction!) as never])) as Transaction[];
  await expectApiError(
    "a reimbursement smaller than the rent is refused",
    () => submitAnchor({ ...fields(t, judge), transaction: getBase64EncodedWireTransaction(signedCheap) }, "t6"),
    400,
    /doesn't match/,
  );
  await expectApiError(
    "a transaction the user's wallet never signed is refused",
    () => submitAnchor({ ...fields(t, judge), transaction: tp.transaction }, "t6"),
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
  const hostile = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(origina.address), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([hostileIx as never], m),
    ),
  );
  const [attackerSig] = await attacker.signTransactions([hostile as never]);
  // Second layout: the attacker pays the fee themselves and tries to use Origina's signature to move Origina's SOL.
  const hostile2 = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(attacker.address), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
      (m) => appendTransactionMessageInstructions([hostileIx as never], m),
    ),
  );
  const [attackerSig2] = await attacker.signTransactions([hostile2 as never]);
  const attackerBefore = (await rpc.getBalance(attacker.address).send()).value;
  await expectApiError(
    "a hostile transaction that makes Origina the transfer source never gets Origina's signature",
    () => submitAnchor({ ...fields(t, attacker), transaction: getBase64EncodedWireTransaction({ ...hostile2, signatures: { ...hostile2.signatures, ...attackerSig2 } } as Transaction) }, "t7"),
    400,
  );
  await expectApiError(
    "a hostile transaction using Origina as fee payer never gets Origina's signature",
    () => submitAnchor({ ...fields(t, attacker), transaction: getBase64EncodedWireTransaction({ ...hostile, signatures: { ...hostile.signatures, ...attackerSig } } as Transaction) }, "t7"),
    400,
  );
  check("no SOL left Origina's wallet to the attacker", (await rpc.getBalance(attacker.address).send()).value === attackerBefore);
  check("the tampered anchors never created records", (await chain.findExistingRecord(rpc, origina.address, t.sha)).record === null);

  // ---- abuse limits ----
  for (let i = 0; i < 60; i++) await prepareAnchor(fields(img, judge), "burst");
  await expectApiError("the 61st prepare in an hour from one address is rate-limited (429)", () => prepareAnchor(fields(img, judge), "burst"), 429);

  process.env.ORIGINA_RESERVE_LAMPORTS = String(10n ** 15n);
  await expectApiError("wallet-less anchoring pauses (503) when Origina's wallet is below its reserve", async () => prepareAnchor(fields(await fingerprint("poor"), null), "t8"), 503, /out of devnet SOL/);
  const lowTx = await prepareAnchor(fields(await fingerprint("poor-but-user-pays"), judge), "t8");
  check("a paying wallet can still anchor when Origina's own balance is low", !lowTx.alreadyAnchored && !!lowTx.transaction);
  const lowStatus = await getAnchorStatus("s4");
  check("status: registry is ready but Origina can't pay for wallet-less anchors", lowStatus.ready && lowStatus.originaPays === false);
  delete process.env.ORIGINA_RESERVE_LAMPORTS;

  // ---- revocation ----
  await dc.sendTransaction([await getRevokeProviderInstructionAsync({ authority: deployer, provider: origina.address, reason: RevocationReason.Policy })]);
  check("revoked provider reports 'revoked'", (await chain.getProviderStatus(rpc, origina.address)).kind === "revoked");
  const revokedStatus = await getAnchorStatus("s5");
  check("status: revocation is reported as such", !revokedStatus.ready && revokedStatus.reason === "revoked");
  await expectApiError("a revoked Origina cannot anchor new files (503)", async () => prepareAnchor(fields(await fingerprint("after-revoke"), judge), "t9"), 503, /revoked/);
  check("records anchored before the revocation remain verifiable", (await chain.findMatch(rpc, img.sha, img.phash)).kind === "exact");

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

const bytesHex = (b: ArrayLike<number>) => Array.from(b as ArrayLike<number>).map((x) => x.toString(16).padStart(2, "0")).join("");

main().catch((e) => {
  console.error("\nTEST RUN CRASHED:", e);
  process.exit(2);
});
