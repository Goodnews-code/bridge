import cors, { type CorsOptions } from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import type { RawBodyRequest } from "./types/http.js";

/** Max accepted JSON body. Webhooks and quotes are tiny; this bounds abuse. */
const JSON_BODY_LIMIT = "256kb";

/**
 * Build a CORS origin matcher from ALLOWED_ORIGINS. Supports:
 *   - "*"                       → allow any origin
 *   - exact origins             → "http://localhost:3000"
 *   - a single "*" wildcard     → "chrome-extension://*"
 * Requests with no Origin header (curl, server-to-server, webhooks) are allowed.
 */
function buildCorsOptions(): CorsOptions {
  const allowed = env.ALLOWED_ORIGINS;
  const allowAll = allowed.includes("*");

  const matchers = allowed
    .filter((pattern) => pattern !== "*")
    .map((pattern) => {
      if (pattern.includes("*")) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
        return new RegExp(`^${escaped}$`);
      }
      return pattern;
    });

  return {
    origin(origin, callback) {
      if (allowAll || !origin) {
        callback(null, true);
        return;
      }
      const ok = matchers.some((matcher) =>
        typeof matcher === "string" ? matcher === origin : matcher.test(origin),
      );
      callback(ok ? null : new Error("Origin not allowed by CORS"), ok);
    },
    allowedHeaders: [
      "Content-Type",
      "x-api-key",
      "x-request-id",
      "idempotency-key",
      "x-paron-signature",
      "x-webhook-signature",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  };
}

/**
 * Construct the Express application: security headers, CORS, JSON parsing with
 * raw-body capture (for webhook HMAC), request-id, the API routes, then the
 * 404 and centralized error handlers last (spec §14, §15, §16).
 */
export function createApp(): Express {
  const app = express();

  // Behind a proxy/load balancer in production; lets rate-limit read real IPs.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(helmet());
  app.use(cors(buildCorsOptions()));

  // Capture the exact raw bytes so webhook signatures verify against them.
  app.use(
    express.json({
      limit: JSON_BODY_LIMIT,
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      },
    }),
  );

  app.use(generalLimiter);

  app.use(apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
