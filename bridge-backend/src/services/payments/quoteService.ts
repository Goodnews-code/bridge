import { quoteStore } from "../../store/memoryStore.js";
import type { QuoteStore } from "../../store/types.js";
import type { Quote } from "../../types/quote.js";
import { NotFoundError, QuoteExpiredError } from "../../utils/errors.js";
import { currencyService, type ConversionInput, type CurrencyService } from "../currency/currencyService.js";

/**
 * QuoteService (spec §5). Owns quote persistence and expiry. Every currency
 * conversion is treated as a payment quote; stale quotes can never be used to
 * fund a payment.
 */
export class QuoteService {
  constructor(
    private readonly currency: CurrencyService = currencyService,
    private readonly store: QuoteStore = quoteStore,
  ) {}

  /** Create and persist a quote for the given amount + currency. */
  async createQuote(input: ConversionInput): Promise<Quote> {
    const quote = await this.currency.buildQuote(input);
    return this.store.save(quote);
  }

  async getQuote(quoteId: string): Promise<Quote> {
    const quote = await this.store.findById(quoteId);
    if (!quote) throw new NotFoundError("Quote not found.", { quoteId });
    return quote;
  }

  /** True if the quote's expiry is in the past. */
  isExpired(quote: Quote, now: Date = new Date()): boolean {
    return new Date(quote.expiresAt).getTime() <= now.getTime();
  }

  /** Fetch a quote and throw QuoteExpiredError if it is no longer valid. */
  async getLiveQuote(quoteId: string): Promise<Quote> {
    const quote = await this.getQuote(quoteId);
    if (this.isExpired(quote)) {
      throw new QuoteExpiredError("This quote has expired. Please request a new one.", {
        quoteId,
        expiresAt: quote.expiresAt,
      });
    }
    return quote;
  }
}

export const quoteService = new QuoteService();
