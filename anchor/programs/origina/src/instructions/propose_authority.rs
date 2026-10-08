use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::RegistryAccount};

#[event]
pub struct AuthorityTransferProposed {
    pub authority: Pubkey,
    pub pending_authority: Pubkey,
}

#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"registry"],
        bump = registry_account.bump,
        has_one = authority @ RegistryError::Unauthorized,
    )]
    pub registry_account: Account<'info, RegistryAccount>,
}

impl<'info> ProposeAuthority<'info> {
    pub fn propose_authority(&mut self, pending_authority: Pubkey) -> Result<()> {
        require!(
            pending_authority != self.authority.key(),
            RegistryError::InvalidAuthority
        );
        require!(
            pending_authority != Pubkey::default(),
            RegistryError::InvalidAuthority
        );
        self.registry_account.pending_authority = Some(pending_authority);

        emit!(AuthorityTransferProposed {
            authority: self.authority.key(),
            pending_authority
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<ProposeAuthority>, pending_authority: Pubkey) -> Result<()> {
    ctx.accounts.propose_authority(pending_authority)?;
    Ok(())
}
