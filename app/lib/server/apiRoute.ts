import type { NextApiRequest, NextApiResponse } from "next";
import { AnchorApiError } from "./errors";

const clientIp = (req: NextApiRequest) =>
  (typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0].trim() : "") ||
  req.socket.remoteAddress ||
  "unknown";

/** Shared plumbing for the anchor routes: one method, JSON errors, no secrets or stack traces in responses. */
function jsonRoute<T>(method: "GET" | "POST", handler: (body: unknown, ip: string) => Promise<T>) {
  return async function route(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== method) {
      res.setHeader("Allow", method);
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      return res.status(200).json(await handler(req.body, clientIp(req)));
    } catch (err) {
      if (err instanceof AnchorApiError) {
        if (err.retryAfterSeconds) res.setHeader("Retry-After", String(err.retryAfterSeconds));
        return res.status(err.status).json({ error: err.message });
      }
      console.error("Unexpected error in anchor route:", err);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

export const postJsonRoute = <T>(handler: (body: unknown, ip: string) => Promise<T>) => jsonRoute("POST", handler);
export const getJsonRoute = <T>(handler: (ip: string) => Promise<T>) => jsonRoute("GET", (_body, ip) => handler(ip));
