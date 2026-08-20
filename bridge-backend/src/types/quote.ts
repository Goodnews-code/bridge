import type { Currency } from "./money.js";

/**
 * A payment quote: the result of converting a merchant amount into the NGN sum
 * the user must transfer, including Bridge's exchange-rate spread. Quotes expire
 * so a stale FX rate can never be used to fund a payment.
 */
export interface Quote {
  quoteId: string;
  originalAmount: number;
  originalCurrency: Currency;
  /** FX rate used: 1 unit of originalCurrency = exchangeRate NGN. 1 for NGN. */
  exchangeRate: number;
  /** originalAmount * exchangeRate, rounded to 2dp. */
  baseNairaAmount: number;
  spreadPercent: number;
  /** baseNairaAmount * spreadPercent / 100, rounded to 2dp. */
  spreadAmount: number;
  /** baseNairaAmount + spreadAmount — the amount the user transfers. */
  finalNairaAmount: number;
  createdAt: string;
  expiresAt: string;
}
