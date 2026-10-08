import type { Address } from "@solana/kit";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { OriginaClient } from "../originaClient";
import { type WalletClient, createReadRpc, createWalletClient } from "./client";
import { describeChainError } from "./errors";

type WalletState = ReturnType<WalletClient["wallet"]["getState"]>;
export type UiWallet = WalletState["wallets"][number];

const EMPTY_STATE = { connected: null, reconnectingTo: null, status: "pending", wallets: [] } as unknown as WalletState;
const noopSubscribe = () => () => {};

/**
 * Everything the UI needs about the chain: wallet discovery/connection and an OriginaClient wired to the connected
 * wallet. Browser-only (the wallet client is created in an effect).
 */
export function useChain() {
  const rpc = useMemo(() => createReadRpc(), []);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);

  useEffect(() => {
    let disposed = false;
    let created: WalletClient | null = null;
    const dispose = (c: WalletClient) => (c as unknown as { [Symbol.dispose]?: () => void })[Symbol.dispose]?.();
    createWalletClient().then((c) => {
      if (disposed) return dispose(c);
      created = c;
      setWalletClient(c);
    });
    return () => {
      disposed = true;
      if (created) dispose(created);
      setWalletClient(null);
    };
  }, []);

  const wallet = useSyncExternalStore(
    walletClient ? walletClient.wallet.subscribe : noopSubscribe,
    walletClient ? walletClient.wallet.getState : () => EMPTY_STATE,
    () => EMPTY_STATE,
  );

  const connectedAddress = (wallet.connected?.account.address ?? null) as Address | null;

  const [walletError, setWalletError] = useState<string | null>(null);
  const connect = useCallback(
    async (target: UiWallet) => {
      if (!walletClient) return;
      setWalletError(null);
      try {
        await walletClient.wallet.connect(target);
      } catch (err) {
        setWalletError(describeChainError(err));
      }
    },
    [walletClient],
  );
  const disconnect = useCallback(async () => {
    if (!walletClient) return;
    setWalletError(null);
    try {
      await walletClient.wallet.disconnect();
    } catch (err) {
      setWalletError(describeChainError(err));
    }
  }, [walletClient]);

  const client = useMemo(
    () => new OriginaClient({ rpc, signer: wallet.connected?.signer ?? null }),
    [rpc, wallet.connected?.signer],
  );

  return {
    client,
    ready: walletClient !== null && wallet.status !== "pending",
    wallets: wallet.wallets,
    status: wallet.status,
    connectedWalletName: wallet.connected?.wallet.name ?? null,
    address: connectedAddress,
    walletError,
    connect,
    disconnect,
  };
}

export type ChainState = ReturnType<typeof useChain>;
