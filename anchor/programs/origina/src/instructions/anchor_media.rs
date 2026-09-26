use anchor_lang::prelude::*;

use crate::{constants::*, error::RegistryError, state::*};

#[event]
pub struct MediaAnchored {
    pub record: Pubkey,
    pub provider: Pubkey,
    pub file_sha256: [u8; 32],
    pub c2pa_manifest_hash: [u8; 32],
    pub perceptual: Option<PerceptualHash>,
    pub slot: u64,
    pub generated_at: Option<i64>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(file_sha256: [u8; 32])]
pub struct AnchorMedia<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    #[account(
        seeds = [b"provider", provider.key().as_ref()],
        bump = provider_account.bump,
        constraint = provider_account.revocation.is_none() @ RegistryError::ProviderRevoked,
        constraint = provider.key() == provider_account.key @ RegistryError::Unauthorized
    )]
    pub provider_account: Account<'info, ProviderAccount>,
    #[account(
        init,
        payer = provider,
        space = 8 + ProvenanceRecord::INIT_SPACE,
        seeds = [b"media", provider.key().as_ref(), file_sha256.as_ref()],
        bump
    )]
    pub provenance_record: Account<'info, ProvenanceRecord>,
    pub system_program: Program<'info, System>,
}

impl<'info> AnchorMedia<'info> {
    pub fn anchor_media(
        &mut self,
        bumps: &AnchorMediaBumps,
        file_sha256: [u8; 32],
        perceptual: Option<PerceptualHash>,
        c2pa_manifest_hash: [u8; 32],
        generated_at: Option<i64>,
    ) -> Result<MediaAnchored> {
        require!(file_sha256 != ZERO_HASH, RegistryError::InvalidHash);
        require!(c2pa_manifest_hash != ZERO_HASH, RegistryError::InvalidHash);

        if let Some(p) = perceptual {
            require!(p.hash != ZERO_HASH, RegistryError::InvalidHash);
        }

        let slot = Clock::get()?.slot;
        let provider = self.provider.key();

        self.provenance_record.set_inner(ProvenanceRecord {
            provider,
            file_sha256,
            c2pa_manifest_hash,
            slot,
            bump: bumps.provenance_record,
            perceptual,
            generated_at,
        });

        Ok(MediaAnchored {
            record: self.provenance_record.key(),
            provider,
            file_sha256,
            c2pa_manifest_hash,
            perceptual,
            slot,
            generated_at,
        })
    }
}

pub fn handler(
    ctx: Context<AnchorMedia>,
    file_sha256: [u8; 32],
    perceptual: Option<PerceptualHash>,
    c2pa_manifest_hash: [u8; 32],
    generated_at: Option<i64>,
) -> Result<()> {
    let event = ctx.accounts.anchor_media(
        &ctx.bumps,
        file_sha256,
        perceptual,
        c2pa_manifest_hash,
        generated_at,
    )?;

    emit_cpi!(event);
    Ok(())
}
