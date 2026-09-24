use anchor_lang::prelude::*;

declare_id!("EyfitU6WEPfrtmvGxhzZdn8vruro2SY4oaeNtAFST6g4");

const SEED_PREFIX: &[u8] = b"provenance";
const MAX_MODEL_ID_LEN: usize = 64;
const MAX_METADATA_URI_LEN: usize = 200;

#[program]
pub mod origina {
    use super::*;

    /// Anchors a new, root provenance record for a piece of AI-generated media.
    /// The record's address is derived solely from `sha256_hash`, so the same
    /// file always maps to the same on-chain address and a duplicate anchor
    /// attempt is rejected automatically by the `init` constraint below.
    pub fn anchor_media(
        ctx: Context<AnchorMedia>,
        sha256_hash: [u8; 32],
        phash: u64,
        model_id: String,
        media_type: u8,
        metadata_uri: String,
    ) -> Result<()> {
        require!(model_id.len() <= MAX_MODEL_ID_LEN, OriginaError::ModelIdTooLong);
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            OriginaError::MetadataUriTooLong
        );
        require!(media_type <= 3, OriginaError::InvalidMediaType);

        let record = &mut ctx.accounts.record;
        let clock = Clock::get()?;

        record.creator = ctx.accounts.creator.key();
        record.sha256_hash = sha256_hash;
        record.phash = phash;
        record.model_id = model_id;
        record.media_type = media_type;
        record.timestamp = clock.unix_timestamp;
        record.slot = clock.slot;
        record.parent = None;
        record.metadata_uri = metadata_uri;
        record.bump = ctx.bumps.record;

        Ok(())
    }

    /// Anchors a new provenance record that is explicitly linked to a parent
    /// record, for edit chains (e.g. an AI-generated clip that was later
    /// trimmed/color-graded in CapCut). The parent must already exist as a
    /// valid ProvenanceRecord owned by this program.
    pub fn anchor_edit(
        ctx: Context<AnchorEdit>,
        sha256_hash: [u8; 32],
        phash: u64,
        model_id: String,
        media_type: u8,
        metadata_uri: String,
    ) -> Result<()> {
        require!(model_id.len() <= MAX_MODEL_ID_LEN, OriginaError::ModelIdTooLong);
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            OriginaError::MetadataUriTooLong
        );
        require!(media_type <= 3, OriginaError::InvalidMediaType);

        let parent_key = ctx.accounts.parent_record.key();

        let record = &mut ctx.accounts.record;
        let clock = Clock::get()?;

        record.creator = ctx.accounts.creator.key();
        record.sha256_hash = sha256_hash;
        record.phash = phash;
        record.model_id = model_id;
        record.media_type = media_type;
        record.timestamp = clock.unix_timestamp;
        record.slot = clock.slot;
        record.parent = Some(parent_key);
        record.metadata_uri = metadata_uri;
        record.bump = ctx.bumps.record;

        Ok(())
    }

    /// Reads an existing provenance record and emits its fields as an event.
    /// Off-chain verifiers should prefer a direct `getAccountInfo` on the
    /// derived PDA (no transaction, no fee, sub-200ms) — this instruction
    /// exists for on-chain composability / CPI callers that need a
    /// program-verified read inside their own transaction.
    pub fn verify_record(ctx: Context<VerifyRecord>) -> Result<()> {
        let record = &ctx.accounts.record;

        emit!(ProvenanceVerified {
            record: record.key(),
            creator: record.creator,
            sha256_hash: record.sha256_hash,
            phash: record.phash,
            model_id: record.model_id.clone(),
            media_type: record.media_type,
            timestamp: record.timestamp,
            slot: record.slot,
            parent: record.parent,
        });

        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct ProvenanceRecord {
    pub creator: Pubkey,
    pub sha256_hash: [u8; 32],
    pub phash: u64,
    #[max_len(64)]
    pub model_id: String,
    pub media_type: u8,
    pub timestamp: i64,
    pub slot: u64,
    pub parent: Option<Pubkey>,
    #[max_len(200)]
    pub metadata_uri: String,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(sha256_hash: [u8; 32])]
pub struct AnchorMedia<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + ProvenanceRecord::INIT_SPACE,
        seeds = [SEED_PREFIX, sha256_hash.as_ref()],
        bump
    )]
    pub record: Account<'info, ProvenanceRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(sha256_hash: [u8; 32])]
pub struct AnchorEdit<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The existing provenance record this new record edits.
    pub parent_record: Account<'info, ProvenanceRecord>,

    #[account(
        init,
        payer = creator,
        space = 8 + ProvenanceRecord::INIT_SPACE,
        seeds = [SEED_PREFIX, sha256_hash.as_ref()],
        bump
    )]
    pub record: Account<'info, ProvenanceRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyRecord<'info> {
    pub record: Account<'info, ProvenanceRecord>,
}

#[event]
pub struct ProvenanceVerified {
    pub record: Pubkey,
    pub creator: Pubkey,
    pub sha256_hash: [u8; 32],
    pub phash: u64,
    pub model_id: String,
    pub media_type: u8,
    pub timestamp: i64,
    pub slot: u64,
    pub parent: Option<Pubkey>,
}

#[error_code]
pub enum OriginaError {
    #[msg("model_id exceeds maximum length of 64 bytes")]
    ModelIdTooLong,
    #[msg("metadata_uri exceeds maximum length of 200 bytes")]
    MetadataUriTooLong,
    #[msg("media_type must be 0 (image), 1 (video), 2 (audio), or 3 (text)")]
    InvalidMediaType,
}
