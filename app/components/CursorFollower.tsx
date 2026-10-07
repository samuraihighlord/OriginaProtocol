import { useEffect, useRef } from "react";

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], .dropzone, .tab, .feed-tab';
const LERP = 0.15;

export function CursorFollower() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(hover: none), (pointer: coarse)").matches) return;

    let mx = 0;
    let my = 0;
    let cx = 0;
    let cy = 0;
    let seen = false;
    let frame = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!seen) {
        seen = true;
        cx = mx;
        cy = my;
      }
      el.classList.add("visible");
    };
    const onLeave = () => el.classList.remove("visible");
    // Delegated so it also covers elements that mount after this effect runs (feed posts, popovers).
    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      el.classList.toggle("hover", !!target?.closest?.(INTERACTIVE));
    };

    const tick = () => {
      cx += (mx - cx) * LERP;
      cy += (my - cy) * LERP;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseover", onOver);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseover", onOver);
    };
  }, []);

  return <div id="cursor-follower" ref={ref} />;
}
