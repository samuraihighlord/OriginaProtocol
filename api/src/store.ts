export interface ProvenanceEntry {
  sha256: string;
  phash: string;
  modelId: string;
  mediaType: number;
  metadataUri: string;
  creator: string;
  pdaAddress: string;
  signature: string;
  timestamp: number;
  slot: number;
  /** Descriptive only, read from the file's header — never used for matching. */
  width: number | null;
  height: number | null;
  format: string;
}

/** In-memory provenance store for the MVP, keyed by lowercase hex SHA-256. Not persisted — swap for a real DB or on-chain reads in production. */
const store = new Map<string, ProvenanceEntry>();

export function getBySha256(sha256Hex: string): ProvenanceEntry | undefined {
  return store.get(sha256Hex);
}

export function has(sha256Hex: string): boolean {
  return store.has(sha256Hex);
}

export function put(entry: ProvenanceEntry): void {
  store.set(entry.sha256, entry);
}

export function all(): ProvenanceEntry[] {
  return Array.from(store.values());
}
