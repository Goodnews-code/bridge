import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";
import type { ApiError, AuthedRequest } from "../types/http.js";
import { isAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

/**
 * Centralized error handler (spec §16). Maps AppError instances to their status
 * + safe message; anything else becomes a generic 500 so internal/provider
 * details are never leaked. Full detail is logged server-side.
 *
 * Note: in Express 5 an error handler MUST keep all four params to be treated
 * as an error middleware, even if `next` is unused.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as AuthedRequest).requestId;

  if (isAppError(err)) {
    if (err.statusCode >= 500) {
      logger.error("Application error", {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details,
      });
    } else {
      logger.warn("Request rejected", {
        code: err.code,
        message: err.message,
        requestId,
      });
    }

    const payload: ApiError = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  // Unknown/unexpected error: log everything, expose nothing.
  logger.error("Unhandled error", {
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const payload: ApiError = {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again later.",
      ...(!isProduction && err instanceof Error && { details: err.message }),
    },
  };
  res.status(500).json(payload);
}
