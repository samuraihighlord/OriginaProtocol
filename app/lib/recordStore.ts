import type { StoredRecord } from "./provenance";

/**
 * In-memory record store for this browser session, keyed by the file's SHA-256 hex. The value is the full record
 * including the optional fields (c2pa_manifest_hash, creator) that the UI does not display. Not persisted.
 */
const records = new Map<string, StoredRecord>();

export const recordStore = {
  set: (record: StoredRecord) => void records.set(record.file_hash, record),
  get: (fileHash: string): StoredRecord | undefined => records.get(fileHash),
  has: (fileHash: string) => records.has(fileHash),
  all: (): ReadonlyMap<string, StoredRecord> => records,
};
