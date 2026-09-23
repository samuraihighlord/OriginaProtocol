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
}
