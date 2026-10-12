/**
 * The Origina mark. It is a transparent cut-out (public/origina-mark.png), so it sits directly on the glass UI
 * with a soft teal glow instead of inside a tile. `height` is in CSS pixels; the width follows the artwork.
 */
export function LogoMark({ height, className = "" }: { height: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/origina-mark.png"
      alt=""
      aria-hidden="true"
      className={`logo-img ${className}`.trim()}
      style={{ height }}
      draggable={false}
    />
  );
}
