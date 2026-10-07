import { useState, type ReactNode } from "react";

export function IntroBanner({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(onDismiss, 250);
  }

  return (
    <div className={`banner${closing ? " closing" : ""}`}>
      <span>{children}</span>
      <button type="button" className="banner-close" aria-label="Dismiss" onClick={close}>
        ×
      </button>
    </div>
  );
}
