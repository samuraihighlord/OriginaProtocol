use anchor_lang::prelude::*;

use crate::RegistryAccount;

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
    pub system_program: Program<'info, System>,
}

impl<'info> InitRegistry<'info> {
    pub fn init_registry(&mut self, bumps: &InitRegistryBumps) -> Result<()> {
        self.registry_account.set_inner(RegistryAccount {
            authority: self.authority.key(),
            bump: bumps.registry_account,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<InitRegistry>) -> Result<()> {
    ctx.accounts.init_registry(&ctx.bumps)?;
    Ok(())
}
