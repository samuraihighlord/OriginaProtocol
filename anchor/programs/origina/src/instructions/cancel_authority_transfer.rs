use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::RegistryAccount};

#[event]
pub struct AuthorityTransferCancelled {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
}

#[derive(Accounts)]
pub struct CancelAuthorityTransfer<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry_account.bump,
        has_one = authority @ RegistryError::Unauthorized,
        constraint = registry_account.pending_authority.is_some() @ RegistryError::NoPendingAuthority
    )]
    pub registry_account: Account<'info, RegistryAccount>,
}

impl<'info> CancelAuthorityTransfer<'info> {
    pub fn cancel_authority_transfer(&mut self) -> Result<()> {
        let pending_authority = self
            .registry_account
            .pending_authority
            .take()
            .ok_or(RegistryError::NoPendingAuthority)?;

        emit!(AuthorityTransferCancelled {
            authority: self.authority.key(),
            pending_authority,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
    ctx.accounts.cancel_authority_transfer()?;
    Ok(())
}
