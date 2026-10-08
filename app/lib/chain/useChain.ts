import type { Address } from "@solana/kit";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OriginaClient } from "../originaClient";
import { type ChainClient, type ProviderStatus, claimProvider, getProviderStatus } from "./chain";
import { type WalletClient, createReadRpc, createWalletClient } from "./client";
import { describeChainError } from "./errors";

type WalletState = ReturnType<WalletClient["wallet"]["getState"]>;
export type UiWallet = WalletState["wallets"][number];

const EMPTY_STATE = { connected: null, reconnectingTo: null, status: "pending", wallets: [] } as unknown as WalletState;
const noopSubscribe = () => () => {};

export type ProviderState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; status: ProviderStatus }
  | { phase: "error"; message: string };

/**
 * Everything the UI needs about the chain: wallet discovery/connection, the connected wallet's provider
 * registration, and an OriginaClient wired to both. Browser-only (the wallet client is created in an effect).
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

  // Provider registration of the connected wallet (re-read on connect and after a claim).
  const [provider, setProvider] = useState<ProviderState>({ phase: "idle" });
  const requestId = useRef(0);
  const refreshProvider = useCallback(async () => {
    if (!connectedAddress) {
      setProvider({ phase: "idle" });
      return;
    }
    const id = ++requestId.current;
    setProvider({ phase: "loading" });
    try {
      const status = await getProviderStatus(rpc, connectedAddress);
      if (id === requestId.current) setProvider({ phase: "ready", status });
    } catch (err) {
      if (id === requestId.current) setProvider({ phase: "error", message: describeChainError(err) });
    }
  }, [rpc, connectedAddress]);
  useEffect(() => {
    void refreshProvider();
  }, [refreshProvider]);

  const [claiming, setClaiming] = useState(false);
  const claim = useCallback(async () => {
    if (!walletClient || provider.phase !== "ready" || provider.status.kind !== "pending") return;
    setClaiming(true);
    setWalletError(null);
    try {
      await claimProvider(walletClient as unknown as ChainClient, provider.status.approvedBy);
      await refreshProvider();
    } catch (err) {
      setWalletError(describeChainError(err));
    } finally {
      setClaiming(false);
    }
  }, [walletClient, provider, refreshProvider]);

  const client = useMemo(
    () => new OriginaClient({ rpc, chain: wallet.connected && walletClient ? (walletClient as unknown as ChainClient) : null }),
    [rpc, walletClient, wallet.connected],
  );

  return {
    client,
    ready: walletClient !== null && wallet.status !== "pending",
    wallets: wallet.wallets,
    status: wallet.status,
    connectedWalletName: wallet.connected?.wallet.name ?? null,
    address: connectedAddress,
    provider,
    refreshProvider,
    claim,
    claiming,
    walletError,
    connect,
    disconnect,
  };
}

export type ChainState = ReturnType<typeof useChain>;
