import { collectionProvider } from "../../providers/payments/collection/index.js";
import type {
  CollectionProvider,
  InboundTransferEvent,
} from "../../providers/payments/collection/index.js";
import type { Transaction } from "../../types/transaction.js";
import { TransferVerificationError, WebhookSignatureError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { TtlCache } from "../../utils/ttlCache.js";
import { paymentOrchestrator, type PaymentOrchestrator } from "../payments/paymentOrchestrator.js";
import { transactionService, type TransactionService } from "../transactions/transactionService.js";

/** Small tolerance (NGN) for float comparison of transferred vs expected. */
const AMOUNT_TOLERANCE = 0.01;
/** How long processed webhook event ids are remembered for de-duplication. */
const EVENT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

export interface WebhookResult {
  handled: boolean;
  transactionId?: string;
  status?: Transaction["status"];
  /** Why a webhook was accepted-but-ignored (e.g. duplicate). */
  note?: string;
}

/**
 * TransferService (spec §7) verifies inbound-transfer webhooks and, on a
 * confirmed transfer, triggers the payment orchestrator. It is idempotent:
 * replaying the same webhook event is a safe no-op.
 */
export class TransferService {
  private readonly processedEvents = new TtlCache<string>(EVENT_DEDUPE_TTL_MS);

  constructor(
    private readonly provider: CollectionProvider = collectionProvider,
    private readonly transactions: TransactionService = transactionService,
    private readonly orchestrator: PaymentOrchestrator = paymentOrchestrator,
  ) {}

  /**
   * Verify and process a raw payment-provider webhook. Signature failure throws
   * WebhookSignatureError (401); everything else returns a result describing
   * what happened.
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<WebhookResult> {
    if (!this.provider.verifySignature(rawBody, signature)) {
      throw new WebhookSignatureError("Invalid webhook signature.");
    }

    const event = this.provider.parseEvent(rawBody);

    // Idempotency: ignore an event we've already fully processed.
    if (this.processedEvents.has(event.eventId)) {
      logger.info("Duplicate transfer webhook ignored", { eventId: event.eventId });
      return { handled: false, note: "duplicate_event" };
    }

    const result = await this.process(event);

    // Only remember terminal outcomes so a "pending" event can be retried.
    if (result.handled || result.note === "already_confirmed") {
      this.processedEvents.set(event.eventId, event.reference);
    }
    return result;
  }

  private async process(event: InboundTransferEvent): Promise<WebhookResult> {
    const tx = await this.transactions.findByTransferReference(event.reference);
    if (!tx) {
      // Unknown reference: accept (200) so the provider stops retrying, but note it.
      logger.warn("Transfer webhook for unknown reference", {
        reference: event.reference,
        eventId: event.eventId,
      });
      return { handled: false, note: "unknown_reference" };
    }

    const log = logger.child({ transactionId: tx.id, eventId: event.eventId });

    // Idempotency at the state level: if already confirmed/processing, no-op.
    if (tx.status !== "AWAITING_TRANSFER") {
      log.info("Transfer webhook for a transaction not awaiting transfer", {
        status: tx.status,
      });
      return {
        handled: false,
        transactionId: tx.id,
        status: tx.status,
        note: "already_confirmed",
      };
    }

    if (event.status === "failed") {
      const failed = await this.transactions.transition(
        tx.id,
        "TRANSFER_FAILED",
        { providerTransactionId: event.providerTransactionId },
        "provider_reported_failure",
      );
      return { handled: true, transactionId: tx.id, status: failed.status };
    }

    if (event.status !== "success") {
      // Pending/other: acknowledge but take no state action yet.
      return { handled: false, transactionId: tx.id, status: tx.status, note: "pending" };
    }

    // Confirm amount + currency match the expected transfer.
    this.assertMatchingPayment(tx, event);

    const confirmed = await this.transactions.transition(
      tx.id,
      "TRANSFER_CONFIRMED",
      { providerTransactionId: event.providerTransactionId },
      "transfer_verified",
    );
    log.info("Transfer confirmed", {
      amount: event.amount,
      currency: event.currency,
    });

    // Kick off the post-confirmation pipeline. Await so the webhook response
    // reflects the resulting state; the pipeline handles its own failures.
    const finalTx = await this.orchestrator.runAfterTransferConfirmed(tx.id);
    return { handled: true, transactionId: tx.id, status: finalTx.status };
  }

  private assertMatchingPayment(tx: Transaction, event: InboundTransferEvent): void {
    if (event.currency !== "NGN") {
      throw new TransferVerificationError("Transfer currency must be NGN.", {
        expected: "NGN",
        received: event.currency,
      });
    }
    if (Math.abs(event.amount - tx.amountToTransferNGN) > AMOUNT_TOLERANCE) {
      throw new TransferVerificationError("Transferred amount does not match the quote.", {
        expected: tx.amountToTransferNGN,
        received: event.amount,
      });
    }
  }
}

export const transferService = new TransferService();
