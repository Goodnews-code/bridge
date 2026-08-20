import rateLimit from "express-rate-limit";

/**
 * Rate limiting (spec §15). A general limiter protects the whole API; tighter
 * limiters guard sensitive/expensive endpoints (quote creation hits the FX
 * provider; webhooks are public). Limits are conservative defaults for the MVP.
 */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests." } },
});

export const quoteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many quote requests." } },
});

export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: { code: "RATE_LIMITED", message: "Too many webhook requests." } },
});
