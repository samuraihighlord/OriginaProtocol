import { useCallback, useState } from "react";
import { FEED_POSTS, type FeedPost } from "../lib/feed";
import { Icon } from "./Icon";
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
              className="prov-badge"
              aria-label="View provenance record"
              onClick={() => onOpenProvenance(post)}
            >
              <LogoMark height={17} />
              AI-generated
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
  anchoredPosts,
  onToast,
}: {
  /** Images anchored in this session, newest first; they join the feed read-only. */
  anchoredPosts: FeedPost[];
  onToast: (message: string, duration?: number) => void;
}) {
  const [feedTab, setFeedTab] = useState<FeedTab>("foryou");
  const [interactions, setInteractions] = useState<Record<string, Interaction>>({});
  const [openPost, setOpenPost] = useState<FeedPost | null>(null);

  const closeDrawer = useCallback(() => setOpenPost(null), []);

  // hasOrigina is "this post carries a provenance record".
  const posts = [...anchoredPosts, ...FEED_POSTS].filter((p) => feedTab === "foryou" || !!p.provenance);

  function toggle(id: string, key: "liked" | "reposted") {
    setInteractions((prev) => ({ ...prev, [id]: { ...prev[id], [key]: !prev[id]?.[key] } }));
  }

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
