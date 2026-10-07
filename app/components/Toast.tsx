import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { View } from "./NavBar";

export interface ToastData {
  id: number;
  message: string;
  actionPage?: View;
  duration?: number;
}

export function Toast({
  toast,
  onAction,
  onDone,
}: {
  toast: ToastData | null;
  onAction: (page: View) => void;
  onDone: () => void;
}) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setHiding(false);
    const duration = toast.duration ?? 6000;
    const hide = setTimeout(() => setHiding(true), duration);
    const done = setTimeout(onDone, duration + 400);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [toast, onDone]);

  if (!toast) return null;

  return (
    <div className={`toast${hiding ? " hiding" : ""}`} role="status">
      <span>{toast.message}</span>
      {toast.actionPage && (
        <button
          type="button"
          className="toast-btn"
          aria-label={`Go to ${toast.actionPage}`}
          onClick={() => {
            onAction(toast.actionPage as View);
            onDone();
          }}
        >
          <Icon name="arrow" />
        </button>
      )}
    </div>
  );
}
