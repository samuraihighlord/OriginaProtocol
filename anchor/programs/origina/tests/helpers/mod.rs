use {
    anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas},
    litesvm::{types::TransactionResult, LiteSVM},
    origina::{
        PerceptualHash, ProvenanceRecord, ProviderAccount, ProviderApproval, RegistryAccount,
        RevocationReason,
    },
    solana_instruction::Instruction,
    solana_keypair::Keypair,
    solana_message::Message,
    solana_native_token::LAMPORTS_PER_SOL,
    solana_pubkey::Pubkey,
    solana_sdk_ids::{bpf_loader_upgradeable, system_program::ID as SYSTEM_PROGRAM_ID},
    solana_signer::Signer,
    solana_transaction::Transaction,
    std::path::PathBuf,
};

pub static PROGRAM_ID: Pubkey = origina::ID;

pub fn provider_pda(provider: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"provider", provider.as_ref()], &PROGRAM_ID).0
}

pub fn approval_pda(provider: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"approval", provider.as_ref()], &PROGRAM_ID).0
}

pub fn media_pda(provider: &Pubkey, file_sha256: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(
        &[b"media", provider.as_ref(), file_sha256.as_ref()],
        &PROGRAM_ID,
    )
    .0
}

pub struct TestConfig {
    pub program: LiteSVM,
    pub authority: Keypair,
    pub registry_pda: Pubkey,
    pub program_data: Pubkey,
    pub event_authority: Pubkey,
    pub system_program: Pubkey,
}

impl TestConfig {
    pub fn send(
        svm: &mut LiteSVM,
        ix: Instruction,
        signer: &Keypair,
        label: &str,
    ) -> TransactionResult {
        let message = Message::new(&[ix], Some(&signer.pubkey()));
        let tx = Transaction::new(&[signer], message, svm.latest_blockhash());
        let result = svm.send_transaction(tx);
        match &result {
            Ok(meta) => println!(
                "{}\n{label} succeeded | CUs: {}",
                meta.pretty_logs(),
                meta.compute_units_consumed
            ),
            Err(failed) => println!(
                "{}\n{label} failed | error: {:?}",
                failed.meta.pretty_logs(),
                failed.err
            ),
        }
        result
    }

    pub fn init_registry(&mut self) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::InitRegistry {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
                program: PROGRAM_ID,
                program_data: self.program_data,
                system_program: self.system_program,
            }
            .to_account_metas(None),
            data: origina::instruction::InitRegistry {}.data(),
        };

        Self::send(&mut self.program, ix, &self.authority, "init_registry")
    }

    pub fn propose_authority(&mut self, pending_authority: Pubkey) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::ProposeAuthority {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
            }
            .to_account_metas(None),
            data: origina::instruction::ProposeAuthority { pending_authority }.data(),
        };
        Self::send(&mut self.program, ix, &self.authority, "propose_authority")
    }

    pub fn accept_authority(&mut self, new_authority: &Keypair) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::AcceptAuthority {
                new_authority: new_authority.pubkey(),
                registry_account: self.registry_pda,
            }
            .to_account_metas(None),
            data: origina::instruction::AcceptAuthority {}.data(),
        };
        Self::send(&mut self.program, ix, new_authority, "accept_authority")
    }

    pub fn cancel_authority_transfer(&mut self) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::CancelAuthorityTransfer {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
            }
            .to_account_metas(None),
            data: origina::instruction::CancelAuthorityTransfer {}.data(),
        };
        Self::send(
            &mut self.program,
            ix,
            &self.authority,
            "cancel_authority_transfer",
        )
    }

    pub fn approve_provider(
        &mut self,
        provider: Pubkey,
        name: String,
        c2pa_cert_identity: [u8; 32],
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::ApproveProvider {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
                provider_approval: approval_pda(&provider),
                provider_account: provider_pda(&provider),
                system_program: self.system_program,
            }
            .to_account_metas(None),
            data: origina::instruction::ApproveProvider {
                provider,
                name,
                c2pa_cert_identity,
            }
            .data(),
        };
        Self::send(&mut self.program, ix, &self.authority, "approve_provider")
    }

    pub fn claim_provider(&mut self, provider: &Keypair, approved_by: Pubkey) -> TransactionResult {
        let key = provider.pubkey();
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::ClaimProvider {
                provider: key,
                approved_by,
                provider_account: provider_pda(&key),
                provider_approval: approval_pda(&key),
                system_program: self.system_program,
            }
            .to_account_metas(None),
            data: origina::instruction::ClaimProvider {}.data(),
        };
        Self::send(&mut self.program, ix, provider, "claim_provider")
    }

    pub fn cancel_provider_approval(
        &mut self,
        provider: Pubkey,
        approved_by: Pubkey,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::CancelProviderApproval {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
                provider_approval: approval_pda(&provider),
                approved_by,
            }
            .to_account_metas(None),
            data: origina::instruction::CancelProviderApproval { provider }.data(),
        };
        Self::send(
            &mut self.program,
            ix,
            &self.authority,
            "cancel_provider_approval",
        )
    }

    pub fn revoke_provider(
        &mut self,
        provider: Pubkey,
        reason: RevocationReason,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::RevokeProvider {
                authority: self.authority.pubkey(),
                registry_account: self.registry_pda,
                provider_account: provider_pda(&provider),
            }
            .to_account_metas(None),
            data: origina::instruction::RevokeProvider { provider, reason }.data(),
        };
        Self::send(&mut self.program, ix, &self.authority, "revoke_provider")
    }

    pub fn self_revoke_provider(
        &mut self,
        provider: &Keypair,
        reason: RevocationReason,
    ) -> TransactionResult {
        let key = provider.pubkey();
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::SelfRevokeProvider {
                provider: key,
                provider_account: provider_pda(&key),
            }
            .to_account_metas(None),
            data: origina::instruction::SelfRevokeProvider { reason }.data(),
        };
        Self::send(&mut self.program, ix, provider, "self_revoke_provider")
    }

    pub fn anchor_media(
        &mut self,
        provider: &Keypair,
        file_sha256: [u8; 32],
        perceptual: Option<PerceptualHash>,
        c2pa_manifest_hash: [u8; 32],
        generated_at: Option<i64>,
    ) -> TransactionResult {
        let key = provider.pubkey();
        let ix = Instruction {
            program_id: PROGRAM_ID,
            accounts: origina::accounts::AnchorMedia {
                provider: key,
                provider_account: provider_pda(&key),
                provenance_record: media_pda(&key, &file_sha256),
                system_program: self.system_program,
                event_authority: self.event_authority,
                program: PROGRAM_ID,
            }
            .to_account_metas(None),
            data: origina::instruction::AnchorMedia {
                file_sha256,
                perceptual,
                c2pa_manifest_hash,
                generated_at,
            }
            .data(),
        };
        Self::send(&mut self.program, ix, provider, "anchor_media")
    }

    fn read<T: AccountDeserialize>(&self, address: &Pubkey) -> Option<T> {
        let account = self.program.get_account(address)?;
        Some(
            T::try_deserialize(&mut account.data.as_slice())
                .unwrap_or_else(|e| panic!("failed to deserialize account {address}: {e:?}")),
        )
    }

    pub fn registry(&self) -> Option<RegistryAccount> {
        self.read(&self.registry_pda)
    }

    pub fn provider_account(&self, provider: &Pubkey) -> Option<ProviderAccount> {
        self.read(&provider_pda(provider))
    }

    pub fn provider_approval(&self, provider: &Pubkey) -> Option<ProviderApproval> {
        self.read(&approval_pda(provider))
    }

    pub fn provenance_record(
        &self,
        provider: &Pubkey,
        file_sha256: &[u8; 32],
    ) -> Option<ProvenanceRecord> {
        self.read(&media_pda(provider, file_sha256))
    }
}

pub fn setup() -> TestConfig {
    let mut program = LiteSVM::new();
    let authority = Keypair::new();

    program
        .airdrop(&authority.pubkey(), 10 * LAMPORTS_PER_SOL)
        .expect("Failed to airdrop SOL to authority");

    let so_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/deploy/origina.so");
    let program_bytes = std::fs::read(so_path).expect("Failed to read program SO file");
    program
        .add_program(PROGRAM_ID, &program_bytes)
        .expect("Failed to deploy program");

    let registry_pda = Pubkey::find_program_address(&[b"registry"], &PROGRAM_ID).0;
    let program_data =
        Pubkey::find_program_address(&[PROGRAM_ID.as_ref()], &bpf_loader_upgradeable::ID).0;
    let event_authority = Pubkey::find_program_address(&[b"__event_authority"], &PROGRAM_ID).0;

    let mut pd = program
        .get_account(&program_data)
        .expect("ProgramData missing");
    assert_eq!(
        &pd.data[0..4],
        &3u32.to_le_bytes(),
        "not a ProgramData account"
    );
    pd.data[12] = 1;
    pd.data[13..45].copy_from_slice(authority.pubkey().as_ref());
    program
        .set_account(program_data, pd)
        .expect("failed to patch ProgramData");

    println!(
        "ProgramData exists: {}",
        program.get_account(&program_data).is_some()
    );

    TestConfig {
        program,
        authority,
        registry_pda,
        program_data,
        event_authority,
        system_program: SYSTEM_PROGRAM_ID,
    }
}

pub fn setup_initialized() -> TestConfig {
    let mut t = setup();
    t.init_registry().unwrap();
    t
}

pub fn funded_keypair(t: &mut TestConfig) -> Keypair {
    let kp = Keypair::new();
    t.program.airdrop(&kp.pubkey(), LAMPORTS_PER_SOL).unwrap();
    kp
}

pub const NAME: &str = "Ramdon House";
pub const CERT: [u8; 32] = [7u8; 32];

pub fn register_provider(t: &mut TestConfig) -> Keypair {
    let provider = funded_keypair(t);
    t.approve_provider(provider.pubkey(), NAME.to_string(), CERT)
        .unwrap();
    let approved_by = t.authority.pubkey();
    t.claim_provider(&provider, approved_by).unwrap();
    provider
}
