mod helpers;
use helpers::*;

use anchor_lang::prelude::*;
use origina::{PerceptualHash, RevocationReason};
use solana_signer::Signer;

const MANIFEST: [u8; 32] = [9u8; 32];
const GENERATED_AT: i64 = 1_700_000_000;

fn hash(n: u8) -> [u8; 32] {
    [n; 32]
}

fn perceptual() -> PerceptualHash {
    PerceptualHash {
        alg: origina::PerceptualAlg::Pdq,
        hash: hash(42),
    }
}

#[test]
fn anchor_creates_record_with_and_without_optional_fields() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    let key = provider.pubkey();

    t.anchor_media(
        &provider,
        hash(1),
        Some(perceptual()),
        MANIFEST,
        Some(GENERATED_AT),
    )
    .unwrap();
    let record = t.provenance_record(&key, &hash(1)).expect("record missing");
    assert_eq!(record.provider, key);
    assert_eq!(record.file_sha256, hash(1));
    assert_eq!(record.c2pa_manifest_hash, MANIFEST);
    assert_eq!(record.perceptual, Some(perceptual()));
    assert_eq!(record.generated_at, Some(GENERATED_AT));
    assert!(record.creator_wallet.is_none());

    t.anchor_media(&provider, hash(2), None, MANIFEST, None)
        .unwrap();
    let record = t.provenance_record(&key, &hash(2)).expect("record missing");
    assert_eq!(record.file_sha256, hash(2));
    assert!(record.perceptual.is_none());
    assert!(record.generated_at.is_none());
    assert!(record.creator_wallet.is_none());
}

#[test]
fn same_file_by_different_providers_succeeds() {
    let mut t = setup_initialized();
    let a = register_provider(&mut t);
    let b = register_provider(&mut t);

    t.anchor_media(&a, hash(1), None, MANIFEST, None).unwrap();
    t.anchor_media(&b, hash(1), None, MANIFEST, None).unwrap();
}

#[test]
fn anchor_same_file_twice_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    t.anchor_media(&provider, hash(1), None, MANIFEST, None)
        .unwrap();
    t.program.expire_blockhash();
    assert!(t
        .anchor_media(&provider, hash(1), None, MANIFEST, None)
        .is_err());
}

#[test]
fn anchor_rejects_zero_hashes() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    let zero_perceptual = PerceptualHash {
        hash: [0u8; 32],
        ..perceptual()
    };

    assert!(t
        .anchor_media(&provider, [0u8; 32], None, MANIFEST, None)
        .is_err());
    assert!(t
        .anchor_media(&provider, hash(1), None, [0u8; 32], None)
        .is_err());
    assert!(t
        .anchor_media(&provider, hash(2), Some(zero_perceptual), MANIFEST, None)
        .is_err());
}

#[test]
fn anchor_by_revoked_provider_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    t.revoke_provider(provider.pubkey(), RevocationReason::Policy)
        .unwrap();
    assert!(t
        .anchor_media(&provider, hash(1), None, MANIFEST, None)
        .is_err());
}

#[test]
fn anchor_by_unregistered_provider_fails() {
    let mut t = setup_initialized();
    let unregistered = funded_keypair(&mut t);
    assert!(t
        .anchor_media(&unregistered, hash(1), None, MANIFEST, None)
        .is_err());
}

#[test]
fn anchor_with_cosigning_creator_stores_wallet() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    let creator = funded_keypair(&mut t);

    t.anchor_media_with_creator(&provider, Some(&creator), hash(1), None, MANIFEST, None)
        .unwrap();
    let record = t
        .provenance_record(&provider.pubkey(), &hash(1))
        .expect("record missing");
    assert_eq!(record.creator_wallet, Some(creator.pubkey()));
}

#[test]
fn anchor_with_unsigned_creator_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    let creator = funded_keypair(&mut t);

    let mut ix = t.anchor_media_ix(
        provider.pubkey(),
        Some(creator.pubkey()),
        hash(1),
        None,
        MANIFEST,
        None,
    );
    for meta in ix.accounts.iter_mut() {
        if meta.pubkey == creator.pubkey() {
            meta.is_signer = false;
        }
    }
    assert!(TestConfig::send(
        &mut t.program,
        ix,
        &provider,
        "anchor_media_unsigned_creator"
    )
    .is_err());
}

#[test]
fn anchor_with_provider_as_creator_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    assert!(t
        .anchor_media_with_creator(&provider, Some(&provider), hash(1), None, MANIFEST, None)
        .is_err());
}
