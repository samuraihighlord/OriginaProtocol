/**
 * The "Origina" wordmark (public/origina-wordmark.png): transparent cut-out of the brand lettering, so it sits on the
 * glass UI without a backing tile. Pair it with the visible word "Protocol" where the full name is meant.
 * `height` is in CSS pixels; the width follows the artwork.
 */
export function Wordmark({ height, className = "" }: { height: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/origina-wordmark.png"
      alt="Origina"
      className={`wordmark-img ${className}`.trim()}
      style={{ height, position: "relative", top: Math.round(height * 0.195) }}
      draggable={false}
    />
  );
}
