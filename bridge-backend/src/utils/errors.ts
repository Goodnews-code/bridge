/**
 * Application error hierarchy (spec §16).
 *
 * Every AppError carries an HTTP status, a stable machine-readable `code`, and
 * a user-safe `message`. The central error handler uses these to build safe
 * responses; internal/provider details are never leaked to clients.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  /** Extra safe-to-expose context (e.g. which field failed validation). */
  readonly details?: unknown;
  /** Whether this error is expected/operational (vs a programmer bug). */
  readonly isOperational: boolean = true;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, new.target);
  }
}

export class InvalidCurrencyError extends AppError {
  readonly statusCode = 400;
  readonly code = "INVALID_CURRENCY";
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHENTICATED";
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

export class QuoteExpiredError extends AppError {
  readonly statusCode = 409;
  readonly code = "QUOTE_EXPIRED";
}

export class InvalidStateTransitionError extends AppError {
  readonly statusCode = 409;
  readonly code = "INVALID_STATE_TRANSITION";
}

export class IdempotencyConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "IDEMPOTENCY_CONFLICT";
}

export class InsufficientFundsError extends AppError {
  readonly statusCode = 402;
  readonly code = "INSUFFICIENT_FUNDS";
}

export class TransferVerificationError extends AppError {
  readonly statusCode = 400;
  readonly code = "TRANSFER_VERIFICATION_FAILED";
}

export class WebhookSignatureError extends AppError {
  readonly statusCode = 401;
  readonly code = "INVALID_WEBHOOK_SIGNATURE";
}

export class CardCreationError extends AppError {
  readonly statusCode = 502;
  readonly code = "CARD_CREATION_FAILED";
}

export class CardFundingError extends AppError {
  readonly statusCode = 502;
  readonly code = "CARD_FUNDING_FAILED";
}

export class PaymentProcessingError extends AppError {
  readonly statusCode = 502;
  readonly code = "PAYMENT_PROCESSING_FAILED";
}

export class ProviderUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = "PROVIDER_UNAVAILABLE";
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = "RATE_LIMITED";
}

/** Type guard for AppError instances. */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
