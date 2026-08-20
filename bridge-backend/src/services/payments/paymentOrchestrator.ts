import { merchantAdapter } from "../../providers/payments/merchant/index.js";
import type { MerchantPaymentAdapter } from "../../providers/payments/merchant/index.js";
import type { Transaction } from "../../types/transaction.js";
import {
  CardCreationError,
  CardFundingError,
  PaymentProcessingError,
} from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { cardService, type CardService } from "../cards/cardService.js";
import { transactionService, type TransactionService } from "../transactions/transactionService.js";

/**
 * PaymentOrchestrator drives the post-confirmation pipeline (spec §9, §10):
 *
 *   TRANSFER_CONFIRMED -> CARD_CREATING -> CARD_FUNDED ->
 *   PAYMENT_PROCESSING -> PAYMENT_SUCCESSFUL
 *
 * Each step maps failures onto the correct terminal state. It reads/writes only
 * via TransactionService, and is invoked by TransferService once an inbound
 * transfer is verified. Depends inward on services/providers — nothing imports
 * it except the caller that triggers it.
 */
export class PaymentOrchestrator {
  constructor(
    private readonly transactions: TransactionService = transactionService,
    private readonly cards: CardService = cardService,
    private readonly merchant: MerchantPaymentAdapter = merchantAdapter,
  ) {}

  /**
   * Run the full pipeline for a transaction that has just reached
   * TRANSFER_CONFIRMED. Errors are caught and recorded as failure states; the
   * method resolves rather than throwing so webhook handlers stay simple.
   */
  async runAfterTransferConfirmed(transactionId: string): Promise<Transaction> {
    const log = logger.child({ transactionId });

    // 1. Create the restricted virtual card.
    let tx: Transaction;
    try {
      tx = await this.transactions.transition(transactionId, "CARD_CREATING");
      const card = await this.cards.createRestrictedCard(tx);
      tx = await this.transactions.patch(transactionId, {
        cardReference: card.cardReference,
      });
      log.info("Card created for transaction", { cardReference: card.cardReference });

      // 2. Fund the card with the exact NGN amount.
      await this.cards.fundCard(card.cardReference, tx.amountToTransferNGN);
      tx = await this.transactions.transition(transactionId, "CARD_FUNDED");
    } catch (error) {
      return this.fail(transactionId, error, log);
    }

    // 3. Authorize the card at the merchant.
    try {
      tx = await this.transactions.transition(transactionId, "PAYMENT_PROCESSING");
      const cardReference = tx.cardReference;
      if (!cardReference) {
        throw new PaymentProcessingError("Transaction has no card to charge.");
      }

      const result = await this.merchant.authorize({
        transactionId: tx.id,
        cardReference,
        amount: tx.amountToTransferNGN,
        currency: "NGN",
        merchantName: tx.merchantName,
      });

      if (!result.authorized) {
        return this.transactions.transition(
          transactionId,
          "PAYMENT_FAILED",
          {},
          result.declineReason ?? "merchant_declined",
        );
      }

      const successPatch = result.authorizationId
        ? { merchantAuthorizationId: result.authorizationId }
        : {};
      tx = await this.transactions.transition(
        transactionId,
        "PAYMENT_SUCCESSFUL",
        successPatch,
      );
      log.info("Payment successful", {
        ...(result.authorizationId !== undefined && {
          authorizationId: result.authorizationId,
        }),
      });
      return tx;
    } catch (error) {
      return this.fail(transactionId, error, log);
    }
  }

  /** Map a thrown error onto the correct failure state for the current step. */
  private async fail(
    transactionId: string,
    error: unknown,
    log: typeof logger,
  ): Promise<Transaction> {
    const current = await this.transactions.getById(transactionId);
    let failureState: Transaction["status"];
    // Prefer the specific error type: card creation and funding both fail while
    // the status is still CARD_CREATING, so status alone can't disambiguate.
    if (error instanceof CardFundingError) {
      failureState = "CARD_FUNDING_FAILED";
    } else if (error instanceof CardCreationError) {
      failureState = "CARD_CREATION_FAILED";
    } else if (current.status === "CARD_CREATING") {
      failureState = "CARD_CREATION_FAILED";
    } else {
      failureState = "PAYMENT_FAILED";
    }

    const reason = error instanceof Error ? error.message : "unknown error";
    log.error("Payment pipeline failed", { failureState, reason });
    return this.transactions.transition(transactionId, failureState, {}, reason);
  }
}

export const paymentOrchestrator = new PaymentOrchestrator();
