import { useCallback, useEffect, useRef, useState } from "react";
import { describeChainError } from "../lib/chain/errors";
import { describeFile } from "../lib/format";
import { FEED_POSTS, type FeedPost } from "../lib/feed";
import type { OriginaClient } from "../lib/originaClient";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { ProvenanceDrawer } from "./ProvenanceDrawer";

type FeedTab = "foryou" | "following" | "verified";
type Interaction = { liked?: boolean; reposted?: boolean };

const TABS: { id: FeedTab; label: string }[] = [
  { id: "foryou", label: "For You" },
  { id: "following", label: "Following" },
  { id: "verified", label: "Origina Verified" },
];

function PostCard({
  post,
  interaction,
  onToggle,
  onOpenProvenance,
  onUnavailable,
}: {
  post: FeedPost;
  interaction: Interaction;
  onToggle: (id: string, key: "liked" | "reposted") => void;
  onOpenProvenance: (post: FeedPost) => void;
  onUnavailable: (what: string) => void;
}) {
  const near = post.provenance?.matchType === "near";
  return (
    <article className="post">
      <div className="avatar" style={{ background: post.avatar }}>
        {post.name[0].toUpperCase()}
      </div>
      <div className="post-body">
        <div className="post-head">
          <span className="post-name">{post.name}</span>
          <span className="post-handle">{post.handle}</span>
          <span className="post-time">· {post.time}</span>
        </div>
        {post.text && <div className="post-text">{post.text}</div>}
        <div className="post-media" style={post.media ? { background: post.media } : undefined}>
          {post.imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.imgUrl} alt="Posted image" />
          )}
          {post.provenance && (
            <button
              type="button"
              className={`prov-badge${near ? " near" : ""}`}
              aria-label="View provenance record"
              onClick={() => onOpenProvenance(post)}
            >
              <span className="mini-mark">O</span>
              {near ? "AI-generated · modified" : "AI-generated"}
            </button>
          )}
        </div>
        <div className="post-actions">
          <button type="button" className="act" aria-label="Reply" onClick={() => onUnavailable("Replies")}>
            <Icon name="reply" />
            <span>{post.replies}</span>
          </button>
          <button
            type="button"
            className={`act${interaction.reposted ? " reposted" : ""}`}
            aria-label="Repost"
            onClick={() => onToggle(post.id, "reposted")}
          >
            <Icon name="repost" />
            <span>{post.reposts + (interaction.reposted ? 1 : 0)}</span>
          </button>
          <button
            type="button"
            className={`act${interaction.liked ? " liked" : ""}`}
            aria-label="Like"
            onClick={() => onToggle(post.id, "liked")}
          >
            <Icon name="heart" />
            <span>{post.likes + (interaction.liked ? 1 : 0)}</span>
          </button>
          <button type="button" className="act" aria-label="Share" onClick={() => onUnavailable("Sharing")}>
            <Icon name="share" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function SocialView({
  client,
  onToast,
}: {
  client: OriginaClient;
  onToast: (message: string, duration?: number) => void;
}) {
  const [feedTab, setFeedTab] = useState<FeedTab>("foryou");
  const [userPosts, setUserPosts] = useState<FeedPost[]>([]);
  const [interactions, setInteractions] = useState<Record<string, Interaction>>({});
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const closeDrawer = useCallback(() => setOpenPost(null), []);

  const posts = [...userPosts, ...FEED_POSTS].filter((p) => {
    if (feedTab === "verified") return !!p.provenance;
    if (feedTab === "following") return p.following;
    return true;
  });

  function toggle(id: string, key: "liked" | "reposted") {
    setInteractions((prev) => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id]?.[key] } }));
  }

  async function handleFile(file: File) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setBytes(data);
    setFileLabel(describeFile(file, data));
    setPreview(url);
  }

  async function handlePost() {
    if (!bytes || !preview) return;
    setPosting(true);
    setError(null);
    try {
      const match = await client.verify({ fileData: bytes });
      const post: FeedPost = {
        id: `u${nextId.current++}`,
        name: "You",
        handle: "@you",
        time: "now",
        avatar: "#1D9E75",
        following: false,
        text: caption.trim(),
        imgUrl: preview,
        likes: 0,
        reposts: 0,
        replies: 0,
        provenance: match.found
          ? {
              providerName: match.providerName,
              provider: match.provider ?? "",
              sha256: match.sha256 ?? "",
              creatorWallet: match.creatorWallet,
              slot: match.slot,
              timestamp: match.timestamp,
              recordAddress: match.recordAddress,
              recordUrl: match.recordUrl,
              matchType: match.exactMatch ? "exact" : "near",
              distance: match.pHashDistance ?? undefined,
            }
          : undefined,
      };
      setUserPosts((p) => [post, ...p]);

      // The feed post now owns this object URL, so just detach it from the composer.
      setBytes(null);
      setPreview(null);
      setCaption("");

      if (feedTab === "following" || (feedTab === "verified" && !post.provenance)) setFeedTab("foryou");
      setTimeout(() => feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      onToast(
        match.exactMatch
          ? "Exact match — this image has an Origina record on Solana."
          : match.nearMatch
          ? "Near match — this looks like a modified anchored image."
          : "No Origina record found on-chain for this image.",
        3500
      );
    } catch (err) {
      setError(`Could not verify this file: ${describeChainError(err)}`);
    } finally {
      setPosting(false);
    }
  }

  function jumpToComposer() {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(false);
    setTimeout(() => setFlash(true), 0);
  }

  return (
    <>
      <div className="glass" style={{ padding: "0 12px" }}>
        <div className="feed-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={feedTab === t.id}
              className={`feed-tab${feedTab === t.id ? " active" : ""}`}
              onClick={() => setFeedTab(t.id)}
            >
              {t.id === "verified" && <span className="mini-mark">O</span>}
              {t.label}
            </button>
          ))}
        </div>
        <div className="feed-toolbar">
          <button type="button" className="btn btn-subtle" onClick={jumpToComposer}>
            <Icon name="upload" />
            Add an image to the feed
          </button>
        </div>
        <div className="feed" ref={feedRef}>
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              interaction={interactions[p.id] ?? {}}
              onToggle={toggle}
              onOpenProvenance={setOpenPost}
              onUnavailable={(what) => onToast(`${what} aren't available yet.`, 2500)}
            />
          ))}
        </div>
      </div>

      <div
        className={`glass composer${flash ? " flash" : ""}`}
        ref={composerRef}
        onAnimationEnd={() => setFlash(false)}
      >
        <h2>Add to feed</h2>
        <p className="sub">Post an image and it&apos;s checked against the on-chain Origina records — a match earns the badge. No wallet needed.</p>
        <ImageDropzone title="Drop an image here" preview={preview} onFile={handleFile} onError={setError} />
        {bytes && <div className="file-meta">{fileLabel}</div>}
        {error && <div className="error-text">{error}</div>}
        <div style={{ marginTop: 14 }}>
          <label className="field-label" htmlFor="social-caption">
            Caption
          </label>
          <input
            type="text"
            id="social-caption"
            placeholder="What's happening?"
            autoComplete="off"
            maxLength={280}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary btn-block" disabled={!bytes || posting} onClick={handlePost}>
          {posting ? (
            <>
              <span className="spinner" />
              Verifying…
            </>
          ) : (
            "Post"
          )}
        </button>
      </div>

      {openPost?.provenance && <ProvenanceDrawer provenance={openPost.provenance} onClose={closeDrawer} />}
    </>
  );
}
