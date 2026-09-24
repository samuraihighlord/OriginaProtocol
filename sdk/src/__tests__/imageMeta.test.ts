import { detectImageFormat, readImageDimensions } from "../imageMeta";

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

function ascii(text: string): number[] {
  return Array.from(text).map((c) => c.charCodeAt(0));
}

describe("detectImageFormat", () => {
  it("detects png", () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(detectImageFormat(png)).toBe("png");
  });

  it("detects jpeg", () => {
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
  });

  it("detects gif", () => {
    expect(detectImageFormat(new Uint8Array(ascii("GIF89a")))).toBe("gif");
  });

  it("detects webp", () => {
    const webp = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]);
    expect(detectImageFormat(webp)).toBe("webp");
  });

  it("returns unknown for unrecognized bytes", () => {
    expect(detectImageFormat(bytes(1, 2, 3, 4, 5))).toBe("unknown");
  });
});

describe("readImageDimensions", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    const data = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
      0x00, 0x00, 0x00, 0x0d, // chunk length (13)
      ...ascii("IHDR"),
      0x00, 0x00, 0x00, 0x64, // width = 100
      0x00, 0x00, 0x00, 0xc8, // height = 200
    ]);
    expect(readImageDimensions(data)).toEqual({ width: 100, height: 200 });
  });

  it("reads JPEG width/height from the SOF0 marker", () => {
    const data = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xc0, // SOF0
      0x00, 0x11, // segment length
      0x08, // precision
      0x00, 0xc8, // height = 200
      0x00, 0x64, // width = 100
    ]);
    expect(readImageDimensions(data)).toEqual({ width: 100, height: 200 });
  });

  it("reads GIF width/height from the logical screen descriptor", () => {
    const data = new Uint8Array([...ascii("GIF89a"), 0x40, 0x01, 0xf0, 0x00]); // 320x240
    expect(readImageDimensions(data)).toEqual({ width: 320, height: 240 });
  });

  it("reads lossy WEBP width/height from the VP8 keyframe header", () => {
    const data = new Uint8Array([
      ...ascii("RIFF"),
      0, 0, 0, 0,
      ...ascii("WEBP"),
      ...ascii("VP8 "),
      0, 0, 0, 0, // chunk size (unused by the parser)
      0, 0, 0, // frame tag (unused)
      0x9d, 0x01, 0x2a, // start code
      0x90, 0x01, // width = 400 (LE)
      0x2c, 0x01, // height = 300 (LE)
    ]);
    expect(readImageDimensions(data)).toEqual({ width: 400, height: 300 });
  });

  it("returns null for unrecognized formats", () => {
    expect(readImageDimensions(bytes(1, 2, 3, 4, 5))).toBeNull();
  });
});
