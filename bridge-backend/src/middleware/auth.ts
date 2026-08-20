import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Response } from "express";
import { env } from "../config/env.js";
import type { AuthedRequest } from "../types/http.js";
import { AuthenticationError } from "../utils/errors.js";

/**
 * API-key authentication (spec §15, §19). The Chrome Extension sends the shared
 * secret in the `x-api-key` header. We compare in constant time and attach a
 * stubbed auth context. Real user accounts/JWT would replace this later.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function authenticate(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const provided = req.header("x-api-key");
  if (!provided || !safeEqual(provided, env.API_KEY)) {
    throw new AuthenticationError("Missing or invalid API key.");
  }

  // Stubbed principal. With real accounts this would resolve a user from a token.
  req.auth = { userId: "user_default", apiKeyName: "extension" };
  next();
}
