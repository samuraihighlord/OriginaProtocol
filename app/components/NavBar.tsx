import { useEffect, useRef, useState } from "react";
import { CLUSTER } from "../lib/chain/config";
import type { ChainState } from "../lib/chain/useChain";
import { truncateAddress } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { WalletList } from "./WalletPanels";

export type View = "about" | "anchor" | "social";

const TABS: { view: View; label: string; icon: IconName }[] = [
  { view: "about", label: "About", icon: "info" },
  { view: "anchor", label: "Anchor", icon: "link" },
  { view: "social", label: "Social", icon: "chat" },
];

function WalletMenu({ chain }: { chain: ChainState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { address, connectedWalletName, status, disconnect, walletError } = chain;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-right" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost"
        id="wallet-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {address ? (
          <>
            <span className="dot" />
            <span className="mono">{truncateAddress(address, 4, 4)}</span>
          </>
        ) : (
          <>
            <Icon name="wallet" />
            <span>{status === "connecting" ? "Connecting…" : "Connect wallet"}</span>
          </>
        )}
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Wallet">
          {address ? (
            <>
              <p className="addr">
                <strong style={{ color: "#fff" }}>{connectedWalletName}</strong>
                <br />
                <span className="mono">{address}</span>
              </p>
              <p>Origina covers the on-chain fee. Your wallet only co-signs as the creator.</p>
              {walletError && <div className="error-text">{walletError}</div>}
              <div className="row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    await disconnect();
                    setOpen(false);
                  }}
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Connect a Solana wallet to anchor images. It is recorded as the creator, and needs no SOL. Checking an image never needs a wallet.</p>
              <WalletList chain={chain} />
              {walletError && <div className="error-text">{walletError}</div>}
            </>
          )}
          <p className="note">
            Network: Solana {CLUSTER}. Nothing is signed until you press Anchor and approve it in your wallet.
          </p>
        </div>
      )}
    </div>
  );
}

interface NavBarProps {
  view: View;
  onChange: (view: View) => void;
  chain: ChainState;
}

export function NavBar({ view, onChange, chain }: NavBarProps) {
  return (
    <>
      <header className="topnav">
        <div className="brand">
          <div className="logo-mark">O</div>
          <span className="brand-name">Origina Protocol</span>
          <span className="pill">MVP</span>
        </div>

        <nav className="nav-tabs" role="tablist" aria-label="Pages">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              role="tab"
              aria-selected={view === t.view}
              className={`tab${view === t.view ? " active" : ""}`}
              onClick={() => onChange(t.view)}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>

        <WalletMenu chain={chain} />
      </header>

      <nav className="bottom-tabs" aria-label="Pages (mobile)">
        {TABS.map((t) => (
          <button
            key={t.view}
            type="button"
            className={`tab${view === t.view ? " active" : ""}`}
            onClick={() => onChange(t.view)}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
