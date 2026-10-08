import { useState } from "react";
import { CLUSTER } from "../lib/chain/config";
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

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-row">
      <code className="mono">{address}</code>
      <button
        type="button"
        className="copy-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** What the connected wallet is allowed to do on the Origina program, and how to get there. */
export function ProviderPanel({ chain }: { chain: ChainState }) {
  const { address, provider, claim, claiming, refreshProvider } = chain;
  if (!address) return null;

  if (provider.phase === "loading" || provider.phase === "idle") {
    return <p className="muted-line">Checking provider registration on {CLUSTER}…</p>;
  }
  if (provider.phase === "error") {
    return (
      <div className="provider-block warn">
        <p>{provider.message}</p>
        <button type="button" className="btn btn-subtle" onClick={refreshProvider}>
          Try again
        </button>
      </div>
    );
  }

  const s = provider.status;
  if (s.kind === "active") {
    return (
      <div className="provider-block ok">
        <strong>Approved provider: {s.name}</strong>
        <p>This wallet can anchor images on {CLUSTER}.</p>
      </div>
    );
  }
  if (s.kind === "pending") {
    return (
      <div className="provider-block warn">
        <strong>Approved as “{s.name}” — claim to activate</strong>
        <p>The registry authority approved this wallet. Claim the registration once (a small on-chain transaction) to start anchoring.</p>
        <button type="button" className="btn btn-primary" disabled={claiming} onClick={claim}>
          {claiming ? (
            <>
              <span className="spinner" />
              Claiming…
            </>
          ) : (
            "Claim provider registration"
          )}
        </button>
      </div>
    );
  }
  if (s.kind === "revoked") {
    return (
      <div className="provider-block bad">
        <strong>Provider registration revoked</strong>
        <p>“{s.name}” can no longer anchor new images. Records anchored before the revocation stay on-chain.</p>
      </div>
    );
  }
  return (
    <div className="provider-block warn">
      <strong>Not an approved provider yet</strong>
      <p>Only providers approved by the Origina registry can anchor. Ask the registry authority to approve this address:</p>
      <CopyAddress address={address} />
      <button type="button" className="btn btn-subtle" onClick={refreshProvider}>
        Check again
      </button>
    </div>
  );
}
