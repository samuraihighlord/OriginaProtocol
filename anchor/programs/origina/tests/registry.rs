mod helpers;
use helpers::*;

use anchor_lang::{
    prelude::*, solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
};
use solana_signer::Signer;

#[test]
fn init_registry_sets_authority() {
    let t = setup_initialized();
    let registry = t.registry().expect("registry missing");
    assert_eq!(registry.authority, t.authority.pubkey());
    assert!(registry.pending_authority.is_none());
}

#[test]
fn init_registry_twice_fails() {
    let mut t = setup_initialized();
    t.program.expire_blockhash();
    assert!(t.init_registry().is_err());
}

#[test]
fn init_registry_by_non_upgrade_authority_fails() {
    let mut t = setup();
    let intruder = funded_keypair(&mut t);

    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: origina::accounts::InitRegistry {
            authority: intruder.pubkey(),
            registry_account: t.registry_pda,
            program: PROGRAM_ID,
            program_data: t.program_data,
            system_program: t.system_program,
        }
        .to_account_metas(None),
        data: origina::instruction::InitRegistry {}.data(),
    };

    assert!(TestConfig::send(&mut t.program, ix, &intruder, "init_registry (intruder)").is_err());
    assert!(t.registry().is_none());
}

#[test]
fn propose_and_accept_transfers_authority() {
    let mut t = setup_initialized();
    let new_authority = funded_keypair(&mut t);

    t.propose_authority(new_authority.pubkey()).unwrap();
    assert_eq!(
        t.registry().unwrap().pending_authority,
        Some(new_authority.pubkey())
    );

    t.accept_authority(&new_authority).unwrap();
    let registry = t.registry().unwrap();
    assert_eq!(registry.authority, new_authority.pubkey());
    assert!(registry.pending_authority.is_none());

    assert!(t.propose_authority(Pubkey::new_unique()).is_err());
}

#[test]
fn propose_self_or_default_key_fails() {
    let mut t = setup_initialized();
    let current = t.authority.pubkey();
    assert!(t.propose_authority(current).is_err());
    assert!(t.propose_authority(Pubkey::default()).is_err());
}

#[test]
fn accept_by_wrong_key_fails() {
    let mut t = setup_initialized();
    let intruder = funded_keypair(&mut t);

    t.propose_authority(Pubkey::new_unique()).unwrap();
    assert!(t.accept_authority(&intruder).is_err());
    assert_eq!(t.registry().unwrap().authority, t.authority.pubkey());
}

#[test]
fn accept_with_nothing_pending_fails() {
    let mut t = setup_initialized();
    let new_authority = funded_keypair(&mut t);
    assert!(t.accept_authority(&new_authority).is_err());
}

#[test]
fn cancel_clears_pending_and_blocks_accept() {
    let mut t = setup_initialized();
    let new_authority = funded_keypair(&mut t);

    t.propose_authority(new_authority.pubkey()).unwrap();
    t.cancel_authority_transfer().unwrap();
    assert!(t.registry().unwrap().pending_authority.is_none());
    assert!(t.accept_authority(&new_authority).is_err());
}

#[test]
fn cancel_with_nothing_pending_fails() {
    let mut t = setup_initialized();
    assert!(t.cancel_authority_transfer().is_err());
}
