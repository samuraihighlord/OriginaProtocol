pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi");

#[program]
pub mod origina {
    use super::*;

    pub fn init_registry(ctx: Context<InitRegistry>) -> Result<()> {
        instructions::init_registry::handler(ctx)
    }

    pub fn set_registry_authority(
        ctx: Context<ProposeAuthority>,
        pending_authority: Pubkey,
    ) -> Result<()> {
        instructions::propose_authority::handler(ctx, pending_authority)
    }

    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handler(ctx)
    }

    pub fn cancel_authority_transfer(ctx: Context<CancelAuthorityTransfer>) -> Result<()> {
        instructions::cancel_authority_transfer::handler(ctx)
    }
}
