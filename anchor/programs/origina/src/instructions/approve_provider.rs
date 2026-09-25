use anchor_lang::prelude::*;

use crate::{constants::*, error::RegistryError, state::*};

#[event]
pub struct ProviderApproved {
    pub provider: Pubkey,
    pub approved_by: Pubkey,
    pub name: String,
    pub c2pa_cert_identity: [u8; 32],
    pub slot: u64,
}

#[derive(Accounts)]
#[instruction(provider: Pubkey)]
pub struct ApproveProvider<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"registry"],
        bump = registry_account.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub registry_account: Account<'info, RegistryAccount>,

    #[account(
        init,
        seeds = [b"approval", provider.as_ref()],
        payer = authority,
        space = 8 + ProviderApproval::INIT_SPACE,
        bump
    )]
    pub provider_approval: Account<'info, ProviderApproval>,
    #[account(
        seeds = [b"provider", provider.as_ref()],
        bump,
    )]
    pub provider_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> ApproveProvider<'info> {
    pub fn approve_provider(
        &mut self,
        provider: Pubkey,
        name: String,
        c2pa_cert_identity: [u8; 32],
        bumps: &ApproveProviderBumps,
    ) -> Result<()> {
        require!(
            !name.is_empty() && name.len() <= MAX_NAME_LEN,
            RegistryError::InvalidName
        );
        require!(
            provider != Pubkey::default(),
            RegistryError::InvalidProvider
        );
        require!(
            c2pa_cert_identity != [0u8; 32],
            RegistryError::InvalidCertIdentity
        );

        let slot = Clock::get()?.slot;
        let approved_by = self.authority.key();

        self.provider_approval.set_inner(ProviderApproval {
            provider,
            name: name.clone(),
            c2pa_cert_identity,
            approved_by,
            approved_slot: slot,
            bump: bumps.provider_approval,
        });

        emit!(ProviderApproved {
            provider,
            approved_by,
            name,
            c2pa_cert_identity,
            slot,
        });

        Ok(())
    }
}

pub fn handler(
    ctx: Context<ApproveProvider>,
    provider: Pubkey,
    name: String,
    c2pa_cert_identity: [u8; 32],
) -> Result<()> {
    ctx.accounts
        .approve_provider(provider, name, c2pa_cert_identity, &ctx.bumps)?;
    Ok(())
}
