import { Router } from "express";
import {
  handleCardProviderWebhook,
  handlePaymentProviderWebhook,
} from "../controllers/webhookController.js";
import { webhookLimiter } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Webhook routes. These are NOT protected by the API key — they are called by
 * external providers and are authenticated by HMAC signature inside the
 * handlers instead. The raw request body (needed for signature verification) is
 * captured globally by the express.json({ verify }) hook in app.ts.
 */
export const webhookRoutes: Router = Router();

webhookRoutes.post(
  "/payment-provider",
  webhookLimiter,
  asyncHandler(handlePaymentProviderWebhook),
);

webhookRoutes.post(
  "/card-provider",
  webhookLimiter,
  asyncHandler(handleCardProviderWebhook),
);
