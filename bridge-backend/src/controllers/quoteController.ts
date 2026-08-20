import type { Request, Response } from "express";
import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../types/money.js";
import type { Quote } from "../types/quote.js";
import type { ApiSuccess } from "../types/http.js";
import { quoteService } from "../services/payments/quoteService.js";

/** Body schema for POST /payment-quotes. */
export const createQuoteSchema = z.object({
  amount: z.number().positive().finite(),
  currency: z
    .string()
    .transform((c) => c.trim().toUpperCase())
    .pipe(z.enum(SUPPORTED_CURRENCIES)),
  merchantName: z.string().min(1).max(200).optional(),
});

type CreateQuoteBody = z.infer<typeof createQuoteSchema>;

/**
 * The extension-facing quote view. Uses the field names from spec §5 while the
 * internal Quote keeps the fuller spec §4 shape.
 */
function toQuoteView(quote: Quote, merchantName?: string) {
  return {
    quoteId: quote.quoteId,
    originalAmount: quote.originalAmount,
    currency: quote.originalCurrency,
    exchangeRate: quote.exchangeRate,
    baseAmountNGN: quote.baseNairaAmount,
    spreadPercent: quote.spreadPercent,
    spreadAmountNGN: quote.spreadAmount,
    amountToTransferNGN: quote.finalNairaAmount,
    ...(merchantName !== undefined && { merchantName }),
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
  };
}

/** POST /payment-quotes — convert a merchant amount into an NGN transfer quote. */
export async function createQuote(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateQuoteBody;
  const quote = await quoteService.createQuote({
    amount: body.amount,
    currency: body.currency,
  });

  const payload: ApiSuccess<ReturnType<typeof toQuoteView>> = {
    ok: true,
    data: toQuoteView(quote, body.merchantName),
  };
  res.status(201).json(payload);
}
