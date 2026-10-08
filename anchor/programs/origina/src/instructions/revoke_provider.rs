use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::*};

#[event]
pub struct ProviderRevoked {
    pub provider: Pubkey,
    pub revoked_by: Pubkey,
    pub name: String,
    pub slot: u64,
    pub reason: RevocationReason,
}

#[derive(Accounts)]
#[instruction(provider: Pubkey)]
pub struct RevokeProvider<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"registry"],
        bump = registry_account.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub registry_account: Account<'info, RegistryAccount>,
    #[account(
        mut,
        seeds = [b"provider", provider.as_ref()],
        bump = provider_account.bump,
        constraint = provider_account.revocation.is_none() @ RegistryError::ProviderRevoked,
    )]
    pub provider_account: Account<'info, ProviderAccount>,
}

impl<'info> RevokeProvider<'info> {
    pub fn revoke_provider(&mut self, provider: Pubkey, reason: RevocationReason) -> Result<()> {
        require!(
            matches!(
                reason,
                RevocationReason::Policy | RevocationReason::KeyCompromised
            ),
            RegistryError::InvalidRevocationReason
        );

        let slot = Clock::get()?.slot;
        self.provider_account.revocation = Some(Revocation { slot, reason });

        emit!(ProviderRevoked {
            provider,
            revoked_by: self.authority.key(),
            name: self.provider_account.name.clone(),
            slot,
            reason
        });

        Ok(())
    }
}

pub fn handler(
    ctx: Context<RevokeProvider>,
    provider: Pubkey,
    reason: RevocationReason,
) -> Result<()> {
    ctx.accounts.revoke_provider(provider, reason)?;
    Ok(())
}
