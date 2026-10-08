import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { AboutView } from "../components/AboutView";
import { AnchorView } from "../components/AnchorView";
import { CursorFollower } from "../components/CursorFollower";
import { IntroBanner } from "../components/IntroBanner";
import { NavBar, type View } from "../components/NavBar";
import { SocialView } from "../components/SocialView";
import { Toast, type ToastData } from "../components/Toast";
import { WelcomeModal } from "../components/WelcomeModal";
import { useChain } from "../lib/chain/useChain";
import { lsGet, lsSet } from "../lib/storage";

const MODAL_KEY = "origina_modal_v2";
const bannerKey = (page: BannerPage) => `origina_banner_v2_${page}`;

type BannerPage = "anchor" | "social";

const BANNERS: Record<BannerPage, JSX.Element> = {
  anchor: (
    <>
      <strong>What anchoring does.</strong> It writes a verifiable fingerprint of your AI-generated image
      to Solana. Your file stays on your device — only the fingerprint goes on-chain, so anyone can later
      check where the image came from without Origina ever holding it. Only providers approved by the
      Origina registry can anchor.
    </>
  ),
  social: (
    <>
      <strong>Platform view.</strong> Posts carrying an Origina badge have a provenance record — click
      the badge to inspect it. To check your own image, upload it under &quot;Add to feed&quot; below; it
      is looked up on-chain, no wallet needed.
    </>
  ),
};

export default function Home() {
  const [view, setView] = useState<View>("about");
  const [modalOpen, setModalOpen] = useState(false);
  // null until localStorage has been read on the client, so nothing flashes during hydration
  const [dismissed, setDismissed] = useState<Record<BannerPage, boolean> | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
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
    showToast("👋 Start on the About page for a full overview", undefined, "about");
  }

  function dismissBanner(page: BannerPage) {
    lsSet(bannerKey(page), "1");
    setDismissed((d) => (d ? { ...d, [page]: true } : d));
  }

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
        <section className="page" hidden={view !== "about"}>
          <AboutView />
        </section>
        <section className="page" hidden={view !== "anchor"}>
          {banner("anchor")}
          <AnchorView client={chain.client} chain={chain} onGoSocial={() => changeView("social")} />
        </section>
        <section className="page" hidden={view !== "social"}>
          {banner("social")}
          <SocialView client={chain.client} onToast={showToast} />
        </section>
      </main>
    </>
  );
}
