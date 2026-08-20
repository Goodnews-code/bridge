import { env } from "../../config/env.js";
import { currencyProvider } from "../../providers/currency/index.js";
import type { CurrencyProvider } from "../../providers/currency/index.js";
import {
  SETTLEMENT_CURRENCY,
  isSupportedCurrency,
  type Currency,
} from "../../types/money.js";
import type { Quote } from "../../types/quote.js";
import { InvalidCurrencyError } from "../../utils/errors.js";
import { generateId } from "../../utils/id.js";
import { addSpread, computeSpread, convertToNaira, roundMoney } from "../../utils/money.js";

export interface ConversionInput {
  amount: number;
  currency: string;
}

/**
 * CurrencyService (spec §3, §4). Converts a merchant amount into the NGN sum a
 * user must transfer, applying Bridge's configurable spread. NGN amounts pass
 * through with no conversion. The FX rate always comes from the provider; the
 * extension never computes rates.
 */
export class CurrencyService {
  constructor(
    private readonly provider: CurrencyProvider = currencyProvider,
    private readonly spreadPercent: number = env.CURRENCY_SPREAD_PERCENT,
    private readonly quoteTtlMinutes: number = env.QUOTE_EXPIRY_MINUTES,
  ) {}

  /**
   * Build a full payment quote for the given amount + currency.
   *
   * Worked example: 20 USD @ 1500 -> base ₦30,000, 2% spread ₦600, final ₦30,600.
   *
   * The spread is an FX-conversion margin, so it applies ONLY when converting a
   * foreign currency. An NGN amount is already in the settlement currency: it
   * passes through unchanged (rate 1, no spread) — e.g. ₦5,000 -> ₦5,000.
   */
  async buildQuote(input: ConversionInput): Promise<Quote> {
    const currency = this.normalizeCurrency(input.currency);
    this.assertValidAmount(input.amount);

    const isSettlementCurrency = currency === SETTLEMENT_CURRENCY;

    const exchangeRate = isSettlementCurrency
      ? 1
      : await this.provider.getRate(currency, SETTLEMENT_CURRENCY);

    const baseNairaAmount = isSettlementCurrency
      ? roundMoney(input.amount)
      : convertToNaira(input.amount, exchangeRate);

    // No conversion → no FX spread.
    const spreadPercent = isSettlementCurrency ? 0 : this.spreadPercent;
    const spreadAmount = isSettlementCurrency
      ? 0
      : computeSpread(baseNairaAmount, this.spreadPercent);
    const finalNairaAmount = isSettlementCurrency
      ? baseNairaAmount
      : addSpread(baseNairaAmount, spreadAmount);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.quoteTtlMinutes * 60_000);

    return {
      quoteId: generateId("quote"),
      originalAmount: roundMoney(input.amount),
      originalCurrency: currency,
      exchangeRate,
      baseNairaAmount,
      spreadPercent,
      spreadAmount,
      finalNairaAmount,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private normalizeCurrency(currency: string): Currency {
    const upper = currency.trim().toUpperCase();
    if (!isSupportedCurrency(upper)) {
      throw new InvalidCurrencyError(`Unsupported currency: ${currency}.`, {
        currency,
      });
    }
    return upper;
  }

  private assertValidAmount(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new InvalidCurrencyError("Amount must be a positive number.", {
        amount,
      });
    }
  }
}

export const currencyService = new CurrencyService();
