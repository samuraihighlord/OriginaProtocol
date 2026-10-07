const HOW_IT_WORKS = [
  { title: "Generate", text: "An AI tool creates the media." },
  { title: "Fingerprint", text: "SHA-256 and pHash are computed locally — the file never leaves the device." },
  { title: "Anchor", text: "About 114 bytes are written to Solana permanently." },
  { title: "Verify", text: "Any platform checks origin in under 200ms." },
];

const SCHEMA: { field: string; description: string; optional?: boolean }[] = [
  { field: "creator", description: "Wallet address of the creator" },
  { field: "sha256_hash", description: "Exact-match fingerprint of the file" },
  { field: "phash", description: "Perceptual hash for near-match detection" },
  { field: "model_id", description: "The AI model that generated the media" },
  { field: "media_type", description: "Image, video, audio, or text" },
  { field: "timestamp", description: "Unix time of the anchor" },
  { field: "slot", description: "Solana slot that confirmed the record" },
  { field: "parent", description: "Parent record, for edit chains", optional: true },
];

export function AboutView() {
  return (
    <>
      <div className="hero">
        <h1>The trust layer for AI-generated media.</h1>
        <p>
          Origina anchors a cryptographic fingerprint of any AI-generated image, video, or audio on
          Solana at the moment of creation. Any platform can verify origin, model, and authenticity
          in under 200ms — without storing the file.
        </p>
        <div className="stat-pills">
          <span className="pill">{"< $0.001 per anchor"}</span>
          <span className="pill">~400ms finality</span>
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
            <strong>Anchor an image.</strong> Drop an AI-generated image on the Anchor page, choose the
            model that made it, and anchor its fingerprint. Connect a wallet address in the top right
            to label the record with your own creator address.
          </li>
          <li>
            <strong>Check it on a platform.</strong> On the Social page, upload the same image under
            &quot;Add to feed&quot;. A match earns an Origina badge — click it to open the record.
          </li>
          <li>
            <strong>Try an edited copy.</strong> Crop or recompress the image and upload that version
            to see a near match instead of an exact one. The MVP&apos;s perceptual hash works on raw
            file data rather than decoded pixels, so it is most reliable for small edits.
          </li>
          <li>
            <strong>Where records live.</strong> Solana anchoring is still being connected. In this
            MVP, records are held in your browser session and reset when you refresh.
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
          <span>Total: approximately 114 bytes</span>
          <span>Cost: less than $0.001</span>
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
