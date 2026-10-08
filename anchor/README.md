# Origina

Origina is an on-chain registry for AI-generated image provenance on Solana.

Approved providers anchor records of each generated image on-chain with a SHA-256 of its file bytes, an optional perceptual hash, and a hash of its C2PA manifest. A record links to a creator wallet if that wallet signs the anchor transaction. Anyone can look the file up on-chain, and see when it was anchored and by which provider. **No media is stored on chain.**

## Contents

- [How it works](#how-it-works)
- [Accounts](#accounts)
- [Instructions](#instructions)
- [Revocation model](#revocation-model)
- [Build, Test, and Deploy](#build-test-and-deploy)
- [Program ID](#program-id)

## How it works
1. The registry authority approves providers after verifying their C2PA signing certificate off-chain.
2. An approved provider claims its registration by signing with its own key.
3. The provider anchors media at the point of generation. One on-chain record per file. A creator wallet is attached if that wallet also signs the transaction.
4. To verify, the record address of a hashed file is derived and fetched.
5. Providers can be revoked by the authority or by themselves. Revocation is permanent. The revocation record remains.

## Accounts

| Account            | Seeds                                     | Purpose                                                                       |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `RegistryAccount`  | `["registry"]`                            | One per program. Current registry authority and pending authority transfer.   |
| `ProviderApproval` | `["approval", provider_pubkey]`           | Pending approval waiting for the provider's claim. Closed on claim or cancel. |
| `ProviderAccount`  | `["provider", provider_pubkey]`           | Registered provider; never closed                                             |
| `ProvenanceRecord` | `["media", provider_pubkey, file_sha256]` | One record per image per provider                                             |

## Instructions
| Instruction                 | Signer                    | Effect                                                                       |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `init_registry`             | Program upgrade authority | Creates the registry once.                                                   |
| `propose_authority`         | Registry authority        | Sets a pending authority.                                                    |
| `accept_authority`          | Pending authority         | Completes the authority transfer.                                            |
| `cancel_authority_transfer` | Registry authority        | Clears the pending authority.                                                |
| `approve_provider`          | Registry authority        | Creates an approval (rejected if the provider is already registered).        |
| `cancel_provider_approval`  | Registry authority        | Closes an approval; rent refunded to the original approver.                  |
| `claim_provider`            | Provider                  | Creates the provider account from the approval. Closes the approval account. |
| `revoke_provider`           | Registry authority        | Revokes the provider account with `Policy` or `KeyCompromised`.              |
| `self_revoke_provider`      | Provider                  | Revokes the provider account with `Voluntary` or `KeyCompromised`.           |
| `anchor_media`              | Provider   (+ optional creator)               | Creates a provenance record. A co-signing creator's wallet is stored on the record.                                                |

Every instruction emits an event. `anchor_media` uses CPI events (`emit_cpi!`), which are stored in instruction data to prevent data loss from log-based events.

## Revocation model
Revocation **never rewrites history**. Records are never deleted or modified. Verifiers can compare a record's `slot` to the provider's `revocation.slot`. Records anchored before the revocation remain valid, except under `KeyCompromised`, where records shortly before it may be fraudulent. Records in the same slot as the revocation should be treated as suspect. No records can be anchored after revocation.

## Creator wallet
`creator_wallet` is optional and only set when the creator **signs** the `anchor_media` transaction. A provider cannot attach a wallet without its owner's signature, and cannot name itself as creator. As the records are permanent, it should be disclosed by providers to users before they sign that their wallet will be publicly linked to the media.

## Build, Test and Deploy
**Prerequisites**: Rust 1.89.0, Solana CLI, Anchor CLI 1.0.2.
```bash
anchor build

cargo test
```
Tests use [LiteSVM](https://github.com/LiteSVM/litesvm) and run in-process, with no validator or network needed. They cover the registry, the provider lifecycle, and media anchoring, including failure paths.

Deploy to devnet:
```bash
anchor deploy --provider.cluster devnet
```
Run `init_registry` immediately after deploying, signed by the deploying wallet (the upgrade authority). Verify with:
```bash
solana program show 8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi --url devnet
```

## Program ID
8n7frgF7141JQnvUVtqxXid6RoZbfv7J7mrxQ9hnTFbi
