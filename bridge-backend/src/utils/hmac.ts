import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 signing/verification for webhook payloads.
 *
 * Providers sign the raw request body with a shared secret; we recompute the
 * signature over the exact received bytes and compare in constant time. Our
 * mock providers use the same scheme so the full verification path is
 * exercised offline.
 */

/** Compute the hex HMAC-SHA256 of `payload` using `secret`. */
export function sign(payload: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison of a provided signature against the expected one.
 * Accepts an optional `sha256=` prefix (common provider convention).
 */
export function verifySignature(
  payload: string | Buffer,
  providedSignature: string | undefined,
  secret: string,
): boolean {
  if (!providedSignature) return false;

  const normalized = providedSignature.startsWith("sha256=")
    ? providedSignature.slice("sha256=".length)
    : providedSignature;

  const expected = sign(payload, secret);

  // Both must be equal-length hex for timingSafeEqual; bail early otherwise.
  const expectedBuf = Buffer.from(expected, "hex");
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(normalized, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length || expectedBuf.length === 0) {
    return false;
  }
  return timingSafeEqual(expectedBuf, providedBuf);
}
