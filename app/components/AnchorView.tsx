import { Fragment, useEffect, useRef, useState } from "react";
import type { AnchorStatus } from "../lib/anchorApi";
import { CLUSTER } from "../lib/chain/config";
import { describeChainError } from "../lib/chain/errors";
import type { ChainState } from "../lib/chain/useChain";
import { describeFile, truncateAddress, truncateHash } from "../lib/format";
import { MAX_MODEL_LENGTH, normalizeModel } from "../lib/models";
import type { AnchorResult, OriginaClient } from "../lib/originaClient";
import type { ProvenanceRecordData } from "../lib/provenance";
import { Icon } from "./Icon";
import { ImageDropzone } from "./ImageDropzone";
import { Row } from "./Row";
import { WalletList } from "./WalletPanels";

const STEPS = ["Upload image", "Analyse", "Anchor"];

const formatSol = (lamports: number | bigint) => {
  const sol = Number(lamports) / 1_000_000_000;
  return sol >= 1 ? sol.toFixed(3) : sol.toFixed(4);
};

type Status = "idle" | "working" | "done";

/** What the Social feed needs to show an image anchored in this session. */
export interface AnchoredImage {
  imageUrl: string;
  result: AnchorResult;
}

export function AnchorView({
  client,
  chain,
  onGoSocial,
  onAnchored,
}: {
  client: OriginaClient;
  chain: ChainState;
  onGoSocial: () => void;
  onAnchored: (image: AnchoredImage) => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  /** Fields extracted from the image for this upload session; null while analysing. */
  const [record, setRecord] = useState<ProvenanceRecordData | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnchorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelText, setModelText] = useState("");
  const [fileType, setFileType] = useState("image/png");
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus | null>(null);
  /** The connected wallet's SOL balance in lamports (null while unknown). */
  const [balance, setBalance] = useState<bigint | null>(null);
  const latestFile = useRef(0);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const refreshAnchorStatus = () => void client.getAnchorStatus().then(setAnchorStatus);
  useEffect(() => {
    refreshAnchorStatus();
    // The status describes Origina's wallet, not the user's, so it is read once per page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A connected wallet that can sign pays for the anchor; otherwise Origina does (and records no creator).
  const payingWallet = chain.address && !chain.walletCannotSign ? chain.address : null;
  const refreshBalance = () => {
    if (payingWallet) void client.getWalletBalance(payingWallet).then(setBalance);
    else setBalance(null);
  };
  useEffect(() => {
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payingWallet]);

  const cost = anchorStatus?.cost;
  const insufficient = !!payingWallet && !!cost && balance !== null && balance < BigInt(cost.requiredLamports);
  const originaCannotPay = !payingWallet && anchorStatus?.ready === true && anchorStatus.originaPays === false;

  const model = normalizeModel(modelText);
  const modelInvalid = modelText.trim().length > 0 && !model;
  const unavailable = anchorStatus !== null && !anchorStatus.ready;
  const canAnchor = !!record && !analysing && !!model && !unavailable && !insufficient && !originaCannotPay;
  const stage = status === "done" ? 4 : !bytes ? 1 : analysing ? 2 : 3;

  async function handleFile(file: File) {
    const id = ++latestFile.current;
    setResult(null);
    setStatus("idle");
    setError(null);
    setRecord(null);
    setAnalysing(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      setBytes(data);
      setFileType(file.type || "image/png");
      setFileLabel(describeFile(file, data));
      setPreview(URL.createObjectURL(file));
      const extracted = await client.analyse(data);
      if (id === latestFile.current) setRecord(extracted);
    } catch (err) {
      if (id === latestFile.current) {
        setBytes(null);
        setError(`Could not analyse this file: ${describeChainError(err)}`);
      }
    } finally {
      if (id === latestFile.current) setAnalysing(false);
    }
  }

  async function handleAnchor() {
    if (!record || !model || !canAnchor || status === "working") return;
    setStatus("working");
    setResult(null);
    setError(null);
    try {
      const anchored = await client.anchor({ record, model });
      setResult(anchored);
      setStatus("done");
      // The feed gets its own copy of the image, so it outlives replacing the one in this page.
      if (bytes) {
        onAnchored({ imageUrl: URL.createObjectURL(new Blob([bytes.slice()], { type: fileType })), result: anchored });
      }
      refreshBalance();
    } catch (err) {
      setError(describeChainError(err));
      setStatus("idle");
      refreshAnchorStatus();
      refreshBalance();
    }
  }

  return (
    <>
      <h1 className="page-title">Anchor AI media</h1>
      <p className="page-sub">Stamp your AI-generated image with a permanent on-chain fingerprint.</p>
      <button type="button" className="next-link social-jump" onClick={onGoSocial}>
        Test provenance on the Social page <Icon name="arrow" />
      </button>

      <div className="progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const cls = n < stage ? "done" : n === stage ? "active" : "";
          return (
            <Fragment key={label}>
              {i > 0 && <div className={`p-line${i < stage ? " done" : ""}`} />}
              <div className={`p-step ${cls}`}>
                <span className="p-dot">{n < stage ? <Icon name="check" /> : n}</span>
                <span className="lbl">{label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="glass card">
        <ImageDropzone
          title="Drop your AI-generated image here"
          preview={preview}
          showReplaceHint
          onFile={handleFile}
          onError={setError}
        />
        {bytes && <div className="file-meta">{fileLabel}</div>}
        {analysing && (
          <div className="muted-line" role="status">
            <span className="spinner" /> Analysing image...
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
        {unavailable && anchorStatus?.message && <div className="status-note">{anchorStatus.message}</div>}
        {originaCannotPay && (
          <div className="status-note">
            Anchoring without a wallet is paused. Connect a wallet to pay for the anchor yourself.
          </div>
        )}

        <div className={`reveal${bytes ? " open" : ""}`}>
          <label className="field-label" htmlFor="model-input">
            AI model used to generate this image
          </label>
          <input
            type="text"
            id="model-input"
            value={modelText}
            maxLength={MAX_MODEL_LENGTH}
            placeholder="Type the model's name, e.g. midjourney-v6"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={modelInvalid}
            onChange={(e) => setModelText(e.target.value)}
          />
          {modelInvalid && (
            <div className="error-text">Use letters, numbers and . _ + - / only (up to {MAX_MODEL_LENGTH} characters).</div>
          )}

          <div className="honesty-note">
            <div className="honesty-label">A note from Origina</div>
            <p>
              This demo is built on trust. Origina is a provenance protocol — it records what you tell it. For this
              proof of concept to produce meaningful data, please only upload images that were genuinely generated by
              an AI tool, and enter the actual model used to create them. Anchoring false information defeats the
              purpose of the protocol and pollutes the provenance record. We are trusting you to be honest.
            </p>
          </div>

          <label className="field-label" style={{ marginTop: 14 }}>
            Your wallet (optional)
          </label>
          {chain.walletCannotSign ? (
            <p className="muted-line">
              {chain.connectedWalletName} is connected but can&apos;t sign for Solana {CLUSTER}. In Phantom, turn on
              Settings → Developer Settings → Testnet Mode. Until then the record is anchored without a creator.
            </p>
          ) : chain.address ? (
            <>
              <p className="muted-line">
                {chain.connectedWalletName} · <span className="mono">{truncateAddress(chain.address, 6, 6)}</span>
                {balance !== null && <> · {formatSol(balance)} SOL</>} — it co-signs the record as the creator and pays
                for it{cost ? <> (about {formatSol(cost.rentLamports + cost.feeLamports)} SOL)</> : null}.
              </p>
              {insufficient && cost && (
                <div className="status-note">
                  This wallet needs at least {formatSol(cost.requiredLamports)} devnet SOL to anchor. Get free devnet SOL
                  at{" "}
                  <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">
                    faucet.solana.com
                  </a>
                  , then{" "}
                  <button type="button" className="next-link" style={{ display: "inline", padding: 0 }} onClick={refreshBalance}>
                    check again
                  </button>
                  .
                </div>
              )}
            </>
          ) : (
            <>
              <p className="muted-line">
                Connect a wallet to be recorded as the creator. It pays the record&apos;s deposit
                {cost ? <> (about {formatSol(cost.rentLamports + cost.feeLamports)} devnet SOL)</> : null}. Or anchor
                without one and Origina pays.
              </p>
              <WalletList chain={chain} />
            </>
          )}
        </div>

        <div className={`reveal-up${bytes ? " open" : ""}`}>
          <button
            type="button"
            className={`btn btn-primary btn-block${status === "done" ? " success" : ""}`}
            disabled={!canAnchor || status !== "idle"}
            onClick={handleAnchor}
          >
            {status === "working" ? (
              <>
                <span className="spinner" />
                {chain.address ? "Anchoring — approve in your wallet…" : "Anchoring…"}
              </>
            ) : status === "done" ? (
              <>
                <Icon name={result?.alreadyAnchored ? "info" : "check"} />
                {result?.alreadyAnchored ? "Already anchored" : "Anchored on Solana"}
              </>
            ) : (
              <>
                <Icon name="link" />
                Anchor on Solana
              </>
            )}
          </button>
          <p className="micro">
            Only the cryptographic fingerprint is written on-chain — your image never leaves your device. Network:
            Solana {CLUSTER}. Origina is the registered provider. A connected wallet pays the record&apos;s deposit and
            the network fee; with no wallet, Origina pays.
          </p>
        </div>

        {result && result.alreadyAnchored && result.existing && (
          <ExistingRecord result={result} existing={result.existing} wallet={chain.address} onGoSocial={onGoSocial} />
        )}

        {result && !result.alreadyAnchored && (
          <div className="result">
            <div className="result-title">
              <Icon name="check" />
              Fingerprint anchored on Solana
            </div>
            <Row label="File hash">
              <span title={result.record.file_hash}>{truncateHash(result.record.file_hash)}</span>
            </Row>
            {result.record.slot !== null && <Row label="Slot">{result.record.slot}</Row>}
            <Row label="Generated at" mono={false}>
              {new Date(result.record.generated_at * 1000).toLocaleString()}
            </Row>
            <Row label="PDA address">
              <a href={result.recordUrl} target="_blank" rel="noopener noreferrer" title={result.record.pda}>
                {truncateAddress(result.record.pda, 6, 6)} ↗
              </a>
            </Row>
            {result.record.signature && result.transactionUrl && (
              <Row label="Transaction">
                <a href={result.transactionUrl} target="_blank" rel="noopener noreferrer" title={result.record.signature}>
                  {truncateHash(result.record.signature)} ↗
                </a>
              </Row>
            )}
            {result.creatorSkipped && (
              <div className="result-note">Your wallet can&apos;t co-sign, so this record has no creator.</div>
            )}
            <button type="button" className="next-link" onClick={onGoSocial}>
              Now go to the Social page to see this image verified in a feed <Icon name="arrow" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Shown when the image had already been anchored: a record is permanent and there is only one per file, so nothing
 * new is written and nothing is charged. Says plainly who the existing record names, and that it isn't this wallet.
 */
function ExistingRecord({
  result,
  existing,
  wallet,
  onGoSocial,
}: {
  result: AnchorResult;
  existing: NonNullable<AnchorResult["existing"]>;
  /** The wallet connected right now, if any. */
  wallet: string | null;
  onGoSocial: () => void;
}) {
  const when = new Date(existing.anchoredAt * 1000).toLocaleString();
  const isYou = !!wallet && existing.creator === wallet;

  const permanent = "A record is permanent and there is one per image, so";
  const charged = wallet ? " Nothing was charged to your wallet." : " Nothing was charged.";

  let headline: string;
  let explanation: string;
  if (isYou) {
    headline = "You already anchored this image";
    explanation = `Your wallet anchored it on ${when}. ${permanent} nothing new was written.`;
  } else if (existing.creator) {
    headline = "This image was already anchored by another wallet";
    explanation = `It was first anchored on ${when}. ${permanent} ${
      wallet ? "your wallet isn't" : "you aren't"
    } recorded on it and nothing new was written.`;
  } else {
    headline = "This image was already anchored";
    explanation = `It was first anchored on ${when} without a wallet, so the record names no creator. ${permanent} nothing new was written.`;
  }

  return (
    <div className="result existing">
      <div className="result-title">
        <Icon name="info" />
        {headline}
      </div>
      <p className="existing-explainer">{explanation}{charged}</p>
      <Row label="First anchored" mono={false}>
        {when}
      </Row>
      <Row label="Creator wallet" mono={!!existing.creator}>
        {existing.creator ? (
          <span title={existing.creator}>
            {truncateAddress(existing.creator, 6, 6)}
            {isYou && " (you)"}
          </span>
        ) : (
          "None (anchored without a wallet)"
        )}
      </Row>
      {result.record.model && (
        <Row label="AI model" mono={false}>
          {result.record.model}
        </Row>
      )}
      <Row label="File hash">
        <span title={result.record.file_hash}>{truncateHash(result.record.file_hash)}</span>
      </Row>
      <Row label="Slot">{result.record.confirmed_slot ?? result.record.slot}</Row>
      <Row label="PDA address">
        <a href={result.recordUrl} target="_blank" rel="noopener noreferrer" title={result.record.pda}>
          {truncateAddress(result.record.pda, 6, 6)} ↗
        </a>
      </Row>
      <button type="button" className="next-link" onClick={onGoSocial}>
        See this image verified in a feed <Icon name="arrow" />
      </button>
    </div>
  );
}
