import type { Request, Response } from "express";
import { z } from "zod";
import type { ApiSuccess } from "../types/http.js";
import type { AuthedRequest } from "../types/http.js";
import type { Transaction } from "../types/transaction.js";
import { collectionProvider } from "../providers/payments/collection/index.js";
import { quoteService } from "../services/payments/quoteService.js";
import { transactionService } from "../services/transactions/transactionService.js";
import { toSimplifiedStatus } from "../services/transactions/stateMachine.js";
import {
  isSimulationEnabled,
  simulateInboundTransfer,
} from "../services/transfers/transferSimulator.js";

export const createTransactionSchema = z.object({
  quoteId: z.string().min(1),
  merchantName: z.string().min(1).max(200),
  sourceUrl: z.string().url().max(2000).optional(),
});

export const transactionIdParamSchema = z.object({
  id: z.string().min(1),
});

type CreateTransactionBody = z.infer<typeof createTransactionSchema>;

/**
 * Public view of a transaction. Exposes non-sensitive fields plus the
 * simplified status the Chrome Extension understands. Never includes card
 * credentials.
 */
function toTransactionView(tx: Transaction) {
  return {
    id: tx.id,
    status: tx.status,
    simplifiedStatus: toSimplifiedStatus(tx.status),
    merchantName: tx.merchantName,
    merchantAmount: tx.merchantAmount,
    merchantCurrency: tx.merchantCurrency,
    exchangeRate: tx.exchangeRate,
    spreadPercent: tx.spreadPercent,
    amountToTransferNGN: tx.amountToTransferNGN,
    quoteId: tx.quoteId,
    cardProvider: tx.cardProvider,
    ...(tx.cardReference !== undefined && { cardReference: tx.cardReference }),
    provider: tx.provider,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
    expiresAt: tx.expiresAt,
  };
}

/** POST /transactions — create a transaction from a live quote. */
export async function createTransaction(req: AuthedRequest, res: Response): Promise<void> {
  const body = req.body as CreateTransactionBody;
  const userId = req.auth?.userId ?? "user_default";

  // Rejects an expired quote with QuoteExpiredError (409).
  const quote = await quoteService.getLiveQuote(body.quoteId);

  const tx = await transactionService.createFromQuote({
    userId,
    quote,
    merchantName: body.merchantName,
    ...(body.sourceUrl !== undefined && { sourceUrl: body.sourceUrl }),
  });

  // Build the NGN funding instructions the user transfers to.
  const instructions = await collectionProvider.createInstructions({
    transactionId: tx.id,
    reference: tx.transferReference,
    amount: tx.amountToTransferNGN,
    currency: "NGN",
  });

  const payload: ApiSuccess<{
    transaction: ReturnType<typeof toTransactionView>;
    fundingInstructions: typeof instructions;
  }> = {
    ok: true,
    data: { transaction: toTransactionView(tx), fundingInstructions: instructions },
  };
  res.status(201).json(payload);
}

/** GET /transactions/:id — fetch current transaction state (extension polls this). */
export async function getTransaction(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const tx = await transactionService.getById(id);
  const payload: ApiSuccess<ReturnType<typeof toTransactionView>> = {
    ok: true,
    data: toTransactionView(tx),
  };
  res.status(200).json(payload);
}

/**
 * POST /transactions/:id/confirm — record the user's claim that they've
 * transferred. This does NOT fund the payment; only the verified provider
 * webhook does. In dev, it schedules a signed webhook via the simulator.
 */
export async function confirmTransaction(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const tx = await transactionService.getById(id);

  if (isSimulationEnabled() && tx.status === "AWAITING_TRANSFER") {
    await simulateInboundTransfer(tx);
  }

  const payload: ApiSuccess<{
    transaction: ReturnType<typeof toTransactionView>;
    message: string;
    simulated: boolean;
  }> = {
    ok: true,
    data: {
      transaction: toTransactionView(tx),
      message:
        "Transfer claim recorded. Payment is confirmed only once the incoming transfer is verified.",
      simulated: isSimulationEnabled(),
    },
  };
  res.status(202).json(payload);
}
