import { AnchorResult, OriginaClient } from "../lib/originaClient";
import { useState } from "react";
import { formatDimensions, formatImageFormat, formatTimestamp, truncateMiddle } from "../format";
import * as styles from "../styles";
import { ImageDrop } from "./ImageDrop";

const MODEL_OPTIONS = [
  "midjourney-v6",
  "dall-e-3",
  "stable-diffusion-xl",
  "sora-1.0",
  "firefly-2",
  "flux-1",
  "custom",
];

interface CreatorPanelProps {
  client: OriginaClient;
}

export function CreatorPanel({ client }: CreatorPanelProps) {
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [modelId, setModelId] = useState(MODEL_OPTIONS[0]);
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnchorResult | null>(null);

  const canAnchor = Boolean(fileBytes) && wallet.trim().length > 0 && !loading;

  async function handleAnchor() {
    if (!fileBytes) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const anchored = await client.anchor({
        fileData: fileBytes,
        modelId,
        mediaType: "image",
        walletPublicKey: wallet.trim(),
      });
      setResult(anchored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to anchor fingerprint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.panel}>
      <div>
        <div style={styles.panelLabel}>AI Tool — Creator</div>
        <h2 style={styles.panelHeading}>Anchor a fingerprint</h2>
      </div>

      <ImageDrop
        label="Drag & drop an AI-generated image, or click to select"
        onFile={(_file, bytes) => {
          setFileBytes(bytes);
          setResult(null);
          setError(null);
        }}
      />

      <div>
        <label style={styles.label} htmlFor="model">
          AI model
        </label>
        <select
          id="model"
          style={styles.select}
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={styles.label} htmlFor="wallet">
          Your Solana wallet address
        </label>
        <input
          id="wallet"
          style={styles.input}
          placeholder="e.g. 7xKXqx6Rr8jV7XX9RwtwxWFsn1eScqz9jyqLTQjbxYES"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
        />
      </div>

      <button style={styles.button(!canAnchor)} disabled={!canAnchor} onClick={handleAnchor}>
        {loading ? "Anchoring..." : "Anchor"}
      </button>

      {error && <div style={styles.errorText}>{error}</div>}

      {result && (
        <div style={styles.resultBox}>
          <Row k="SHA-256" v={truncateMiddle(result.sha256)} />
          <Row k="pHash" v={result.phash} />
          <Row k="PDA address" v={truncateMiddle(result.pdaAddress)} />
          <Row k="Signature" v={truncateMiddle(result.signature)} />
          <Row k="Anchored" v={formatTimestamp(result.timestamp)} />
          <div style={styles.resultRow}>
            <span style={styles.resultKey}>Explorer</span>
            <a style={styles.link} href={result.explorerUrl} target="_blank" rel="noreferrer">
              View on Solana Explorer
            </a>
          </div>
          <Row k="Format" v={formatImageFormat(result.format)} />
          <Row k="Dimensions" v={formatDimensions(result.width, result.height)} />
          <div style={styles.infoNote}>
            Format &amp; dimensions are read from the file for display only — not part of the
            fingerprint, not stored on-chain, and not used to verify authenticity.
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={styles.resultRow}>
      <span style={styles.resultKey}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
