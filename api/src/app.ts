import { computePhash, sha256, toHex } from "@origina/sdk";
import cors from "cors";
import express, { Request, Response } from "express";
import multer from "multer";
import { mockSignature, nextMockSlot } from "./chain";
import { has, put } from "./store";
import { verifyFingerprint } from "./verify";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export function createApp(corsOrigin?: string) {
  const app = express();
  app.use(cors({ origin: corsOrigin ?? "*" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/v1/anchor", (req: Request, res: Response) => {
    const {
      sha256: sha256Hex,
      phash,
      modelId,
      mediaType,
      metadataUri,
      creator,
      pdaAddress,
      width,
      height,
      format,
    } = req.body ?? {};

    if (!sha256Hex || !phash || !modelId || mediaType === undefined || !creator || !pdaAddress) {
      res.status(400).json({
        error: "sha256, phash, modelId, mediaType, creator, and pdaAddress are required",
      });
      return;
    }

    if (has(sha256Hex)) {
      res.status(409).json({ error: "a provenance record already exists for this sha256 hash" });
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const slot = nextMockSlot();
    const signature = mockSignature();

    put({
      sha256: sha256Hex,
      phash: String(phash),
      modelId,
      mediaType: Number(mediaType),
      metadataUri: metadataUri ?? "",
      creator,
      pdaAddress,
      signature,
      timestamp,
      slot,
      width: typeof width === "number" ? width : null,
      height: typeof height === "number" ? height : null,
      format: typeof format === "string" ? format : "unknown",
    });

    res.status(201).json({ signature, pdaAddress, timestamp, slot });
  });

  app.get("/v1/verify", (req: Request, res: Response) => {
    const hash = typeof req.query.hash === "string" ? req.query.hash : undefined;
    const phash = typeof req.query.phash === "string" ? req.query.phash : undefined;

    if (!hash) {
      res.status(400).json({ error: "hash query parameter is required" });
      return;
    }

    res.json(verifyFingerprint(hash, phash));
  });

  app.post("/v1/verify/file", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required (multipart field name: 'file')" });
      return;
    }

    // Hashed in memory and discarded immediately — the media buffer is
    // never persisted or forwarded anywhere.
    const bytes = new Uint8Array(req.file.buffer);
    const hashBytes = await sha256(bytes);
    const phash = computePhash(bytes);

    res.json(verifyFingerprint(toHex(hashBytes), phash.toString()));
  });

  return app;
}
