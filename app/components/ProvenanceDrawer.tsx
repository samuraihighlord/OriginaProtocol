import { useEffect } from "react";
import { truncateAddress, truncateHash } from "../lib/format";
import type { Provenance } from "../lib/feed";
import { modelLabel } from "../lib/models";
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

          <Row label="Model" mono={false}>
            {modelLabel(provenance.modelId)}
          </Row>
          <Row label="Creator">
            <span title={provenance.creator}>{truncateAddress(provenance.creator, 6, 6)}</span>
          </Row>
          <Row label="Anchored" mono={false}>
            {new Date(provenance.timestamp * 1000).toLocaleString()}
          </Row>
          {provenance.slot != null && <Row label="Solana slot">{provenance.slot}</Row>}
          {provenance.pdaAddress && <Row label="PDA address">{provenance.pdaAddress}</Row>}
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

          {provenance.explorerUrl && (
            <div style={{ marginTop: 14 }}>
              <a href={provenance.explorerUrl} target="_blank" rel="noopener noreferrer">
                View transaction on Solana Explorer ↗
              </a>
            </div>
          )}
          <div className="status-note" style={{ marginTop: 14 }}>
            On-chain verification is still being connected, so this record is not yet anchored on Solana.
          </div>
        </div>
      </div>
    </div>
  );
}
