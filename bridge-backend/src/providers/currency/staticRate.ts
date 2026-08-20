import type { Currency } from "../../types/money.js";
import { InvalidCurrencyError } from "../../utils/errors.js";
import type { CurrencyProvider } from "./types.js";

/**
 * Offline fallback FX provider with a bundled rate table (approximate, to NGN).
 * Used when no real FX API key is configured so the backend runs fully offline
 * for the sandbox demo. Rates are intentionally static and NOT for production.
 *
 * The demo's canonical example uses USD -> NGN = 1500 to yield the ₦30,600 quote.
 */
const RATES_TO_NGN: Record<Currency, number> = {
  NGN: 1,
  USD: 1500,
  GBP: 1900,
  EUR: 1650,
  JPY: 10,
  CAD: 1100,
  AUD: 1000,
};

export class StaticRateProvider implements CurrencyProvider {
  readonly name = "static";

  async getRate(from: Currency, to: Currency): Promise<number> {
    const fromToNgn = RATES_TO_NGN[from];
    const toToNgn = RATES_TO_NGN[to];
    if (fromToNgn === undefined || toToNgn === undefined) {
      throw new InvalidCurrencyError("Unsupported currency for static rates.", {
        from,
        to,
      });
    }
    // Cross rate via NGN: (from->NGN) / (to->NGN).
    return fromToNgn / toToNgn;
  }
}
