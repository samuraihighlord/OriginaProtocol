import { useEffect } from "react";
import { explorerAddressUrl, explorerTxUrl } from "../lib/chain/config";
import type { Provenance } from "../lib/feed";

/**
 * What a platform shows about an AI-generated post: that it is AI-generated, which model made it, and a link to the
 * Solana record. Everything else in the record (hashes, creator, slot, timestamp, bump) is stored, not shown here.
 */
export function ProvenanceDrawer({ provenance, onClose }: { provenance: Provenance; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The transaction when this session created the record, else the record's account. Sample posts have neither,
  // and no link is made up for them.
  const href = provenance.signature
    ? explorerTxUrl(provenance.signature)
    : provenance.recordAddress
    ? explorerAddressUrl(provenance.recordAddress)
    : null;
  const linksToTransaction = !!provenance.signature;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="grad-border modal-sm">
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="prov-label">
          <button type="button" className="drawer-close prov-close" aria-label="Close" onClick={onClose}>
            ×
          </button>

          <p id="prov-label" className="prov-label glow-text">
            AI-generated content
          </p>
          <p className="prov-model">
            Generated with <span className="mono t-teal">{provenance.model ?? "an unknown model"}</span>
          </p>

          {href ? (
            <a className="btn btn-primary btn-block prov-link" href={href} target="_blank" rel="noopener noreferrer">
              {linksToTransaction ? "View Solana transaction ↗" : "View Solana record ↗"}
            </a>
          ) : (
            <p className="prov-sample">Sample post: illustrative only, with no on-chain record to open.</p>
          )}
        </div>
      </div>
    </div>
  );
}
