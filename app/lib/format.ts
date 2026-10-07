import { detectImageFormat, readImageDimensions } from "./imageMeta";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** "name · size", plus format/dimensions when they can be read from the file header (display only). */
export function describeFile(file: File, data: Uint8Array): string {
  const parts = [file.name, formatBytes(file.size)];
  const format = detectImageFormat(data);
  if (format !== "unknown") {
    const dims = readImageDimensions(data);
    parts.push(dims ? `${format.toUpperCase()} ${dims.width}×${dims.height}` : format.toUpperCase());
  }
  return parts.join(" · ");
}

export function truncateAddress(addr: string, head = 4, tail = 4): string {
  return addr.length > head + tail + 1 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

export function truncateHash(hash: string, head = 12, tail = 8): string {
  return hash.length > head + tail + 1 ? `${hash.slice(0, head)}…${hash.slice(-tail)}` : hash;
}
