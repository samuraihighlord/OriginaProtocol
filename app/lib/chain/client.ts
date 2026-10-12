import { createClient, createSolanaRpc } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { RPC_URL, WALLET_CHAIN, WS_URL } from "./config";

/**
 * Wallet-backed client: discovers Wallet Standard wallets (Phantom, Backpack, Solflare, ...), and once one is
 * connected it is both the fee payer and the signer. Transactions use the planner's default (v0), which every
 * wallet supports and which is plenty for this app's small transactions.
 * Browser-only — create it from an effect, never at module scope (the page is also prerendered on the server).
 */
export async function createWalletClient() {
  return await createClient()
    .use(walletSigner({ chain: WALLET_CHAIN }))
    .use(solanaRpc({ rpcUrl: RPC_URL, ...(WS_URL ? { rpcSubscriptionsUrl: WS_URL } : {}) }));
}

export type WalletClient = Awaited<ReturnType<typeof createWalletClient>>;

/** Read-only RPC, usable without a wallet (verification only needs reads). */
export const createReadRpc = () => createSolanaRpc(RPC_URL);
