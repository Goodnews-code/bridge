import type { Request, Response } from "express";
import type { ApiSuccess, RawBodyRequest } from "../types/http.js";
import { processPaymentProviderWebhook } from "../webhooks/paymentProviderWebhook.js";
import { processCardProviderWebhook } from "../webhooks/cardProviderWebhook.js";

/** Common provider signature header names we accept. */
const SIGNATURE_HEADERS = [
  "x-bridge-signature",
  "x-webhook-signature",
  "x-signature",
  "verif-hash",
] as const;

/**
 * Extract the raw request body captured by the `express.json({ verify })` hook.
 * HMAC must be computed over the exact received bytes, so we fall back to a
 * re-serialization only if the hook didn't run (it always should for webhooks).
 */
function getRawBody(req: Request): Buffer {
  const raw = (req as RawBodyRequest).rawBody;
  if (raw && raw.length > 0) return raw;
  return Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
}

function getSignature(req: Request): string | undefined {
  for (const header of SIGNATURE_HEADERS) {
    const value = req.headers[header];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** POST /webhooks/payment-provider — inbound NGN transfer events. */
export async function handlePaymentProviderWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await processPaymentProviderWebhook(getRawBody(req), getSignature(req));
  const payload: ApiSuccess<typeof result> = { ok: true, data: result };
  res.status(200).json(payload);
}

/** POST /webhooks/card-provider — asynchronous card lifecycle events. */
export async function handleCardProviderWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await processCardProviderWebhook(getRawBody(req), getSignature(req));
  const payload: ApiSuccess<typeof result> = { ok: true, data: result };
  res.status(200).json(payload);
}
