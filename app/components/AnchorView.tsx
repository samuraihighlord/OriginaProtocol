import { Fragment, useEffect, useState } from "react";
import { describeChainError } from "../lib/chain/errors";
import { CLUSTER } from "../lib/chain/config";
import type { ChainState } from "../lib/chain/useChain";
import { describeFile, truncateAddress, truncateHash } from "../lib/format";
import { MAX_MODEL_LENGTH, MODEL_OPTIONS, OTHER_MODEL, normalizeModel } from "../lib/models";
import type { AnchorResult, OriginaClient } from "../lib/originaClient";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { Row } from "./Row";
import { WalletList } from "./WalletPanels";

const STEPS = ["Upload image", "Connect wallet", "Anchor"];

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
  const [modelChoice, setModelChoice] = useState("");
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const model = modelChoice === OTHER_MODEL ? normalizeModel(customModel) : modelChoice || null;
  const canAnchor = !!bytes && !!chain.address && !!model;
  const stage = status === "done" ? 4 : !bytes ? 1 : !chain.address ? 2 : 3;

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
    if (!bytes || !model || !canAnchor || status === "working") return;
    setStatus("working");
    setResult(null);
    setError(null);
    try {
      setResult(await client.anchor({ fileData: bytes, model }));
      setStatus("done");
    } catch (err) {
      setError(describeChainError(err));
      setStatus("idle");
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
          <label className="field-label" htmlFor="model-select">
            AI model used to generate this image
          </label>
          <select id="model-select" value={modelChoice} onChange={(e) => setModelChoice(e.target.value)}>
            <option value="" disabled>
              Select a model…
            </option>
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER_MODEL}>{OTHER_MODEL}</option>
          </select>
          {modelChoice === OTHER_MODEL && (
            <input
              type="text"
              value={customModel}
              maxLength={MAX_MODEL_LENGTH}
              placeholder="Model name"
              aria-label="Model name"
              style={{ marginTop: 8 }}
              onChange={(e) => setCustomModel(e.target.value)}
            />
          )}

          <label className="field-label" style={{ marginTop: 14 }}>
            Your wallet
          </label>
          {chain.address ? (
            <p className="muted-line">
              {chain.connectedWalletName} · <span className="mono">{truncateAddress(chain.address, 6, 6)}</span> — it
              co-signs the record as the creator.
            </p>
          ) : (
            <>
              <p className="muted-line">Connect a wallet to be recorded as the creator. It needs no SOL.</p>
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
            Solana {CLUSTER}. Origina is the registered provider and pays the record&apos;s rent and network fee; your
            wallet just approves being recorded as the creator.
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
            {result.model && (
              <Row label="AI model" mono={false}>
                {result.model}
              </Row>
            )}
            {result.creatorWallet && (
              <Row label="Creator">
                <span title={result.creatorWallet}>{truncateAddress(result.creatorWallet, 6, 6)}</span>
              </Row>
            )}
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
