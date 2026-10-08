import { Fragment, useEffect, useState } from "react";
import { describeChainError } from "../lib/chain/errors";
import { CLUSTER } from "../lib/chain/config";
import type { ChainState } from "../lib/chain/useChain";
import { describeFile, truncateAddress, truncateHash } from "../lib/format";
import type { AnchorResult, OriginaClient } from "../lib/originaClient";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { Row } from "./Row";
import { ProviderPanel, WalletList } from "./WalletPanels";

const STEPS = ["Upload image", "Confirm provider", "Anchor"];

type Status = "idle" | "working" | "done";

export function AnchorView({
  client,
  chain,
  onGoSocial,
}: {
  client: OriginaClient;
  chain: ChainState;
  onGoSocial: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnchorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canAnchor = !!bytes && chain.provider.phase === "ready" && chain.provider.status.kind === "active";
  const stage = status === "done" ? 4 : !bytes ? 1 : canAnchor ? 3 : 2;

  async function handleFile(file: File) {
    setResult(null);
    setStatus("idle");
    setError(null);
    const data = new Uint8Array(await file.arrayBuffer());
    setBytes(data);
    setFileLabel(describeFile(file, data));
    setPreview(URL.createObjectURL(file));
  }

  async function handleAnchor() {
    if (!bytes || !canAnchor || status === "working") return;
    setStatus("working");
    setResult(null);
    setError(null);
    try {
      setResult(await client.anchor({ fileData: bytes }));
      setStatus("done");
    } catch (err) {
      setError(describeChainError(err));
      setStatus("idle");
      void chain.refreshProvider();
    }
  }

  return (
    <>
      <h1 className="page-title">Anchor AI media</h1>
      <p className="page-sub">Stamp your AI-generated image with a permanent on-chain fingerprint.</p>

      <div className="progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = n < stage ? "done" : n === stage ? "active" : "";
          return (
            <Fragment key={label}>
              {i > 0 && <div className={`p-line${i < stage ? " done" : ""}`} />}
              <div className={`p-step ${cls}`}>
                <span className="p-dot">{n < stage ? <Icon name="check" /> : n}</span>
                <span className="lbl">{label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="glass card">
        <ImageDropzone
          title="Drop your AI-generated image here"
          preview={preview}
          showReplaceHint
          onFile={handleFile}
          onError={setError}
        />
        {bytes && <div className="file-meta">{fileLabel}</div>}
        {error && <div className="error-text">{error}</div>}

        <div className={`reveal${bytes ? " open" : ""}`}>
          <label className="field-label">Provider</label>
          {chain.address ? (
            <ProviderPanel chain={chain} />
          ) : (
            <>
              <p className="muted-line">Anchoring is signed by your provider wallet. Connect one to continue.</p>
              <WalletList chain={chain} />
            </>
          )}
        </div>

        <div className={`reveal-up${bytes ? " open" : ""}`}>
          <button
            type="button"
            className={`btn btn-primary btn-block${status === "done" ? " success" : ""}`}
            disabled={!canAnchor || status !== "idle"}
            onClick={handleAnchor}
          >
            {status === "working" ? (
              <>
                <span className="spinner" />
                Anchoring — approve in your wallet…
              </>
            ) : status === "done" ? (
              <>
                <Icon name="check" />
                Anchored on Solana
              </>
            ) : (
              <>
                <Icon name="link" />
                Anchor on Solana
              </>
            )}
          </button>
          <p className="micro">
            Only the cryptographic fingerprint is written on-chain — your image never leaves your device. Network:
            Solana {CLUSTER}. You pay about 0.0022 SOL of one-time rent plus a tiny network fee.
          </p>
        </div>

        {result && (
          <div className="result">
            <div className="result-title">
              <Icon name="check" />
              {result.alreadyAnchored ? "Already anchored — showing the existing record" : "Fingerprint anchored on Solana"}
            </div>
            <Row label="SHA-256">
              <span title={result.sha256}>{truncateHash(result.sha256)}</span>
            </Row>
            <Row label="pHash">{result.phash}</Row>
            <Row label="Provider" mono={false}>
              {result.providerName ?? "Unnamed provider"} · <span className="mono">{truncateAddress(result.provider)}</span>
            </Row>
            <Row label="Slot">{result.slot}</Row>
            {result.timestamp !== null && (
              <Row label="Anchored" mono={false}>
                {new Date(result.timestamp * 1000).toLocaleString()}
              </Row>
            )}
            <Row label="Record">
              <span title={result.recordAddress}>{truncateAddress(result.recordAddress, 6, 6)}</span>
            </Row>
            <div className="result-note">
              {result.alreadyAnchored && "Anchors are immutable, so anchoring the same file again keeps the original record. "}
              <a href={result.recordUrl} target="_blank" rel="noopener noreferrer">
                View record on Solana Explorer ↗
              </a>
              {result.transactionUrl && (
                <>
                  {" · "}
                  <a href={result.transactionUrl} target="_blank" rel="noopener noreferrer">
                    View transaction ↗
                  </a>
                </>
              )}
            </div>
            <button type="button" className="next-link" onClick={onGoSocial}>
              Now go to the Social page to see this image verified in a feed <Icon name="arrow" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
