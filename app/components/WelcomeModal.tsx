import { useState } from "react";

export function WelcomeModal({ onClose }: { onClose: (dontShowAgain: boolean) => void }) {
  const [dontShow, setDontShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function enter() {
    setLeaving(true);
    setTimeout(() => onClose(dontShow), 250);
  }

  return (
    <div className={`overlay${leaving ? " leaving" : ""}`}>
      <div className="grad-border modal-lg">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
          <div className="modal-top">
            <div className="logo-mark">O</div>
            <h2 id="welcome-title">Origina Protocol</h2>
          </div>
          <hr className="divider" />

          <div className="modal-block">
            <h3 className="eyebrow eyebrow-sm t-teal">What you are looking at</h3>
            <p>
              This is a proof of concept demo. It exists to demonstrate that the anchoring mechanism works — that a
              cryptographic fingerprint of an AI-generated image can be extracted in the browser, sent to Solana, and
              permanently recorded on-chain. This is not the finished product.
            </p>
          </div>

          <div className="modal-block">
            <h3 className="eyebrow eyebrow-sm t-muted">What this demo proves</h3>
            <p>
              Every image uploaded through this site has its SHA-256 file hash and perceptual hash extracted
              client-side, plus a C2PA manifest hash when the image carries one, and anchored on Solana with Origina as
              the named provider. The file never leaves your device. The fingerprint lives on-chain forever. Any
              platform can verify that record with a single on-chain lookup.
            </p>
          </div>

          <div className="modal-block">
            <h3 className="eyebrow eyebrow-sm t-muted">Demo vs real product</h3>
            <p>
              This demo runs on Solana devnet, so the SOL it uses has no real value. Every anchor is a real devnet
              transaction, and a connected wallet pays a one-time deposit of about 0.0022 SOL, which would be real money
              on mainnet. Wallets connect through the Solana Wallet Standard (Phantom, Backpack, Solflare and others),
              and you can also anchor without a wallet.
            </p>
          </div>

          <label className="check">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don&apos;t show this again
          </label>
          <button type="button" className="btn btn-primary btn-block" onClick={enter}>
            Enter demo
          </button>
          <a
            className="modal-link"
            href="https://github.com/samuraihighlord/OriginaProtocol"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more on GitHub ↗
          </a>
        </div>
      </div>
    </div>
  );
}
