import type { Request } from "express";

/**
 * Express request augmented with the raw body buffer, captured by the
 * `express.json({ verify })` hook so webhook HMAC signatures can be checked
 * against the exact received bytes.
 */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/** The authenticated principal attached by the auth middleware. */
export interface AuthContext {
  userId: string;
  apiKeyName: string;
}

/** Request carrying an authenticated context + request id. */
export interface AuthedRequest extends RawBodyRequest {
  auth?: AuthContext;
  requestId?: string;
}

/** Standard success envelope returned by the API. */
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

/** Standard error envelope returned by the API. */
export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
