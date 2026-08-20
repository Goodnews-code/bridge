import { transferService, type WebhookResult } from "../services/transfers/transferService.js";

/**
 * Payment-provider (NGN collection) webhook handler.
 *
 * Protocol parsing and verification live in the CollectionProvider +
 * TransferService, so this module is a thin seam between the HTTP controller
 * and the domain. Signature failure throws WebhookSignatureError (401); a
 * confirmed transfer triggers the payment orchestrator downstream.
 */
export async function processPaymentProviderWebhook(
  rawBody: Buffer,
  signature: string | undefined,
): Promise<WebhookResult> {
  return transferService.handleWebhook(rawBody, signature);
}
