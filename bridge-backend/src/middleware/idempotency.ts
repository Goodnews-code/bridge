import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "../types/http.js";
import { TtlCache } from "../utils/ttlCache.js";

/**
 * Idempotency middleware (spec §15). When a client sends an `Idempotency-Key`
 * header on a POST, the first response is cached and replayed for any repeat
 * with the same key — so a retried create can't produce duplicate resources.
 *
 * MVP scope: in-memory, keyed by method+path+key. Redis would back this in prod.
 */
interface StoredResponse {
  statusCode: number;
  body: unknown;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new TtlCache<StoredResponse>(IDEMPOTENCY_TTL_MS);

export function idempotency(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const key = req.header("idempotency-key");
  if (!key) {
    next();
    return;
  }

  const cacheKey = `${req.method}:${req.path}:${key}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.setHeader("idempotent-replayed", "true");
    res.status(cached.statusCode).json(cached.body);
    return;
  }

  // Capture the first response body so it can be replayed on retry.
  const originalJson = res.json.bind(res);
  res.json = (body: unknown): Response => {
    // Only memoize successful responses; errors should be retryable.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(cacheKey, { statusCode: res.statusCode, body });
    }
    return originalJson(body);
  };

  next();
}
