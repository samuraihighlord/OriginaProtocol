import { detectImageFormat, readImageDimensions } from "../lib/imageMeta";
import { OriginaClient, VerifyResult } from "../lib/originaClient";
import { useState } from "react";
import { formatDimensions, formatImageFormat, formatTimestamp, truncateMiddle } from "../format";
import * as styles from "../styles";
import { ImageDrop } from "./ImageDrop";

interface PlatformPanelProps {
  client: OriginaClient;
}

interface UploadedFileInfo {
  width: number | null;
  height: number | null;
  format: string;
}

export function PlatformPanel({ client }: PlatformPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFileInfo | null>(null);

  async function handleFile(bytes: Uint8Array) {
    setLoading(true);
    setError(null);
    setResult(null);

    // Read straight off the uploaded file's own header — independent of
    // whatever the API returns, so a mismatch after editing is visible.
    const dimensions = readImageDimensions(bytes);
    setUploaded({
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      format: detectImageFormat(bytes),
    });

    try {
      const verified = await client.verify({ fileData: bytes });
      setResult(verified);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify fingerprint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={styles.panel}>
      <div>
        <div style={styles.panelLabelPlatform}>Platform — e.g. TikTok / Instagram</div>
        <h2 style={styles.panelHeading}>Verify provenance</h2>
      </div>

      <ImageDrop
        label="Drag & drop any image to verify, or click to select"
        onFile={(_file, bytes) => handleFile(bytes)}
      />

      {loading && <div style={styles.resultKey}>Checking...</div>}
      {error && <div style={styles.errorText}>{error}</div>}

      {result && <VerifyBadge result={result} uploaded={uploaded} />}
    </section>
  );
}

function VerifyBadge({
  result,
  uploaded,
}: {
  result: VerifyResult;
  uploaded: UploadedFileInfo | null;
}) {
  const uploadedLine = uploaded && (
    <div style={styles.badgeDetail}>
      This file: {formatImageFormat(uploaded.format)}, {formatDimensions(uploaded.width, uploaded.height)}
    </div>
  );

  if (result.exactMatch) {
    return (
      <div style={styles.badgeExact}>
        <div style={styles.badgeTitle}>AI-generated content — verified</div>
        <div style={styles.badgeDetail}>Model: {result.modelId}</div>
        <div style={styles.badgeDetail}>
          Creator: {result.creator ? truncateMiddle(result.creator) : "unknown"}
        </div>
        <div style={styles.badgeDetail}>
          Anchored: {result.timestamp ? formatTimestamp(result.timestamp) : "unknown"}
        </div>
        {uploadedLine}
      </div>
    );
  }

  if (result.nearMatch) {
    return (
      <div style={styles.badgeNear}>
        <div style={styles.badgeTitle}>Modified AI content detected</div>
        <div style={styles.badgeDetail}>
          Perceptual hash distance: {result.pHashDistance ?? "n/a"}
        </div>
        <div style={styles.badgeDetail}>
          Closest original model: {result.modelId ?? "unknown"}
        </div>
        {uploadedLine}
        <div style={styles.badgeDetail}>
          Anchored original: {formatImageFormat(result.format)},{" "}
          {formatDimensions(result.width, result.height)}
        </div>
        <div style={styles.infoNote}>
          Format &amp; dimensions are shown for context only — they're expected to change on
          resize/re-encode, so they aren't part of the match itself (the perceptual hash is).
        </div>
      </div>
    );
  }

  return (
    <div style={styles.badgeNotFound}>
      <div style={styles.badgeTitle}>No provenance record found</div>
      <div style={styles.badgeDetail}>This media has not been anchored on Origina Protocol.</div>
      {uploadedLine}
    </div>
  );
}
