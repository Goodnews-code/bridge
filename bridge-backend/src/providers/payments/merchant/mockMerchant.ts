import { cardProvider } from "../../cards/index.js";
import { logger } from "../../../utils/logger.js";
import { generateId } from "../../../utils/id.js";
import type { Currency } from "../../../types/money.js";
import type {
  MerchantAuthorizationInput,
  MerchantAuthorizationResult,
  MerchantPaymentAdapter,
} from "./types.js";

/**
 * Sandbox merchant adapter (spec §10, Option A/C). Simulates presenting the
 * Bridge virtual card at a merchant checkout and receiving an authorization.
 *
 * When the configured card provider supports a direct spend authorization
 * (our mock does, via `authorizeSpend`), we debit the card so balances stay
 * consistent. Otherwise we approve based on the funded amount. A real build
 * would receive the authorization asynchronously via the card-provider webhook.
 */
interface SpendAuthorizer {
  authorizeSpend(cardReference: string, amount: number, currency: Currency): boolean;
}

function hasSpendAuthorizer(value: unknown): value is SpendAuthorizer {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SpendAuthorizer).authorizeSpend === "function"
  );
}

export class MockMerchantAdapter implements MerchantPaymentAdapter {
  readonly name = "mock";

  async authorize(
    input: MerchantAuthorizationInput,
  ): Promise<MerchantAuthorizationResult> {
    const debited = hasSpendAuthorizer(cardProvider)
      ? cardProvider.authorizeSpend(input.cardReference, input.amount, input.currency)
      : true;

    if (!debited) {
      logger.warn("Merchant authorization declined", {
        transactionId: input.transactionId,
        cardReference: input.cardReference,
        merchantName: input.merchantName,
      });
      return { authorized: false, declineReason: "insufficient_card_balance" };
    }

    const authorizationId = generateId("auth");
    logger.info("Merchant authorization approved", {
      transactionId: input.transactionId,
      cardReference: input.cardReference,
      merchantName: input.merchantName,
      authorizationId,
      amount: input.amount,
      currency: input.currency,
    });
    return { authorized: true, authorizationId };
  }
}
