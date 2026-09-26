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

    pub fn propose_authority(
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

    pub fn approve_provider(
        ctx: Context<ApproveProvider>,
        provider: Pubkey,
        name: String,
        c2pa_cert_identity: [u8; 32],
    ) -> Result<()> {
        instructions::approve_provider::handler(ctx, provider, name, c2pa_cert_identity)
    }

    pub fn claim_provider(ctx: Context<ClaimProvider>) -> Result<()> {
        instructions::claim_provider::handler(ctx)
    }

    pub fn cancel_provider_approval(
        ctx: Context<CancelProviderApproval>,
        provider: Pubkey,
    ) -> Result<()> {
        instructions::cancel_provider_approval::handler(ctx, provider)
    }

    pub fn revoke_provider(
        ctx: Context<RevokeProvider>,
        provider: Pubkey,
        reason: RevocationReason,
    ) -> Result<()> {
        instructions::revoke_provider::handler(ctx, provider, reason)
    }

    pub fn self_revoke_provider(
        ctx: Context<SelfRevokeProvider>,
        reason: RevocationReason,
    ) -> Result<()> {
        instructions::self_revoke_provider::handler(ctx, reason)
    }

    pub fn anchor_media(
        ctx: Context<AnchorMedia>,
        file_sha256: [u8; 32],
        perceptual: Option<PerceptualHash>,
        c2pa_manifest_hash: [u8; 32],
        generated_at: Option<i64>,
    ) -> Result<()> {
        instructions::anchor_media::handler(
            ctx,
            file_sha256,
            perceptual,
            c2pa_manifest_hash,
            generated_at,
        )
    }
}
