use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RegistryAccount {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProviderAccount {
    pub key: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub c2pa_cert_identity: [u8; 32],
    pub activated_slot: u64,
    pub revoked_slot: Option<u64>,
    pub reason: RevocationReason,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProvenanceRecord {
    pub provider: Pubkey,
    pub pixel_sha256: [u8; 32],
    pub perceptual_alg: PerceptualAlg,
    pub perceptual_hash: [u8; 32],
    pub c2pa_manifest_hash: [u8; 32],
    pub slot: u64,
    pub timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum RevocationReason {
    None,
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
