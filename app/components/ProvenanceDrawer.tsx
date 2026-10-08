import { useEffect } from "react";
import { truncateAddress, truncateHash } from "../lib/format";
import type { Provenance } from "../lib/feed";
import { Row } from "./Row";

export function ProvenanceDrawer({ provenance, onClose }: { provenance: Provenance; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="grad-border modal-sm">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="prov-title">
          <div className="drawer-head">
            <h2 id="prov-title">
              <span className="mini-mark" style={{ width: 22, height: 22, fontSize: 12, borderRadius: 6 }}>
                O
              </span>
              Provenance record
            </h2>
            <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>

          <Row label="Provider" mono={false}>
            {provenance.providerName ?? "Unnamed provider"}
          </Row>
          <Row label="Provider wallet">
            <span title={provenance.provider}>{truncateAddress(provenance.provider, 6, 6)}</span>
          </Row>
          {provenance.creatorWallet && (
            <Row label="Creator wallet">
              <span title={provenance.creatorWallet}>{truncateAddress(provenance.creatorWallet, 6, 6)}</span>
            </Row>
          )}
          {provenance.timestamp !== null && (
            <Row label="Anchored" mono={false}>
              {new Date(provenance.timestamp * 1000).toLocaleString()}
            </Row>
          )}
          {provenance.slot !== null && <Row label="Solana slot">{provenance.slot}</Row>}
          {provenance.recordAddress && (
            <Row label="Record">
              <span title={provenance.recordAddress}>{truncateAddress(provenance.recordAddress, 6, 6)}</span>
            </Row>
          )}
          <Row label="SHA-256">
            <span title={provenance.sha256}>{truncateHash(provenance.sha256)}</span>
          </Row>
          {provenance.matchType && (
            <Row label="Match type" mono={false}>
              {provenance.matchType === "exact" ? (
                <span className="match-exact">Exact match (SHA-256)</span>
              ) : (
                <span className="match-near">Near match (pHash)</span>
              )}
            </Row>
          )}
          {provenance.matchType === "near" && (
            <Row label="pHash Hamming distance" mono={false}>
              {provenance.distance} bits
            </Row>
          )}

          {provenance.recordUrl && (
            <div style={{ marginTop: 14 }}>
              <a href={provenance.recordUrl} target="_blank" rel="noopener noreferrer">
                View record on Solana Explorer ↗
              </a>
            </div>
          )}
          {provenance.sample && (
            <div className="status-note" style={{ marginTop: 14 }}>
              This is a sample post with illustrative data — it is not a record on Solana.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
