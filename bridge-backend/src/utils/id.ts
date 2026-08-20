import { randomUUID, randomBytes } from "node:crypto";

/**
 * Generate a prefixed, URL-safe identifier, e.g. `quote_a1b2c3...`.
 * Uses a UUID (hyphens stripped) for uniqueness.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Short human-friendly reference (uppercase alphanumeric) for bank transfers.
 * Users type/paste this, so keep it short and unambiguous.
 */
export function generateReference(prefix = "BRIDGE"): string {
  const raw = randomBytes(6).toString("hex").toUpperCase();
  return `${prefix}-${raw}`;
}
