import type { Currency } from "../../types/money.js";

/**
 * Currency provider abstraction (spec §17). Business logic depends only on this
 * interface, never on a concrete FX API, so the provider can be swapped freely.
 */
export interface CurrencyProvider {
  /** The provider's display name (for logging / quote metadata). */
  readonly name: string;
  /**
   * Return how many units of `to` equal one unit of `from`.
   * e.g. getRate("USD", "NGN") => 1500 means $1 = ₦1500.
   */
  getRate(from: Currency, to: Currency): Promise<number>;
}
