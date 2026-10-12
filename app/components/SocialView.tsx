import { useCallback, useEffect, useRef, useState } from "react";
import { describeChainError } from "../lib/chain/errors";
import { describeFile } from "../lib/format";
import { FEED_POSTS, type FeedPost } from "../lib/feed";
import type { OriginaClient } from "../lib/originaClient";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { LogoMark } from "./LogoMark";
import { ProvenanceDrawer } from "./ProvenanceDrawer";

type FeedTab = "foryou" | "verified";
type Interaction = { liked?: boolean; reposted?: boolean };

const TABS: { id: FeedTab; label: string }[] = [
  { id: "foryou", label: "For You" },
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
  const hasMedia = !!(post.imgUrl || post.media);
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
        {hasMedia && (
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
                <LogoMark height={17} />
                {near ? "AI-generated · edited copy" : "AI-generated"}
              </button>
            )}
          </div>
        )}
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
  anchoredPosts,
  onToast,
}: {
  client: OriginaClient;
  /** Images anchored in this session, newest first. */
  anchoredPosts: FeedPost[];
  onToast: (message: string, duration?: number) => void;
}) {
  const [feedTab, setFeedTab] = useState<FeedTab>("foryou");
  const [interactions, setInteractions] = useState<Record<string, Interaction>>({});
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);
  const [userPosts, setUserPosts] = useState<FeedPost[]>([]);

  // composer
  const [caption, setCaption] = useState("");
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const created = urls.current;
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const closeDrawer = useCallback(() => setOpenPost(null), []);

  // hasOrigina is "this post carries a provenance record".
  const posts = [...userPosts, ...anchoredPosts, ...FEED_POSTS].filter((p) => feedTab === "foryou" || !!p.provenance);

  function toggle(id: string, key: "liked" | "reposted") {
    setInteractions((prev) => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id]?.[key] } }));
  }

  async function handleFile(file: File) {
    setError(null);
    const data = new Uint8Array(await file.arrayBuffer());
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setBytes(data);
    setFileLabel(describeFile(file, data));
    setPreview(url);
  }

  function clearImage() {
    setBytes(null);
    setPreview(null);
    setFileLabel("");
  }

  /**
   * Every image goes through a scan before it is posted: the app fingerprints it and looks it up on-chain, and if an
   * anchored record matches (exactly, or as a near copy) the post carries the Origina badge automatically.
   */
  async function handlePost() {
    const text = caption.trim();
    if ((!bytes && !text) || scanning) return;
    setError(null);

    let provenance: FeedPost["provenance"];
    let outcome = "";
    if (bytes) {
      setScanning(true);
      try {
        const match = await client.verify({ fileData: bytes });
        if (match.found) {
          provenance = {
            providerName: match.providerName,
            provider: match.provider ?? "",
            sha256: match.sha256 ?? "",
            creatorWallet: match.creatorWallet,
            model: match.model,
            slot: match.slot,
            timestamp: match.timestamp,
            recordAddress: match.recordAddress,
            recordUrl: match.recordUrl,
            signature: match.signature,
            transactionUrl: match.transactionUrl,
            matchType: match.exactMatch ? "exact" : "near",
            distance: match.pHashDistance ?? undefined,
          };
        }
        outcome = match.exactMatch
          ? "Origina record found: this image was anchored, so your post is tagged."
          : match.nearMatch
          ? "Close match: this looks like an edited copy of an anchored image, so your post is tagged."
          : "No Origina record found on-chain for this image.";
      } catch (err) {
        // Posting without the scan would show an anchored image untagged, so it is not posted.
        setError(`Couldn't scan this image: ${describeChainError(err)} Please try again.`);
        setScanning(false);
        return;
      }
      setScanning(false);
    }

    const post: FeedPost = {
      id: `u${nextId.current++}`,
      name: "You",
      handle: "@you",
      time: "now",
      avatar: "#1D9E75",
      following: false,
      text,
      imgUrl: preview ?? undefined,
      likes: 0,
      reposts: 0,
      replies: 0,
      provenance,
    };
    setUserPosts((p) => [post, ...p]);
    // The post owns the object URL now; the composer just lets go of it.
    setBytes(null);
    setPreview(null);
    setFileLabel("");
    setCaption("");
    if (feedTab === "verified" && !provenance) setFeedTab("foryou");
    if (outcome) onToast(outcome, 4200);
  }

  const canPost = (!!bytes || caption.trim().length > 0) && !scanning;

  return (
    <>
      <div className="glass social">
        <header className="social-head">
          <h1 className="social-title glow-text">Social</h1>
          <div className="social-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={feedTab === t.id}
                className={`social-tab${feedTab === t.id ? " active" : ""}`}
                onClick={() => setFeedTab(t.id)}
              >
                <span className="social-tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="composer">
          <div className="avatar" style={{ background: "#1D9E75" }}>
            Y
          </div>
          <div className="composer-main">
            <label className="sr-only" htmlFor="social-caption">
              What&apos;s happening?
            </label>
            <textarea
              id="social-caption"
              className="composer-text"
              placeholder="What's happening?"
              rows={2}
              maxLength={280}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <ImageDropzone title="Add an image" preview={preview} showReplaceHint onFile={handleFile} onError={(m) => setError(m || null)} />
            {bytes && (
              <div className="composer-file">
                <span className="file-meta">{fileLabel}</span>
                <button type="button" className="composer-remove" onClick={clearImage} disabled={scanning}>
                  Remove
                </button>
              </div>
            )}
            {error && <div className="error-text">{error}</div>}
            <div className="composer-bar">
              <span className="composer-hint" role="status">
                {scanning ? (
                  <>
                    <span className="spinner" /> Scanning for an Origina record…
                  </>
                ) : bytes ? (
                  "This image is scanned for an Origina record when you post."
                ) : (
                  `${280 - caption.length} left`
                )}
              </span>
              <button type="button" className="btn btn-primary composer-post" disabled={!canPost} onClick={handlePost}>
                {scanning ? "Scanning…" : "Post"}
              </button>
            </div>
          </div>
        </div>

        <div className="feed">
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
          {posts.length === 0 && <p className="feed-empty">No posts to show.</p>}
        </div>
      </div>

      {openPost?.provenance && <ProvenanceDrawer provenance={openPost.provenance} onClose={closeDrawer} />}
    </>
  );
}
