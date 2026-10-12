const STEPS = [
  { title: "Generate", text: "Your AI tool creates the media." },
  { title: "Fingerprint", text: "SHA-256 and perceptual hash are extracted in the browser; the file never moves." },
  { title: "Anchor", text: "A 189-byte record is written to Solana permanently, for about 0.0022 SOL of one-time rent." },
  { title: "Verify", text: "Any platform integrated with Origina can read the provenance." },
];

const COMPARISON = [
  {
    tone: "coral",
    label: "ML classifiers",
    points: [
      "Probability score, not proof",
      "Fails after re-encoding",
      "No origin information",
      "Gets worse as AI improves",
    ],
  },
  {
    tone: "amber",
    label: "Platform labels (Meta, TikTok, YouTube)",
    points: [
      "Siloed per platform",
      "Stripped by a screenshot",
      "Requires tool cooperation",
      "No cross-platform standard",
    ],
  },
  {
    tone: "teal",
    label: "Origina Protocol",
    points: [
      "Cryptographic certainty on an exact match",
      "Edited copies fall back to a perceptual near-match",
      "Open standard any platform can read",
      "Gets stronger as more tools integrate",
    ],
  },
];

export function HomeView({ onGoAnchor }: { onGoAnchor: () => void }) {
  return (
    <>
      <section className="landing-hero">
        <h1 className="landing-title">The trust layer for AI-generated media.</h1>
        <p className="landing-sub">
          Origina anchors a cryptographic fingerprint of any AI-generated image on Solana at the moment of creation.
          Any platform verifies origin, model, and authenticity with a single on-chain lookup, without storing the file.
        </p>
        <div className="stat-pills">
          <span className="pill">~0.0022 SOL per anchor</span>
          <span className="pill">~400ms on Solana</span>
          <span className="pill">MIT open-source</span>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={onGoAnchor}>
            Anchor your first image →
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            How it works ↓
          </button>
        </div>
      </section>

      <section id="how-it-works" className="home-section">
        <h2 className="section-title">How Origina works</h2>
        <div className="how-grid">
          {STEPS.map((s, i) => (
            <div className="glass how-card" key={s.title}>
              <div className="how-big-num">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2 className="section-title">The internet cannot tell what is real.</h2>
        <p className="lead">
          AI-generated content is indistinguishable from authentic media. Platform labels are stripped by screenshots.
          Neural net classifiers fail after compression. There is no shared open standard for proving where content came
          from — until now.
        </p>
      </section>

      <section className="home-section">
        <h2 className="edge-title glow-text">Origina does not classify. It verifies.</h2>
        <p className="lead">
          Most AI detection systems operate on probability. Neural net classifiers output a confidence score — 73%
          likely AI-generated, 81% likely synthetic. Those scores degrade after compression. They fail after a
          screenshot. They cannot tell you who made something or when. They guess. Origina does not guess. When a file
          is anchored, its SHA-256 hash is written permanently to Solana. When that same file is uploaded to any platform
          that reads the Origina record, the hash either matches the on-chain record or it does not. <strong>
            <em>That is not a score. That is a cryptographic fact.</em>
          </strong>{" "}
          The record either exists or it does not. No classifier needed.
        </p>
        <div className="compare">
          {COMPARISON.map((c) => (
            <div className={`glass compare-card ${c.tone}`} key={c.label}>
              <h3>{c.label}</h3>
              <ul>
                {c.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span className="t-italic">Origina Protocol · MIT License · Built on Solana · Colosseum Hackathon 2026</span>
        <a href="https://github.com/samuraihighlord/OriginaProtocol" target="_blank" rel="noopener noreferrer">
          GitHub ↗
        </a>
      </footer>
    </>
  );
}
