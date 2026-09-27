mod helpers;
use helpers::*;
use origina::RevocationReason;

use anchor_lang::prelude::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn impersonate(t: &mut TestConfig, signer: Keypair) {
    t.authority = signer;
}

#[test]
fn approve_creates_approval() {
    let mut t = setup_initialized();
    let provider = Pubkey::new_unique();

    t.approve_provider(provider, NAME.to_string(), CERT)
        .unwrap();

    let approval = t.provider_approval(&provider).expect("approval missing");
    assert_eq!(approval.provider, provider);
    assert_eq!(approval.name, NAME);
    assert_eq!(approval.c2pa_cert_identity, CERT);
    assert_eq!(approval.approved_by, t.authority.pubkey());
}

#[test]
fn approve_rejects_invalid_input() {
    let mut t = setup_initialized();
    let too_long = "a".repeat(33);

    assert!(t
        .approve_provider(Pubkey::new_unique(), String::new(), CERT)
        .is_err());
    assert!(t
        .approve_provider(Pubkey::new_unique(), too_long, CERT)
        .is_err());
    assert!(t
        .approve_provider(Pubkey::default(), NAME.to_string(), CERT)
        .is_err());
    assert!(t
        .approve_provider(Pubkey::new_unique(), NAME.to_string(), [0u8; 32])
        .is_err());
}

#[test]
fn approve_already_registered_provider_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    assert!(t
        .approve_provider(provider.pubkey(), NAME.to_string(), CERT)
        .is_err());
}

#[test]
fn claim_registers_provider_and_refunds_approval_rent() {
    let mut t = setup_initialized();
    let provider = funded_keypair(&mut t);
    let authority = t.authority.pubkey();

    t.approve_provider(provider.pubkey(), NAME.to_string(), CERT)
        .unwrap();
    let approval_rent = t
        .program
        .get_account(&approval_pda(&provider.pubkey()))
        .unwrap()
        .lamports;
    let balance_before = t.program.get_balance(&authority).unwrap();

    t.claim_provider(&provider, authority).unwrap();

    let account = t
        .provider_account(&provider.pubkey())
        .expect("provider account missing");
    assert_eq!(account.key, provider.pubkey());
    assert_eq!(account.name, NAME);
    assert_eq!(account.c2pa_cert_identity, CERT);
    assert!(account.revocation.is_none());

    assert!(t.provider_approval(&provider.pubkey()).is_none());
    assert_eq!(
        t.program.get_balance(&authority).unwrap(),
        balance_before + approval_rent
    );
}

#[test]
fn claim_without_approval_fails() {
    let mut t = setup_initialized();
    let unapproved = funded_keypair(&mut t);
    let authority = t.authority.pubkey();
    assert!(t.claim_provider(&unapproved, authority).is_err());
}

#[test]
fn claim_with_wrong_refund_account_fails() {
    let mut t = setup_initialized();
    let provider = funded_keypair(&mut t);

    t.approve_provider(provider.pubkey(), NAME.to_string(), CERT)
        .unwrap();
    assert!(t.claim_provider(&provider, Pubkey::new_unique()).is_err());
}

#[test]
fn cancel_closes_approval_and_blocks_claim() {
    let mut t = setup_initialized();
    let provider = funded_keypair(&mut t);
    let authority = t.authority.pubkey();

    t.approve_provider(provider.pubkey(), NAME.to_string(), CERT)
        .unwrap();
    t.cancel_provider_approval(provider.pubkey(), authority)
        .unwrap();

    assert!(t.provider_approval(&provider.pubkey()).is_none());
    assert!(t.claim_provider(&provider, authority).is_err());
}

#[test]
fn authority_gated_ixs_reject_non_authority() {
    let mut t = setup_initialized();
    let registered = register_provider(&mut t);
    let pending = Pubkey::new_unique();
    let real_authority = t.authority.pubkey();
    t.approve_provider(pending, NAME.to_string(), CERT).unwrap();

    let intruder = funded_keypair(&mut t);
    impersonate(&mut t, intruder);

    assert!(t
        .approve_provider(Pubkey::new_unique(), NAME.to_string(), CERT)
        .is_err());
    assert!(t.cancel_provider_approval(pending, real_authority).is_err());
    assert!(t
        .revoke_provider(registered.pubkey(), RevocationReason::Policy)
        .is_err());
}

#[test]
fn revoke_records_revocation() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    t.revoke_provider(provider.pubkey(), RevocationReason::Policy)
        .unwrap();

    let revocation = t
        .provider_account(&provider.pubkey())
        .unwrap()
        .revocation
        .expect("not revoked");
    assert_eq!(revocation.reason, RevocationReason::Policy);
}

#[test]
fn revoke_twice_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    t.revoke_provider(provider.pubkey(), RevocationReason::Policy)
        .unwrap();
    t.program.expire_blockhash();
    assert!(t
        .revoke_provider(provider.pubkey(), RevocationReason::Policy)
        .is_err());
}

#[test]
fn revoke_with_voluntary_reason_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    assert!(t
        .revoke_provider(provider.pubkey(), RevocationReason::Voluntary)
        .is_err());
}

#[test]
fn self_revoke_records_revocation() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);

    t.self_revoke_provider(&provider, RevocationReason::KeyCompromised)
        .unwrap();

    let revocation = t
        .provider_account(&provider.pubkey())
        .unwrap()
        .revocation
        .expect("not revoked");
    assert_eq!(revocation.reason, RevocationReason::KeyCompromised);
}

#[test]
fn self_revoke_with_policy_reason_fails() {
    let mut t = setup_initialized();
    let provider = register_provider(&mut t);
    assert!(t
        .self_revoke_provider(&provider, RevocationReason::Policy)
        .is_err());
}
