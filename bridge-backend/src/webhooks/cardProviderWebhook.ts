import { z } from "zod";
import { env } from "../config/env.js";
import { transactionService } from "../services/transactions/transactionService.js";
import type { Transaction } from "../types/transaction.js";
import { TransferVerificationError, WebhookSignatureError } from "../utils/errors.js";
import { verifySignature } from "../utils/hmac.js";
import { logger } from "../utils/logger.js";
import { TtlCache } from "../utils/ttlCache.js";

/**
 * Card-provider webhook handler (spec §9, §17).
 *
 * In the sandbox the payment orchestrator drives card creation, funding and
 * merchant authorization synchronously, so this webhook is a *reconciliation
 * seam*: a real issuer would post asynchronous card lifecycle / authorization
 * events here. It verifies the provider's HMAC signature, is idempotent, and
 * only ever moves a transaction to a legal next state — it never fabricates a
 * success. SECURITY: card events carry only our references, never PAN/CVV.
 */

/** How long processed card-event ids are remembered for de-duplication. */
const EVENT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const processedEvents = new TtlCache<string>(EVENT_DEDUPE_TTL_MS);

const cardEventSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  event: z.string().min(1),
  data: z.object({
    transactionId: z.string().min(1),
    cardReference: z.string().min(1).optional(),
    authorizationId: z.string().min(1).optional(),
  }),
});

export interface CardWebhookResult {
  handled: boolean;
  transactionId?: string;
  status?: Transaction["status"];
  note?: string;
}

export async function processCardProviderWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<CardWebhookResult> {
  if (!verifySignature(rawBody, signature, env.CARD_PROVIDER_WEBHOOK_SECRET)) {
    throw new WebhookSignatureError("Invalid card webhook signature.");
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new TransferVerificationError("Card webhook body is not valid JSON.");
  }

  const parsed = cardEventSchema.safeParse(json);
  if (!parsed.success) {
    throw new TransferVerificationError("Card webhook payload failed validation.", {
      issues: parsed.error.issues.map((i) => i.message),
    });
  }

  const event = parsed.data;

  if (processedEvents.has(event.id)) {
    logger.info("Duplicate card webhook ignored", { eventId: event.id });
    return { handled: false, note: "duplicate_event" };
  }

  const tx = await transactionService.getById(event.data.transactionId);
  const log = logger.child({ transactionId: tx.id, eventId: event.id });

  // An asynchronous authorization failure is the one event that must alter
  // state — and only while we're still processing the payment.
  if (event.event === "card.authorization.failed") {
    if (tx.status === "PAYMENT_PROCESSING") {
      const failed = await transactionService.transition(
        tx.id,
        "PAYMENT_FAILED",
        event.data.authorizationId !== undefined
          ? { merchantAuthorizationId: event.data.authorizationId }
          : {},
        "card_provider_reported_authorization_failure",
      );
      processedEvents.set(event.id, tx.id);
      log.warn("Card authorization failed via webhook");
      return { handled: true, transactionId: tx.id, status: failed.status };
    }
    log.info("Card authorization-failed webhook ignored (not processing)", {
      status: tx.status,
    });
    processedEvents.set(event.id, tx.id);
    return { handled: false, transactionId: tx.id, status: tx.status, note: "not_processing" };
  }

  // All other lifecycle events (authorization succeeded, frozen, closed, ...)
  // are informational here — the orchestrator already reconciled the happy path.
  processedEvents.set(event.id, tx.id);
  log.info("Card lifecycle webhook acknowledged", { event: event.event });
  return { handled: false, transactionId: tx.id, status: tx.status, note: "acknowledged" };
}
