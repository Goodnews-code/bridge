import { env } from "../config/env.js";

/**
 * Structured JSON logger with automatic redaction of sensitive payment data.
 *
 * SECURITY (spec §9, §15): PAN, CVV, full card numbers, and secrets must never
 * appear in logs. We redact by key name and by value pattern (long digit runs
 * that look like card numbers) as a defence-in-depth measure.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = LEVEL_ORDER[env.LOG_LEVEL];

/** Object keys whose values are always redacted, matched case-insensitively. */
const SENSITIVE_KEYS = [
  "pan",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "cvv2",
  "securitycode",
  "security_code",
  "expiry",
  "expirymonth",
  "expiryyear",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "password",
  "token",
  "signature",
];

const REDACTED = "[REDACTED]";

/** Matches 13-19 digit runs (optionally space/dash separated) that look like a PAN. */
const PAN_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive.replace(/[^a-z0-9]/g, "")));
}

function redactString(value: string): string {
  return value.replace(PAN_PATTERN, REDACTED);
}

/** Recursively redact sensitive keys/values. Guards against cycles and depth. */
function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value as object)) return "[CIRCULAR]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1, seen);
  }
  return out;
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < threshold) return;

  const record: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg: message,
  };
  if (meta && Object.keys(meta).length > 0) {
    Object.assign(record, redact(meta) as Record<string, unknown>);
  }

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function makeLogger(bindings: Record<string, unknown> = {}): Logger {
  const merge = (meta?: Record<string, unknown>): Record<string, unknown> => ({
    ...bindings,
    ...(meta ?? {}),
  });
  return {
    debug: (message, meta) => write("debug", message, merge(meta)),
    info: (message, meta) => write("info", message, merge(meta)),
    warn: (message, meta) => write("warn", message, merge(meta)),
    error: (message, meta) => write("error", message, merge(meta)),
    child: (childBindings) => makeLogger({ ...bindings, ...childBindings }),
  };
}

export const logger: Logger = makeLogger();

// Exported for unit-testing the redaction logic in isolation.
export const _internal = { redact, redactString, isSensitiveKey };
