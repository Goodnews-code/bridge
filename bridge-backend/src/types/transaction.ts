import type { Currency } from "./money.js";

/**
 * The Bridge transaction state machine (see services/transactions/stateMachine.ts).
 *
 * Happy path:
 *   CREATED -> QUOTE_CREATED -> AWAITING_TRANSFER -> TRANSFER_CONFIRMED ->
 *   CARD_CREATING -> CARD_FUNDED -> PAYMENT_PROCESSING -> PAYMENT_SUCCESSFUL
 */
export const TRANSACTION_STATUSES = [
  "CREATED",
  "QUOTE_CREATED",
  "AWAITING_TRANSFER",
  "TRANSFER_CONFIRMED",
  "CARD_CREATING",
  "CARD_FUNDED",
  "PAYMENT_PROCESSING",
  "PAYMENT_SUCCESSFUL",
  // Failure / terminal states
  "QUOTE_EXPIRED",
  "TRANSFER_FAILED",
  "CARD_CREATION_FAILED",
  "CARD_FUNDING_FAILED",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Simplified status surfaced to the Chrome Extension, matching its existing
 * `PaymentStatus` union (pending | processing | successful | failed).
 */
export type SimplifiedStatus = "pending" | "processing" | "successful" | "failed";

/** An entry in the transaction's audit trail. */
export interface TransactionEvent {
  at: string;
  from: TransactionStatus | null;
  to: TransactionStatus;
  reason?: string;
}

/**
 * The core transaction record (spec §12). Deliberately holds NO sensitive card
 * data — only provider token references.
 */
export interface Transaction {
  id: string;
  userId: string;
  quoteId: string;

  merchantName: string;
  merchantAmount: number;
  merchantCurrency: Currency;
  sourceUrl?: string;

  exchangeRate: number;
  spreadPercent: number;
  amountToTransferNGN: number;

  /** NGN collection/payment provider name (e.g. "mock"). */
  provider: string;
  /** Provider-side reference for the inbound transfer, once known. */
  providerTransactionId?: string;
  /** Reference the user must use for the transfer (matched in the webhook). */
  transferReference: string;

  /** Card issuing provider name (e.g. "mock"). */
  cardProvider: string;
  /** Opaque provider reference for the issued card. Never a PAN. */
  cardReference?: string;
  /** Merchant/acquirer authorization reference once the card is charged. */
  merchantAuthorizationId?: string;

  status: TransactionStatus;
  events: TransactionEvent[];

  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
