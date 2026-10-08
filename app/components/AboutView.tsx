const HOW_IT_WORKS = [
  { title: "Generate", text: "An approved AI provider creates the media." },
  { title: "Fingerprint", text: "SHA-256 and pHash are computed locally — the file never leaves the device." },
  { title: "Anchor", text: "A 189-byte record is written to Solana permanently." },
  { title: "Verify", text: "Any platform checks origin with a single on-chain lookup." },
];

const SCHEMA: { field: string; description: string; optional?: boolean }[] = [
  { field: "provider", description: "The approved provider wallet that anchored the record" },
  { field: "file_sha256", description: "Exact-match fingerprint of the file" },
  { field: "perceptual", description: "Perceptual hash (algorithm + hash) for near-match detection", optional: true },
  { field: "c2pa_manifest_hash", description: "Hash of the file's C2PA manifest" },
  { field: "creator_wallet", description: "The creator's wallet, if they co-signed the anchor", optional: true },
  { field: "slot", description: "Solana slot that confirmed the record" },
  { field: "generated_at", description: "When the provider says the media was generated", optional: true },
];

export function AboutView() {
  return (
    <>
      <div className="hero">
        <h1>The trust layer for AI-generated media.</h1>
        <p>
          Origina anchors a cryptographic fingerprint of any AI-generated image, video, or audio on
          Solana at the moment of creation. Any platform can verify origin, provider, and authenticity
          with a single on-chain lookup — without storing the file.
        </p>
        <div className="stat-pills">
          <span className="pill">~0.002 SOL per anchor</span>
          <span className="pill">~400ms slot time</span>
          <span className="pill">MIT open-source</span>
        </div>
      </div>

      <h2 className="section-title">How Origina works</h2>
      <div className="steps-row">
        {HOW_IT_WORKS.map((s, i) => (
          <div className="glass how-step" key={s.title}>
            <div className="how-num">{i + 1}</div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>

      <h2 className="section-title">Getting started</h2>
      <div className="glass card">
        <ul className="tips-list">
          <li>
            <strong>Connect a provider wallet.</strong> Only providers approved by the Origina registry can
            anchor. Connect a wallet in the top right; if it&apos;s been approved, claim your registration once
            and you&apos;re ready.
          </li>
          <li>
            <strong>Anchor an image.</strong> Drop an AI-generated image on the Anchor page and anchor its
            fingerprint. You pay a one-time rent deposit of about 0.002 SOL plus a tiny network fee.
          </li>
          <li>
            <strong>Check it on a platform.</strong> On the Social page, upload an image under &quot;Add to
            feed&quot;. It&apos;s checked against the on-chain records — no wallet required. A match earns an
            Origina badge; click it to open the record.
          </li>
          <li>
            <strong>Try an edited copy.</strong> Crop or recompress an anchored image and upload that version to
            see a near match instead of an exact one. The MVP&apos;s perceptual hash works on raw file data
            rather than decoded pixels, so it is most reliable for small edits.
          </li>
        </ul>
      </div>

      <h2 className="section-title">What is stored on Solana</h2>
      <div className="glass card">
        <div className="schema">
          {SCHEMA.map((s) => (
            <div className="schema-item" key={s.field}>
              <div className="k mono">
                {s.field}
                {s.optional && <span style={{ color: "var(--text-3)" }}> (optional)</span>}
              </div>
              <div className="d">{s.description}</div>
            </div>
          ))}
        </div>
        <div className="schema-total">
          <span>Total: 189 bytes per record</span>
          <span>One-time rent: about 0.0022 SOL</span>
        </div>
      </div>

      <h2 className="section-title">Why not just use AI detection?</h2>
      <div className="glass callout">
        <p>
          ML classifiers give probability scores and fail after compression or re-encoding. They also
          cannot prove origin — only guess.
        </p>
        <p>
          Origina does not classify. It verifies. An on-chain record either exists or it does not.
          That is not a 73% confidence score. It is a cryptographic fact.
        </p>
      </div>
    </>
  );
}
