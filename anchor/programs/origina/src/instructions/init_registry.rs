use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::RegistryAccount};

#[derive(Accounts)]
pub struct InitRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 +RegistryAccount::INIT_SPACE,
        seeds = [b"registry"],
        bump
    )]
    pub registry_account: Account<'info, RegistryAccount>,
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key()) @ RegistryError::InvalidProgramData
    )]
    pub program: Program<'info, crate::program::Origina>,
    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key()) @ RegistryError::Unauthorized
    )]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitRegistry<'info> {
    pub fn init_registry(&mut self, bumps: &InitRegistryBumps) -> Result<()> {
        self.registry_account.set_inner(RegistryAccount {
            authority: self.authority.key(),
            pending_authority: None,
            bump: bumps.registry_account,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<InitRegistry>) -> Result<()> {
    ctx.accounts.init_registry(&ctx.bumps)?;
    Ok(())
}
