use anchor_lang::prelude::*;

use crate::{error::RegistryError, state::*};

#[event]
pub struct ProviderApprovalCancelled {
    pub provider: Pubkey,
    pub approved_by: Pubkey,
    pub cancelled_by: Pubkey,
    pub slot: u64,
}

#[derive(Accounts)]
#[instruction(provider: Pubkey)]
pub struct CancelProviderApproval<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"registry"],
        bump = registry_account.bump,
        has_one = authority @ RegistryError::Unauthorized
    )]
    pub registry_account: Account<'info, RegistryAccount>,
    #[account(
        mut,
        seeds = [b"approval", provider.as_ref()],
        bump = provider_approval.bump,
        has_one = approved_by @ RegistryError::InvalidRefundAccount,
        close = approved_by,
    )]
    pub provider_approval: Account<'info, ProviderApproval>,
    /// CHECK: used for pda validation
    #[account(mut)]
    pub approved_by: UncheckedAccount<'info>,
}

impl<'info> CancelProviderApproval<'info> {
    pub fn cancel_provider_approval(&mut self, provider: Pubkey) -> Result<()> {
        emit!(ProviderApprovalCancelled {
            provider,
            approved_by: self.approved_by.key(),
            cancelled_by: self.authority.key(),
            slot: Clock::get()?.slot,
        });

        Ok(())
    }
}

pub fn handler(ctx: Context<CancelProviderApproval>, provider: Pubkey) -> Result<()> {
    ctx.accounts.cancel_provider_approval(provider)?;
    Ok(())
}
