use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Invalid Authority")]
    InvalidAuthority,
    #[msg("Invalid Program Data")]
    InvalidProgramData,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("No Pending Authority")]
    NoPendingAuthority,
}
