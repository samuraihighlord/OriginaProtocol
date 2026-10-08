export type ClusterName = "devnet" | "localnet";

export const CLUSTER: ClusterName = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "localnet" ? "localnet" : "devnet";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  (CLUSTER === "localnet" ? "http://127.0.0.1:8899" : "https://api.devnet.solana.com");

/** Websocket endpoint; undefined lets the RPC plugin derive it from RPC_URL (right for devnet/mainnet). */
export const WS_URL =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? (CLUSTER === "localnet" ? "ws://127.0.0.1:8900" : undefined);

/** Wallet Standard chain id the wallet is asked to sign for. */
export const WALLET_CHAIN = CLUSTER === "localnet" ? "solana:localnet" : "solana:devnet";

const clusterQuery =
  CLUSTER === "localnet"
    ? `?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`
    : "?cluster=devnet";

export const explorerAddressUrl = (addr: string) => `https://explorer.solana.com/address/${addr}${clusterQuery}`;

export const explorerTxUrl = (signature: string) => `https://explorer.solana.com/tx/${signature}${clusterQuery}`;
