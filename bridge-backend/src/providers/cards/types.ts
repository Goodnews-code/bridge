import type { Currency } from "../../types/money.js";

/**
 * Virtual card provider abstraction (spec §8, §17).
 *
 * SECURITY: this interface deliberately never exposes raw PAN/CVV to the rest
 * of the app. A concrete provider may return a one-time `secureRef` (an opaque
 * token/URL the extension can exchange with the provider directly), but Paron's
 * backend stores and logs only `cardReference` and non-sensitive metadata.
 */

export type CardStatus = "active" | "frozen" | "closed";

export interface CreateCardInput {
  /** Our transaction id, for provider-side correlation. */
  transactionId: string;
  currency: Currency;
  /** Hard spend limit for the card, in major units. */
  spendLimit: number;
  /** Prefer a single-use card when the provider supports it. */
  singleUse?: boolean;
  /** Optional merchant lock (name/category) where supported. */
  merchantName?: string;
}

export interface FundCardInput {
  cardReference: string;
  amount: number;
  currency: Currency;
}

/**
 * Non-sensitive representation of an issued card. `last4` and `expMonth/expYear`
 * are safe to surface; PAN/CVV are never included.
 */
export interface VirtualCard {
  cardReference: string;
  status: CardStatus;
  currency: Currency;
  spendLimit: number;
  balance: number;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  singleUse: boolean;
  /**
   * Optional opaque, short-lived reference the client can exchange directly
   * with the provider to retrieve full card details out-of-band. Never a PAN.
   */
  secureRef?: string;
}

export interface FundingResult {
  cardReference: string;
  fundedAmount: number;
  balance: number;
  currency: Currency;
}

export interface CardProvider {
  readonly name: string;
  createVirtualCard(input: CreateCardInput): Promise<VirtualCard>;
  fundCard(input: FundCardInput): Promise<FundingResult>;
  getCard(cardReference: string): Promise<VirtualCard>;
  freezeCard(cardReference: string): Promise<void>;
  closeCard(cardReference: string): Promise<void>;
}
