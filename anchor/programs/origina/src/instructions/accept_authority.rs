use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::RegistryAccount};

#[event]
pub struct AuthorityTransferAccepted {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub new_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry_account.bump,
        constraint = registry_account.pending_authority == Some(new_authority.key()) @ RegistryError::Unauthorized
    )]
    pub registry_account: Account<'info, RegistryAccount>,
}

impl<'info> AcceptAuthority<'info> {
    pub fn accept_authority(&mut self) -> Result<()> {
        emit!(AuthorityTransferAccepted {
            old_authority: self.registry_account.authority,
            new_authority: self.new_authority.key()
        });

        self.registry_account.authority = self.new_authority.key();
        self.registry_account.pending_authority = None;

        Ok(())
    }
}

pub fn handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    ctx.accounts.accept_authority()?;
    Ok(())
}
