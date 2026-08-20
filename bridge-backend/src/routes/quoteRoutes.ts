import { Router } from "express";
import { createQuote, createQuoteSchema } from "../controllers/quoteController.js";
import { authenticate } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { quoteLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Quote routes. Handlers stay thin (spec §14): auth, rate-limit, idempotency and
 * validation are middleware; all business logic lives in the services.
 */
export const quoteRoutes: Router = Router();

quoteRoutes.post(
  "/",
  authenticate,
  quoteLimiter,
  idempotency,
  validate({ body: createQuoteSchema }),
  asyncHandler(createQuote),
);
