import type { CSSProperties } from "react";

export const page: CSSProperties = {
  minHeight: "100vh",
  background: "#0b0f14",
  color: "#e6edf3",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "32px 24px 64px",
};

export const container: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
};

export const title: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: 0,
};

export const subtitle: CSSProperties = {
  color: "#9aa7b2",
  marginTop: 8,
  marginBottom: 24,
  fontSize: 15,
};

export const howItWorksBar: CSSProperties = {
  background: "#111823",
  border: "1px solid #1f2a37",
  borderRadius: 12,
  padding: "16px 20px",
  marginBottom: 32,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#c3cdd6",
};

export const panelGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
  gap: 24,
};

export const panel: CSSProperties = {
  background: "#111823",
  border: "1px solid #1f2a37",
  borderRadius: 16,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const panelLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#6ee7b7",
};

export const panelLabelPlatform: CSSProperties = {
  ...panelLabel,
  color: "#93c5fd",
};

export const panelHeading: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
};

export function dropzone(isDragActive: boolean): CSSProperties {
  return {
    border: `2px dashed ${isDragActive ? "#6ee7b7" : "#2a3644"}`,
    borderRadius: 12,
    padding: 28,
    textAlign: "center",
    cursor: "pointer",
    background: isDragActive ? "rgba(110, 231, 183, 0.06)" : "#0d131b",
    color: "#9aa7b2",
    fontSize: 14,
    transition: "border-color 120ms ease, background 120ms ease",
  };
}

export const previewImg: CSSProperties = {
  maxWidth: "100%",
  maxHeight: 160,
  borderRadius: 8,
  objectFit: "contain",
  display: "block",
  margin: "0 auto",
};

export const label: CSSProperties = {
  fontSize: 13,
  color: "#9aa7b2",
  marginBottom: 6,
  display: "block",
};

export const select: CSSProperties = {
  width: "100%",
  background: "#0d131b",
  color: "#e6edf3",
  border: "1px solid #2a3644",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
};

export const input: CSSProperties = {
  width: "100%",
  background: "#0d131b",
  color: "#e6edf3",
  border: "1px solid #2a3644",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

export function button(disabled: boolean): CSSProperties {
  return {
    background: disabled ? "#1f2a37" : "#22c55e",
    color: disabled ? "#6b7683" : "#04150a",
    border: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export const errorText: CSSProperties = {
  color: "#f87171",
  fontSize: 13,
};

export const resultBox: CSSProperties = {
  background: "#0d131b",
  border: "1px solid #2a3644",
  borderRadius: 10,
  padding: 14,
  fontSize: 13,
  color: "#c3cdd6",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export const infoNote: CSSProperties = {
  fontSize: 11,
  color: "#6b7683",
  fontStyle: "italic",
  marginTop: 2,
};

export const resultRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
};

export const resultKey: CSSProperties = {
  color: "#6b7683",
};

export const link: CSSProperties = {
  color: "#93c5fd",
};

function badgeBase(bg: string, border: string, fg: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    color: fg,
    borderRadius: 12,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };
}

export const badgeExact = badgeBase("rgba(34, 197, 94, 0.1)", "#22c55e", "#86efac");
export const badgeNear = badgeBase("rgba(245, 158, 11, 0.1)", "#f59e0b", "#fcd34d");
export const badgeNotFound = badgeBase("rgba(148, 163, 184, 0.08)", "#3a4653", "#9aa7b2");

export const badgeTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
};

export const badgeDetail: CSSProperties = {
  fontSize: 13,
  opacity: 0.9,
};
