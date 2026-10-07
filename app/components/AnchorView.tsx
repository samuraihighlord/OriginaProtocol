import { Fragment, useEffect, useRef, useState } from "react";
import { describeFile, truncateAddress, truncateHash } from "../lib/format";
import { MODEL_OPTIONS, modelLabel } from "../lib/models";
import type { AnchorResult, OriginaClient } from "../lib/originaClient";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { Row } from "./Row";

const PLACEHOLDER_CREATOR = "unconnected-wallet";
const STEPS = ["Upload image", "Select AI model", "Anchor"];

type Status = "idle" | "working" | "done";

export function AnchorView({
  client,
  wallet,
  onGoSocial,
}: {
  client: OriginaClient;
  wallet: string | null;
  onGoSocial: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [stage, setStage] = useState(1);
  const [modelOpen, setModelOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnchorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => () => clearTimeout(stageTimer.current), []);

  async function handleFile(file: File) {
    setResult(null);
    setStatus("idle");
    const data = new Uint8Array(await file.arrayBuffer());
    setBytes(data);
    setFileLabel(describeFile(file, data));
    setPreview(URL.createObjectURL(file));

    // upload done -> model selector slides in -> anchor button slides in (a model is preselected)
    clearTimeout(stageTimer.current);
    setStage(2);
    setModelOpen(true);
    stageTimer.current = setTimeout(() => {
      setActionOpen(true);
      setStage(3);
    }, 450);
  }

  async function handleAnchor() {
    if (!bytes || status === "working") return;
    setStatus("working");
    setResult(null);
    setError(null);
    try {
      const anchored = await client.anchor({
        fileData: bytes,
        modelId: model,
        mediaType: "image",
        walletPublicKey: wallet ?? PLACEHOLDER_CREATOR,
      });
      setResult(anchored);
      setStage(4);
      setStatus("done");
    } catch (err) {
      setError(`Could not fingerprint this file: ${err instanceof Error ? err.message : String(err)}`);
      setStatus("idle");
    }
  }

  return (
    <>
      <h1 className="page-title">Anchor AI media</h1>
      <p className="page-sub">Stamp your AI-generated image with a verifiable fingerprint.</p>

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

        <div className={`reveal${modelOpen ? " open" : ""}`}>
          <label className="field-label" htmlFor="anchor-model">
            AI model
          </label>
          <select
            id="anchor-model"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              if (bytes && status !== "done") setStage(3);
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`reveal-up${actionOpen ? " open" : ""}`}>
          <button
            type="button"
            className={`btn btn-primary btn-block${status === "done" ? " success" : ""}`}
            disabled={!bytes || status !== "idle"}
            onClick={handleAnchor}
          >
            {status === "working" ? (
              <>
                <span className="spinner" />
                Anchoring…
              </>
            ) : status === "done" ? (
              <>
                <Icon name="check" />
                Anchored
              </>
            ) : (
              <>
                <Icon name="link" />
                Anchor fingerprint
              </>
            )}
          </button>
          <p className="micro">Only the cryptographic fingerprint is used — your image never leaves your device.</p>
          {!wallet && bytes && (
            <p className="micro">No wallet connected — this record will use a placeholder creator address.</p>
          )}
        </div>

        {result && (
          <div className="result">
            <div className="result-title">
              <Icon name="check" />
              {result.alreadyAnchored ? "Already anchored — showing the existing record" : "Fingerprint anchored"}
            </div>
            <Row label="SHA-256">
              <span title={result.sha256}>{truncateHash(result.sha256)}</span>
            </Row>
            <Row label="pHash">{result.phash}</Row>
            <Row label="Model" mono={false}>
              {modelLabel(result.modelId)}
            </Row>
            <Row label="Creator">
              <span title={result.creator}>{truncateAddress(result.creator)}</span>
            </Row>
            <Row label="Timestamp" mono={false}>
              {result.timestamp} · {new Date(result.timestamp * 1000).toLocaleString()}
            </Row>
            {result.slot != null && <Row label="Slot">{result.slot}</Row>}
            {result.pdaAddress && <Row label="PDA">{result.pdaAddress}</Row>}
            <div className="result-note">
              {result.alreadyAnchored &&
                "Anchors are immutable, so re-anchoring the same file keeps the original record. "}
              {result.explorerUrl && (
                <>
                  <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer">
                    View on Solana Explorer ↗
                  </a>{" "}
                </>
              )}
              {!result.explorerUrl &&
                "This record is held in your browser session; on-chain anchoring on Solana is still being connected."}
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
