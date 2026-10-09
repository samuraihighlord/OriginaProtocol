import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnchorView, type AnchoredImage } from "../components/AnchorView";
import { CursorFollower } from "../components/CursorFollower";
import { HomeView } from "../components/HomeView";
import { IntroBanner } from "../components/IntroBanner";
import { NavBar, type View } from "../components/NavBar";
import { SocialView } from "../components/SocialView";
import { Toast, type ToastData } from "../components/Toast";
import { WelcomeModal } from "../components/WelcomeModal";
import { useChain } from "../lib/chain/useChain";
import type { FeedPost } from "../lib/feed";
import { lsGet, lsSet } from "../lib/storage";

const MODAL_KEY = "origina_modal_v3";
const bannerKey = (page: BannerPage) => `origina_banner_v3_${page}`;

type BannerPage = "anchor" | "social";

const BANNERS: Record<BannerPage, JSX.Element> = {
  anchor: (
    <>
      <strong>What anchoring does.</strong> It writes a verifiable fingerprint of your AI-generated image
      to Solana. Your file stays on your device — only the fingerprint goes on-chain, so anyone can later
      check where the image came from without Origina ever holding it. Origina is the registered provider
      and a connected wallet co-signs as the creator and pays the small devnet SOL fee.
    </>
  ),
  social: (
    <>
      <strong>Platform view.</strong> Posts carrying an Origina badge have a provenance record — click
      the badge to see which model made the image and open its Solana record. Images you anchor appear at
      the top of the feed.
    </>
  ),
};

/** A post for an image anchored in this session. Read-only, like the rest of the feed. */
function anchoredPost(image: AnchoredImage): FeedPost {
  const { record, recordUrl, transactionUrl, providerName } = image.result;
  return {
    id: `anchored-${record.file_hash}`,
    name: "You",
    handle: "@you",
    time: "now",
    avatar: "#1D9E75",
    following: false,
    text: "",
    imgUrl: image.imageUrl,
    likes: 0,
    reposts: 0,
    replies: 0,
    provenance: {
      providerName,
      provider: "origina",
      sha256: record.file_hash,
      creatorWallet: record.creator,
      model: record.model,
      slot: record.confirmed_slot ?? record.slot,
      timestamp: null,
      recordAddress: record.pda,
      recordUrl,
      signature: record.signature,
      transactionUrl,
    },
  };
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [modalOpen, setModalOpen] = useState(false);
  // null until localStorage has been read on the client, so nothing flashes during hydration
  const [dismissed, setDismissed] = useState<Record<BannerPage, boolean> | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [anchoredPosts, setAnchoredPosts] = useState<FeedPost[]>([]);
  const chain = useChain();
  const toastId = useRef(0);

  useEffect(() => {
    setModalOpen(!lsGet(MODAL_KEY));
    setDismissed({ anchor: !!lsGet(bannerKey("anchor")), social: !!lsGet(bannerKey("social")) });
  }, []);

  const showToast = useCallback((message: string, duration?: number, actionPage?: View) => {
    setToast({ id: ++toastId.current, message, duration, actionPage });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  function changeView(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function closeModal(dontShowAgain: boolean) {
    if (dontShowAgain) lsSet(MODAL_KEY, "1");
    setModalOpen(false);
    showToast("👋 Start on the Home page for a full overview", undefined, "home");
  }

  function dismissBanner(page: BannerPage) {
    lsSet(bannerKey(page), "1");
    setDismissed((d) => (d ? { ...d, [page]: true } : d));
  }

  const addAnchored = useCallback((image: AnchoredImage) => {
    setAnchoredPosts((prev) =>
      prev.some((p) => p.id === `anchored-${image.result.record.file_hash}`) ? prev : [anchoredPost(image), ...prev],
    );
  }, []);

  const banner = (page: BannerPage) =>
    dismissed && !dismissed[page] ? (
      <IntroBanner onDismiss={() => dismissBanner(page)}>{BANNERS[page]}</IntroBanner>
    ) : null;

  return (
    <>
      <Head>
        <title>Origina Protocol</title>
        <meta name="description" content="The open-source AI media provenance layer on Solana." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="orb orb-teal" />
      <div className="orb orb-purple" />
      <div className="orb orb-blue" />
      <CursorFollower />

      <NavBar view={view} onChange={changeView} chain={chain} />
      {modalOpen && <WelcomeModal onClose={closeModal} />}
      <Toast toast={toast} onAction={changeView} onDone={clearToast} />

      <main className="container">
        {/* All pages stay mounted so in-progress work and the feed survive tab switches. */}
        <section className="page" hidden={view !== "home"}>
          <HomeView onGoAnchor={() => changeView("anchor")} />
        </section>
        <section className="page" hidden={view !== "anchor"}>
          {banner("anchor")}
          <AnchorView
            client={chain.client}
            chain={chain}
            onGoSocial={() => changeView("social")}
            onAnchored={addAnchored}
          />
        </section>
        <section className="page" hidden={view !== "social"}>
          {banner("social")}
          <SocialView anchoredPosts={anchoredPosts} onToast={showToast} />
        </section>
      </main>
    </>
  );
}
