import { OriginaClient } from "../lib/originaClient";
import { useMemo } from "react";
import { CreatorPanel } from "../components/CreatorPanel";
import { PlatformPanel } from "../components/PlatformPanel";
import * as styles from "../styles";

export default function Home() {
  const client = useMemo(
    () =>
      new OriginaClient({
        apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
      }),
    []
  );

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Origina Protocol — Live Demo</h1>
        <p style={styles.subtitle}>
          Anchor a cryptographic fingerprint of AI-generated media, then verify it from a
          different "platform" — without the media file ever leaving your device.
        </p>

        <div style={styles.howItWorksBar}>
          <strong>How it works:</strong> the left panel simulates an AI tool anchoring a piece of
          generated media the moment it's created — your browser hashes the image (SHA-256 +
          perceptual hash) locally and sends only that fingerprint to the API. The right panel
          simulates a platform like TikTok or Instagram checking any uploaded image against
          Origina's records. Try it end to end: anchor an image on the left, then drop the exact
          same file on the right for a green "verified" match — or crop/edit it slightly first to
          see the amber "modified content" near-match badge.
        </div>

        <div style={styles.panelGrid}>
          <CreatorPanel client={client} />
          <PlatformPanel client={client} />
        </div>
      </div>
    </main>
  );
}
