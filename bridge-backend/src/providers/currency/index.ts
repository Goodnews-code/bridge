import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { ExchangeRateApiProvider } from "./exchangeRateApi.js";
import { StaticRateProvider } from "./staticRate.js";
import type { CurrencyProvider } from "./types.js";

/**
 * Select the FX provider from configuration. Falls back to the static provider
 * when the real provider is chosen but no API key is present, so the service
 * degrades gracefully instead of failing to boot.
 */
function createCurrencyProvider(): CurrencyProvider {
  if (env.CURRENCY_PROVIDER === "exchangerate-api" && env.CURRENCY_PROVIDER_API_KEY) {
    logger.info("Using live FX provider", { provider: "exchangerate-api" });
    return new ExchangeRateApiProvider(env.CURRENCY_PROVIDER_API_KEY);
  }
  logger.info("Using static FX provider (offline rate table)", { provider: "static" });
  return new StaticRateProvider();
}

export const currencyProvider: CurrencyProvider = createCurrencyProvider();

export type { CurrencyProvider } from "./types.js";
