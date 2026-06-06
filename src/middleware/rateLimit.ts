import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL).unref();

export interface RateLimitOptions {
  max?: number;
  windowSeconds?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const max = options.max ?? 100;
  const windowMs = (options.windowSeconds ?? 60) * 1000;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "unknown";
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      return sendError(res, "RATE_LIMITED", "Too many requests. Please try again later.", 429);
    }

    next();
  };
}
