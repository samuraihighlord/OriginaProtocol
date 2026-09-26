use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RegistryAccount {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProviderAccount {
    pub key: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub approved_by: Pubkey,
    pub c2pa_cert_identity: [u8; 32],
    pub activated_slot: u64,
    pub revocation: Option<Revocation>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProviderApproval {
    pub provider: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub c2pa_cert_identity: [u8; 32],
    pub approved_by: Pubkey,
    pub approved_slot: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProvenanceRecord {
    pub provider: Pubkey,
    pub file_sha256: [u8; 32],
    pub perceptual: Option<PerceptualHash>,
    pub c2pa_manifest_hash: [u8; 32],
    pub slot: u64,
    pub generated_at: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct Revocation {
    pub slot: u64,
    pub reason: RevocationReason,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct PerceptualHash {
    pub alg: PerceptualAlg,
    pub hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RevocationReason {
    KeyCompromised,
    Voluntary,
    Policy,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PerceptualAlg {
    None,
    PHash,
    Pdq,
}
