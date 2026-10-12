import type { ChainState } from "../lib/chain/useChain";

/** Wallets discovered in this browser (Wallet Standard), as connect buttons. */
export function WalletList({ chain }: { chain: ChainState }) {
  const { wallets, connect, status, ready } = chain;

  if (!ready) return <p className="muted-line">Looking for wallets…</p>;
  if (wallets.length === 0) {
    return (
      <p className="muted-line">
        No Solana wallet found in this browser. Install Phantom, Backpack or Solflare, then reload this page.
      </p>
    );
  }
  return (
    <div className="wallet-list">
      {wallets.map((w) => (
        <button
          key={w.name}
          type="button"
          className="wallet-option"
          disabled={status === "connecting"}
          onClick={() => connect(w)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {w.icon && <img src={w.icon} alt="" width={22} height={22} />}
          <span>{status === "connecting" ? "Connecting…" : `Connect ${w.name}`}</span>
        </button>
      ))}
    </div>
  );
}
