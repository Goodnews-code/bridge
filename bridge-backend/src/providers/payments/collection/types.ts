import type { Currency } from "../../../types/money.js";

/**
 * NGN collection / payment provider abstraction (spec §6, §7, §17).
 *
 * Responsible for giving the user somewhere to transfer NGN and for verifying
 * the resulting inbound-transfer webhook. Concrete providers (Paystack,
 * Monnify, Flutterwave, ...) sit behind this interface.
 */

/** Bank-transfer instructions shown to the user. */
export interface CollectionInstructions {
  accountName: string;
  accountNumber: string;
  bank: string;
  /** Reference the user must include so the webhook can be matched to a tx. */
  reference: string;
  amount: number;
  currency: Currency;
  /** True while these are sandbox/demo details, not a real bank account. */
  sandbox: boolean;
}

export interface CreateCollectionAccountInput {
  transactionId: string;
  reference: string;
  amount: number;
  currency: Currency;
}

/** A normalized inbound-transfer event parsed from a provider webhook. */
export interface InboundTransferEvent {
  /** Provider-side unique event id, used for idempotent processing. */
  eventId: string;
  /** Provider-side transaction id for the transfer. */
  providerTransactionId: string;
  /** The reference the payer quoted (matches Transaction.transferReference). */
  reference: string;
  amount: number;
  currency: Currency;
  status: "success" | "failed" | "pending";
}

export interface CollectionProvider {
  readonly name: string;

  /** Generate transfer instructions (a virtual account) for a transaction. */
  createInstructions(input: CreateCollectionAccountInput): Promise<CollectionInstructions>;

  /** Verify a webhook signature against the raw request body. */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;

  /** Parse + validate a raw webhook body into a normalized event. */
  parseEvent(rawBody: Buffer): InboundTransferEvent;

  /**
   * Sign a payload the way this provider would (used only by the dev transfer
   * simulator so the real verification path is exercised offline).
   */
  signPayload(payload: string): string;
}
