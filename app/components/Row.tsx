import type { ReactNode } from "react";

export function Row({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className={`v${mono ? " mono" : ""}`}>{children}</span>
    </div>
  );
}
