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
          <p className="definition">The open-source AI media provenance layer on Solana.</p>
          <hr className="divider" />
          <div className="modal-cols">
            <div>
              <h3 className="eyebrow" style={{ color: "var(--teal)" }}>
                What Origina does
              </h3>
              <p>
                Origina anchors a cryptographic fingerprint of any AI-generated media permanently on
                Solana at creation. Any platform can then verify its origin and authenticity without
                ever storing the file.
              </p>
            </div>
            <div>
              <h3 className="eyebrow" style={{ color: "var(--text-3)" }}>
                How it works
              </h3>
              <p>
                Your image is fingerprinted in your browser and never uploaded. Anchor its fingerprint
                from the Anchor page, then check any image against the on-chain records from the Social
                page.
              </p>
            </div>
          </div>
          <p className="status-note">
            MVP release, running on Solana devnet. Anchoring is limited to providers approved by the
            Origina registry; anyone can check an image without a wallet.
          </p>
          <label className="check">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don&apos;t show this again
          </label>
          <button type="button" className="btn btn-primary btn-block" onClick={enter}>
            Get started
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
