import { useEffect, useRef, useState } from "react";
import { truncateAddress } from "../lib/format";
import { Icon, type IconName } from "./Icon";

export type View = "about" | "anchor" | "social";

const TABS: { view: View; label: string; icon: IconName }[] = [
  { view: "about", label: "About", icon: "info" },
  { view: "anchor", label: "Anchor", icon: "link" },
  { view: "social", label: "Social", icon: "chat" },
];

const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function WalletMenu({ wallet, onChange }: { wallet: string | null; onChange: (w: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

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

  function toggle() {
    if (!open) {
      setInput(wallet ?? "");
      setError(null);
    }
    setOpen((o) => !o);
  }

  function confirm() {
    const value = input.trim();
    if (!SOL_ADDRESS.test(value)) {
      setError("That doesn't look like a valid Solana address (32–44 base58 characters).");
      return;
    }
    onChange(value);
    setOpen(false);
  }

  return (
    <div className="nav-right" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost"
        id="wallet-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {wallet ? (
          <>
            <span className="dot" />
            <span className="mono">{truncateAddress(wallet, 8, 4)}</span>
          </>
        ) : (
          <>
            <Icon name="wallet" />
            <span>Connect wallet</span>
          </>
        )}
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Connect wallet">
          <p>
            Paste a Solana address to act as the creator on your records. Direct wallet connections
            (Phantom, Backpack) are coming.
          </p>
          <label className="field-label" htmlFor="wallet-input">
            Solana address
          </label>
          <input
            type="text"
            id="wallet-input"
            className="mono"
            placeholder="7xKXqx6Rr8jV7XX9RwtwxWFsn1eScqz9jyqLTQjbxYES"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
          />
          {error && <div className="error-text">{error}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={confirm}>
              {wallet ? "Update address" : "Confirm"}
            </button>
            {wallet && (
              <button
                type="button"
                className="btn btn-subtle"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Disconnect
              </button>
            )}
          </div>
          <p className="note">
            Your address only labels your records. Nothing is signed or sent from your wallet.
          </p>
        </div>
      )}
    </div>
  );
}

interface NavBarProps {
  view: View;
  onChange: (view: View) => void;
  wallet: string | null;
  onWalletChange: (wallet: string | null) => void;
}

export function NavBar({ view, onChange, wallet, onWalletChange }: NavBarProps) {
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

        <WalletMenu wallet={wallet} onChange={onWalletChange} />
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
