import { useEffect, useRef, useState } from "react";
import { CLUSTER } from "../lib/chain/config";
import type { ChainState } from "../lib/chain/useChain";
import { truncateAddress } from "../lib/format";
import { Icon } from "./Icon";
import { WalletList } from "./WalletPanels";

export type View = "home" | "anchor" | "social";

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
              <p>Your wallet co-signs the record as the creator and pays its devnet SOL deposit and network fee.</p>
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
              <p>Connect a Solana wallet to be recorded as the creator of an anchored image. It pays the small devnet SOL deposit and fee. Anchoring and checking an image also work without one.</p>
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

const ITEMS: { view: View; label: string; icon: "anchor" | "home" | "chat" }[] = [
  { view: "anchor", label: "Anchor", icon: "anchor" },
  { view: "home", label: "Home", icon: "home" },
  { view: "social", label: "Social", icon: "chat" },
];

export function NavBar({ view, onChange, chain }: NavBarProps) {
  return (
    <header className="topnav">
      <div className="brand">
        <div className="logo-mark">O</div>
        <span className="brand-name">Origina Protocol</span>
        <span className="pill">demo</span>
      </div>

      <nav className="top-nav" aria-label="Pages">
        {ITEMS.map((item) => {
          const isHome = item.view === "home";
          return (
            <button
              key={item.view}
              type="button"
              className={`tn-item${isHome ? " tn-home" : ""}${view === item.view ? " active" : ""}`}
              aria-label={isHome ? "Home" : undefined}
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => onChange(item.view)}
            >
              <Icon name={item.icon} />
              {!isHome && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <WalletMenu chain={chain} />
    </header>
  );
}
