import { Router } from "express";
import {
  confirmTransaction,
  createTransaction,
  createTransactionSchema,
  getTransaction,
  transactionIdParamSchema,
} from "../controllers/transactionController.js";
import { authenticate } from "../middleware/auth.js";
import { idempotency } from "../middleware/idempotency.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Transaction routes. All require authentication. Creation is idempotent via the
 * Idempotency-Key header; confirm only records the user's claim (funding is
 * driven strictly by the verified provider webhook).
 */
export const transactionRoutes: Router = Router();

transactionRoutes.post(
  "/",
  authenticate,
  idempotency,
  validate({ body: createTransactionSchema }),
  asyncHandler(createTransaction),
);

transactionRoutes.get(
  "/:id",
  authenticate,
  validate({ params: transactionIdParamSchema }),
  asyncHandler(getTransaction),
);

transactionRoutes.post(
  "/:id/confirm",
  authenticate,
  validate({ params: transactionIdParamSchema }),
  asyncHandler(confirmTransaction),
);
