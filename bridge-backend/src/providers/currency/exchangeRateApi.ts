import type { Currency } from "../../types/money.js";
import { ProviderUnavailableError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import type { CurrencyProvider } from "./types.js";

/**
 * Real-time FX via exchangerate-api.com (v6 "pair" endpoint).
 *
 *   GET https://v6.exchangerate-api.com/v6/{API_KEY}/pair/{FROM}/{TO}
 *   -> { result: "success", conversion_rate: number, ... }
 *
 * The API key stays server-side (spec §3). Network/parse failures raise
 * ProviderUnavailableError so the CurrencyService can decide how to react.
 */
interface PairResponse {
  result: string;
  "error-type"?: string;
  conversion_rate?: number;
}

export class ExchangeRateApiProvider implements CurrencyProvider {
  readonly name = "exchangerate-api";
  private readonly baseUrl = "https://v6.exchangerate-api.com/v6";

  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = 5000,
  ) {}

  async getRate(from: Currency, to: Currency): Promise<number> {
    const url = `${this.baseUrl}/${this.apiKey}/pair/${from}/${to}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new ProviderUnavailableError(
          "The exchange-rate service is temporarily unavailable.",
          { status: response.status },
        );
      }

      const body = (await response.json()) as PairResponse;
      if (body.result !== "success" || typeof body.conversion_rate !== "number") {
        // Log the provider's error type internally; do not leak it to clients.
        logger.error("FX provider returned an error", {
          provider: this.name,
          errorType: body["error-type"],
          from,
          to,
        });
        throw new ProviderUnavailableError(
          "Could not retrieve a live exchange rate. Please try again shortly.",
        );
      }

      return body.conversion_rate;
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      const reason = error instanceof Error ? error.name : "unknown";
      logger.error("FX provider request failed", { provider: this.name, reason });
      throw new ProviderUnavailableError(
        "Could not reach the exchange-rate service. Please try again shortly.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
