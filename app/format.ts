export function truncateMiddle(value: string, head = 8, tail = 8): string {
  if (value.length <= head + tail + 3) {
    return value;
  }
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function formatDimensions(width: number | null, height: number | null): string {
  return width && height ? `${width}×${height}` : "unknown";
}

export function formatImageFormat(format: string | null): string {
  return format && format !== "unknown" ? format.toUpperCase() : "unknown";
}
