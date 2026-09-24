import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { computePhash, deriveProvenancePda, sha256 } from "@origina/sdk";
import { assert } from "chai";
import { Origina } from "../target/types/origina";

const MEDIA_TYPE_IMAGE = 0;
const MEDIA_TYPE_VIDEO = 1;

describe("origina", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Origina as Program<Origina>;

  function uniqueBytes(label: string): Uint8Array {
    return new TextEncoder().encode(`${label}-${Date.now()}-${Math.random()}`);
  }

  it("anchors a new AI media record and verifies all fields on-chain", async () => {
    const fileData = uniqueBytes("origina-happy-path");
    const hashBytes = await sha256(fileData);
    const phash = computePhash(fileData);
    const modelId = "midjourney-v6";
    const metadataUri = "https://example.com/manifest.json";

    const [pda] = deriveProvenancePda(hashBytes, program.programId);

    await program.methods
      .anchorMedia(
        Array.from(hashBytes),
        new anchor.BN(phash.toString()),
        modelId,
        MEDIA_TYPE_IMAGE,
        metadataUri
      )
      .accounts({
        creator: provider.wallet.publicKey,
        record: pda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.provenanceRecord.fetch(pda);

    assert.equal(
      Buffer.from(record.sha256Hash).toString("hex"),
      Buffer.from(hashBytes).toString("hex")
    );
    assert.equal(record.creator.toBase58(), provider.wallet.publicKey.toBase58());
    assert.equal(record.modelId, modelId);
    assert.equal(record.mediaType, MEDIA_TYPE_IMAGE);
    assert.equal(record.metadataUri, metadataUri);
    assert.equal(record.phash.toString(), phash.toString());
    assert.isNull(record.parent);
    assert.isAbove(record.timestamp.toNumber(), 0);
    assert.isAbove(record.slot.toNumber(), 0);
  });

  it("rejects a duplicate anchor for the same sha256 hash", async () => {
    const fileData = uniqueBytes("origina-duplicate");
    const hashBytes = await sha256(fileData);
    const phash = computePhash(fileData);
    const [pda] = deriveProvenancePda(hashBytes, program.programId);

    await program.methods
      .anchorMedia(Array.from(hashBytes), new anchor.BN(phash.toString()), "dall-e-3", MEDIA_TYPE_IMAGE, "")
      .accounts({
        creator: provider.wallet.publicKey,
        record: pda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    let threw = false;
    try {
      await program.methods
        .anchorMedia(
          Array.from(hashBytes),
          new anchor.BN(phash.toString()),
          "dall-e-3",
          MEDIA_TYPE_IMAGE,
          "second-attempt-should-not-land"
        )
        .accounts({
          creator: provider.wallet.publicKey,
          record: pda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      threw = true;
    }

    assert.isTrue(threw, "expected the duplicate anchor to be rejected");

    // The original record must be untouched by the failed second write.
    const record = await program.account.provenanceRecord.fetch(pda);
    assert.equal(record.metadataUri, "");
  });

  it("anchors an edit record linked to a parent and verifies the parent field", async () => {
    const parentData = uniqueBytes("origina-parent");
    const parentHash = await sha256(parentData);
    const parentPhash = computePhash(parentData);
    const [parentPda] = deriveProvenancePda(parentHash, program.programId);

    await program.methods
      .anchorMedia(
        Array.from(parentHash),
        new anchor.BN(parentPhash.toString()),
        "sora-1.0",
        MEDIA_TYPE_VIDEO,
        ""
      )
      .accounts({
        creator: provider.wallet.publicKey,
        record: parentPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const editData = uniqueBytes("origina-edit");
    const editHash = await sha256(editData);
    const editPhash = computePhash(editData);
    const [editPda] = deriveProvenancePda(editHash, program.programId);

    await program.methods
      .anchorEdit(
        Array.from(editHash),
        new anchor.BN(editPhash.toString()),
        "capcut-edit",
        MEDIA_TYPE_VIDEO,
        ""
      )
      .accounts({
        creator: provider.wallet.publicKey,
        parentRecord: parentPda,
        record: editPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const editRecord = await program.account.provenanceRecord.fetch(editPda);
    assert.isNotNull(editRecord.parent);
    assert.equal(editRecord.parent!.toBase58(), parentPda.toBase58());
  });
});
