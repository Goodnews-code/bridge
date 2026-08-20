import type { SimplifiedStatus, TransactionStatus } from "../../types/transaction.js";
import { InvalidStateTransitionError } from "../../utils/errors.js";

/**
 * Transaction state machine (spec §11). `ALLOWED_TRANSITIONS` is the single
 * source of truth for which status changes are legal; invalid transitions throw.
 */
const ALLOWED_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  CREATED: ["QUOTE_CREATED", "QUOTE_EXPIRED"],
  QUOTE_CREATED: ["AWAITING_TRANSFER", "QUOTE_EXPIRED"],
  AWAITING_TRANSFER: ["TRANSFER_CONFIRMED", "TRANSFER_FAILED", "QUOTE_EXPIRED"],
  TRANSFER_CONFIRMED: ["CARD_CREATING"],
  // Card creation and funding both occur during the CARD_CREATING phase, so
  // both failure modes are reachable from it.
  CARD_CREATING: ["CARD_FUNDED", "CARD_CREATION_FAILED", "CARD_FUNDING_FAILED"],
  CARD_FUNDED: ["PAYMENT_PROCESSING"],
  PAYMENT_PROCESSING: ["PAYMENT_SUCCESSFUL", "PAYMENT_FAILED"],
  PAYMENT_SUCCESSFUL: [],
  // Failure / terminal states
  QUOTE_EXPIRED: [],
  TRANSFER_FAILED: ["REFUND_PENDING"],
  CARD_CREATION_FAILED: ["REFUND_PENDING"],
  CARD_FUNDING_FAILED: ["REFUND_PENDING"],
  PAYMENT_FAILED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

/** Statuses from which no further transition is possible. */
export function isTerminal(status: TransactionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function canTransition(
  from: TransactionStatus,
  to: TransactionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Throw InvalidStateTransitionError unless `from -> to` is allowed. */
export function assertTransition(
  from: TransactionStatus,
  to: TransactionStatus,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(
      `Illegal transaction transition: ${from} -> ${to}.`,
      { from, to },
    );
  }
}

/** Map the internal status to the extension-facing simplified status. */
export function toSimplifiedStatus(status: TransactionStatus): SimplifiedStatus {
  switch (status) {
    case "CREATED":
    case "QUOTE_CREATED":
    case "AWAITING_TRANSFER":
      return "pending";
    case "TRANSFER_CONFIRMED":
    case "CARD_CREATING":
    case "CARD_FUNDED":
    case "PAYMENT_PROCESSING":
      return "processing";
    case "PAYMENT_SUCCESSFUL":
      return "successful";
    case "QUOTE_EXPIRED":
    case "TRANSFER_FAILED":
    case "CARD_CREATION_FAILED":
    case "CARD_FUNDING_FAILED":
    case "PAYMENT_FAILED":
    case "REFUND_PENDING":
    case "REFUNDED":
      return "failed";
  }
}
