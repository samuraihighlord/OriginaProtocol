/**
 * Cheap, header-only image inspection. No decoding, no dependencies — just
 * reading the handful of bytes every image format puts at a fixed offset.
 * This is display-only metadata: unlike sha256/computePhash it is trivially
 * changed (any resize/re-encode) or forged (anyone can claim any dimensions
 * or format), so it must never be used to decide whether something matches.
 */

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "unknown";

export interface ImageDimensions {
  width: number;
  height: number;
}

function matchesAt(data: Uint8Array, offset: number, needle: number[]): boolean {
  if (offset + needle.length > data.length) return false;
  for (let i = 0; i < needle.length; i++) {
    if (data[offset + i] !== needle[i]) return false;
  }
  return true;
}

function ascii(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0));
}

function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87A = ascii("GIF87a");
const GIF89A = ascii("GIF89a");
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");

/** Sniffs the format from magic bytes at the start of the file. */
export function detectImageFormat(data: Uint8Array): ImageFormat {
  if (matchesAt(data, 0, PNG_SIGNATURE)) return "png";
  if (matchesAt(data, 0, JPEG_SIGNATURE)) return "jpeg";
  if (matchesAt(data, 0, GIF87A) || matchesAt(data, 0, GIF89A)) return "gif";
  if (matchesAt(data, 0, RIFF) && matchesAt(data, 8, WEBP)) return "webp";
  return "unknown";
}

function readPngDimensions(data: Uint8Array): ImageDimensions | null {
  // IHDR is always the first chunk: 8-byte signature, 4-byte length, 4-byte
  // "IHDR" type, then width (u32 BE) and height (u32 BE).
  if (data.length < 24) return null;
  return {
    width: readUint32BE(data, 16),
    height: readUint32BE(data, 20),
  };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const STANDALONE_MARKERS = new Set([0xd8, 0xd9, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

function readJpegDimensions(data: Uint8Array): ImageDimensions | null {
  let pos = 2; // skip SOI (FF D8)
  while (pos + 4 <= data.length) {
    if (data[pos] !== 0xff) {
      pos++;
      continue;
    }
    const marker = data[pos + 1];

    if (STANDALONE_MARKERS.has(marker)) {
      pos += 2;
      continue;
    }

    const segmentLength = readUint16BE(data, pos + 2);
    if (SOF_MARKERS.has(marker)) {
      if (pos + 9 > data.length) return null;
      return {
        height: readUint16BE(data, pos + 5),
        width: readUint16BE(data, pos + 7),
      };
    }

    pos += 2 + segmentLength;
  }
  return null;
}

function readGifDimensions(data: Uint8Array): ImageDimensions | null {
  if (data.length < 10) return null;
  return {
    width: readUint16LE(data, 6),
    height: readUint16LE(data, 8),
  };
}

function readWebpDimensions(data: Uint8Array): ImageDimensions | null {
  if (data.length < 30) return null;
  const chunkFourCC = ascii("VP8X");
  const lossyFourCC = ascii("VP8 ");
  const losslessFourCC = ascii("VP8L");

  if (matchesAt(data, 12, chunkFourCC)) {
    // Extended format: flags(1) + reserved(3) + (width-1)(3 LE) + (height-1)(3 LE)
    const base = 20;
    const width = (data[base] | (data[base + 1] << 8) | (data[base + 2] << 16)) + 1;
    const height = (data[base + 3] | (data[base + 4] << 8) | (data[base + 5] << 16)) + 1;
    return { width, height };
  }

  if (matchesAt(data, 12, lossyFourCC)) {
    // Lossy: 3-byte frame tag, 3-byte start code (9d 01 2a), then 14-bit
    // width/height packed into two little-endian u16s.
    const base = 20;
    const widthCode = readUint16LE(data, base + 6);
    const heightCode = readUint16LE(data, base + 8);
    return { width: widthCode & 0x3fff, height: heightCode & 0x3fff };
  }

  if (matchesAt(data, 12, losslessFourCC)) {
    // Lossless: signature byte (0x2F) then a packed little-endian u32:
    // 14 bits width-1, 14 bits height-1, 1 bit alpha, 3 bits version.
    const base = 20;
    const packed =
      data[base + 1] | (data[base + 2] << 8) | (data[base + 3] << 16) | (data[base + 4] << 24);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

/** Reads pixel dimensions from a format's header. Returns null if the format is unrecognized or the header is truncated/malformed. */
export function readImageDimensions(data: Uint8Array): ImageDimensions | null {
  switch (detectImageFormat(data)) {
    case "png":
      return readPngDimensions(data);
    case "jpeg":
      return readJpegDimensions(data);
    case "gif":
      return readGifDimensions(data);
    case "webp":
      return readWebpDimensions(data);
    default:
      return null;
  }
}
