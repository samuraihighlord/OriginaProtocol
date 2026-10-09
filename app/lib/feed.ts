export interface Provenance {
  providerName: string | null;
  provider: string;
  sha256: string;
  creatorWallet: string | null;
  /** The AI model recorded with the anchor, when known. */
  model?: string | null;
  slot: number | null;
  /** Unix seconds; null when unknown. */
  timestamp: number | null;
  recordAddress: string | null;
  recordUrl: string | null;
  /** The transaction that created the record, when this session created it. */
  signature?: string | null;
  transactionUrl?: string | null;
  /** True for the seeded sample posts: illustrative content, not a real on-chain record. */
  sample?: boolean;
}

export interface FeedPost {
  id: string;
  name: string;
  handle: string;
  time: string;
  avatar: string;
  following: boolean;
  text: string;
  /** CSS background for posts that use a gradient instead of an uploaded image. */
  media?: string;
  imgUrl?: string;
  likes: number;
  reposts: number;
  replies: number;
  provenance?: Provenance;
}

// Deterministic pseudo-hash so the sample records look like real SHA-256 values.
function fakeHex(seed: number, len = 64): string {
  let s = seed >>> 0;
  let out = "";
  while (out.length < len) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out += (s >>> 8).toString(16).padStart(6, "0");
  }
  return out.slice(0, len);
}

const NOW = Math.floor(Date.now() / 1000);

function prov(seed: number, providerName: string, provider: string, hoursAgo: number, model: string): Provenance {
  return {
    providerName,
    provider,
    model,
    sha256: fakeHex(seed),
    creatorWallet: null,
    slot: null,
    timestamp: NOW - Math.floor(hoursAgo * 3600),
    recordAddress: null,
    recordUrl: null,
    sample: true,
  };
}

const W1 = "4Nd1mYQq3FpkWf3Z6hKs8Vt2xRjB9cLuAeDoGvH7TyPq";
const W2 = "Bq7TzK2mXs9HfVc4RjN8yPwLd3EaGtUo6AhZ1SkMeYvC";
const W3 = "H3xWnR8vKq5ZdTj2PfYm7BcLsA9uEgNo4VtDhXe6QyUa";
const W4 = "Fp6JcYt9mRw2KzXs4NhQ8dVbA3gLeUo7TyHnE5xPvMkD";

const timeToMinutes = (t: string) => parseInt(t, 10) * (t.endsWith("h") ? 60 : 1);

export const FEED_POSTS: FeedPost[] = (
  [
    {
      id: "p1", name: "Maya Chen", handle: "@maya.creates", time: "14m", avatar: "#1D9E75", following: true,
      text: "Neon harbour at midnight. Took about forty prompt iterations to get the reflections right.",
      media: "radial-gradient(circle at 25% 30%, #ff5fa2 0%, transparent 45%), radial-gradient(circle at 80% 70%, #22d3ee 0%, transparent 50%), linear-gradient(135deg, #1e1b4b, #0f172a)",
      likes: 214, reposts: 38, replies: 12, provenance: prov(101, "Midjourney", W1, 0.2, "midjourney-v6"),
    },
    {
      id: "p2", name: "Jonah Reyes", handle: "@jonah_k", time: "2h", avatar: "#7c3aed", following: false,
      text: "Golden hour on a planet that doesn't exist yet.",
      media: "radial-gradient(circle at 70% 25%, #fde68a 0%, transparent 40%), radial-gradient(circle at 20% 80%, #f97316 0%, transparent 50%), linear-gradient(160deg, #7c2d12, #1c1917)",
      likes: 482, reposts: 91, replies: 27, provenance: prov(202, "Flux", W2, 2, "flux-1"),
    },
    {
      id: "p3", name: "Lena Okafor", handle: "@lena.art", time: "5h", avatar: "#e0a43a", following: true,
      text: "Sketchbook day. Pencil on paper, photographed on my desk by the window.",
      media: "radial-gradient(circle at 50% 40%, #f5efe1 0%, transparent 55%), linear-gradient(135deg, #78716c, #44403c)",
      likes: 96, reposts: 4, replies: 9,
    },
    {
      id: "p4", name: "Devon Park", handle: "@devon.codes", time: "1h", avatar: "#185FA5", following: false,
      text: "Shipping a new design system today. Here's the colour palette we landed on.",
      media: "linear-gradient(90deg, #0ea5e9 0%, #6366f1 35%, #a855f7 65%, #ec4899 100%)",
      likes: 150, reposts: 22, replies: 18,
    },
    {
      id: "p5", name: "Priya Nair", handle: "@priya.shoots", time: "3h", avatar: "#ec4899", following: true,
      text: "Keyframe for a short film I'm making. Sora is wild for pre-visualisation.",
      media: "radial-gradient(circle at 30% 70%, #38bdf8 0%, transparent 45%), radial-gradient(circle at 75% 25%, #a78bfa 0%, transparent 45%), linear-gradient(135deg, #0c4a6e, #1e1b4b)",
      likes: 391, reposts: 57, replies: 31, provenance: prov(505, "Sora", W3, 3, "sora-1.0"),
    },
    {
      id: "p6", name: "Sam Whitaker", handle: "@sam_makes", time: "8h", avatar: "#f97316", following: false,
      text: "Poster concept for the weekend market — Firefly for the base art, finished by hand.",
      media: "radial-gradient(circle at 20% 25%, #facc15 0%, transparent 40%), radial-gradient(circle at 85% 80%, #ef4444 0%, transparent 45%), linear-gradient(135deg, #be185d, #7c2d12)",
      likes: 128, reposts: 15, replies: 6, provenance: prov(606, "Adobe Firefly", W4, 8, "firefly-2"),
    },
    {
      id: "p7", name: "Aiko Tanaka", handle: "@aiko.draws", time: "22m", avatar: "#14b8a6", following: true,
      text: "Cherry blossoms and rain. No AI on this one, just a long afternoon.",
      media: "radial-gradient(circle at 55% 35%, #fbcfe8 0%, transparent 50%), linear-gradient(180deg, #475569, #1e293b)",
      likes: 305, reposts: 40, replies: 22,
    },
    {
      id: "p8", name: "Marcus Bell", handle: "@marcusbell", time: "6h", avatar: "#6366f1", following: false,
      text: "Ideogram's text rendering has gotten absurdly good. Logo exploration for a coffee brand.",
      media: "radial-gradient(circle at 50% 50%, #fef3c7 0%, transparent 35%), linear-gradient(135deg, #451a03, #78350f 55%, #1c1917)",
      likes: 87, reposts: 9, replies: 14, provenance: prov(808, "Ideogram", W1, 6, "ideogram-2"),
    },
  ] as FeedPost[]
).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
