/**
 * Currency codes Paron understands. NGN is the settlement currency; everything
 * else is a "foreign" currency that must be converted to NGN.
 */
export const SUPPORTED_CURRENCIES = [
  "NGN",
  "USD",
  "GBP",
  "EUR",
  "JPY",
  "CAD",
  "AUD",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const SETTLEMENT_CURRENCY: Currency = "NGN";

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** A simple amount + currency pair. Amounts are major units (e.g. 20.00 USD). */
export interface Money {
  amount: number;
  currency: Currency;
}
