use anchor_lang::prelude::*;

use crate::{error::RegistryError, ProviderAccount, ProviderRevoked, Revocation, RevocationReason};

#[derive(Accounts)]
pub struct SelfRevokeProvider<'info> {
    pub provider: Signer<'info>,
    #[account(
        mut,
        seeds = [b"provider", provider.key().as_ref()],
        bump = provider_account.bump,
        constraint = provider_account.key == provider.key() @ RegistryError::Unauthorized,
        constraint = provider_account.revocation.is_none() @ RegistryError::ProviderAlreadyRevoked,
    )]
    pub provider_account: Account<'info, ProviderAccount>,
}

impl<'info> SelfRevokeProvider<'info> {
    pub fn self_revoke_provider(&mut self, reason: RevocationReason) -> Result<()> {
        require!(
            matches!(
                reason,
                RevocationReason::Voluntary | RevocationReason::KeyCompromised
            ),
            RegistryError::InvalidRevocationReason
        );

        let slot = Clock::get()?.slot;
        let provider = self.provider.key();

        self.provider_account.revocation = Some(Revocation { slot, reason });

        emit!(ProviderRevoked {
            provider,
            revoked_by: provider,
            name: self.provider_account.name.clone(),
            slot,
            reason,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<SelfRevokeProvider>, reason: RevocationReason) -> Result<()> {
    ctx.accounts.self_revoke_provider(reason)?;
    Ok(())
}
