use anchor_lang::prelude::*;

use crate::{constants::*, error::RegistryError, state::*};

#[event]
pub struct ProviderRegistered {
    pub provider: Pubkey,
    pub name: String,
    pub c2pa_cert_identity: [u8; 32],
    pub slot: u64,
}

#[derive(Accounts)]
pub struct ClaimProvider<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,
    /// CHECK: used for pda constraint
    #[account(mut)]
    pub approved_by: UncheckedAccount<'info>,
    #[account(
        init,
        payer = provider,
        space = 8 + ProviderAccount::INIT_SPACE,
        seeds = [b"provider", provider.key().as_ref()],
        bump
    )]
    pub provider_account: Account<'info, ProviderAccount>,
    #[account(
        mut,
        seeds = [b"approval", provider.key().as_ref()],
        bump = provider_approval.bump,
        close = approved_by,
        has_one = approved_by
    )]
    pub provider_approval: Account<'info, ProviderApproval>,
    pub system_program: Program<'info, System>,
}

impl<'info> ClaimProvider<'info> {
    pub fn claim_provider(&mut self, bumps: &ClaimProviderBumps) -> Result<()> {
        let slot = Clock::get()?.slot;
        let key = self.provider.key();

        let name = self.provider_approval.name.clone();
        let c2pa_cert_identity = self.provider_approval.c2pa_cert_identity;

        self.provider_account.set_inner(ProviderAccount {
            key,
            name: name.clone(),
            approved_by: self.provider_approval.approved_by,
            c2pa_cert_identity,
            activated_slot: slot,
            revocation: None,
            bump: bumps.provider_account,
        });

        emit!(ProviderRegistered {
            provider: key,
            name,
            c2pa_cert_identity,
            slot,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<ClaimProvider>) -> Result<()> {
    ctx.accounts.claim_provider(&ctx.bumps)?;
    Ok(())
}
