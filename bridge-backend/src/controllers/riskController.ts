import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import type { AuthedRequest } from "../types/http.js";
import type { ApiSuccess } from "../types/http.js";
import { SUPPORTED_CURRENCIES } from "../types/money.js";
import {
  clientIpFromRequest,
  riskService,
} from "../services/risk/riskService.js";

export const scoreRiskSchema = z.object({
  amount: z.number().positive().finite(),
  currency: z
    .string()
    .transform((c) => c.trim().toUpperCase())
    .pipe(z.enum(SUPPORTED_CURRENCIES)),
  merchantName: z.string().min(1).max(200).optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  deviceId: z.string().min(4).max(80).optional(),
  country: z.string().min(2).max(2).optional(),
  ip: z.string().min(3).max(64).optional(),
});

type ScoreRiskBody = z.infer<typeof scoreRiskSchema>;

/** POST /risk/score — run the FX checkout risk model without creating a quote. */
export async function scoreRisk(req: AuthedRequest, res: Response): Promise<void> {
  const body = req.body as ScoreRiskBody;
  const assessment = riskService.score({
    amount: body.amount,
    currency: body.currency,
    ...(body.merchantName !== undefined && { merchantName: body.merchantName }),
    ...(body.sourceUrl !== undefined && { sourceUrl: body.sourceUrl }),
    ...(body.deviceId !== undefined && { deviceId: body.deviceId }),
    ...(body.country !== undefined && { country: body.country }),
    ip: body.ip || clientIpFromRequest(req),
    userId: req.auth?.userId ?? "user_default",
  });

  const payload: ApiSuccess<typeof assessment & { enabled: boolean }> = {
    ok: true,
    data: { ...assessment, enabled: env.RISK_ENABLED },
  };
  res.status(200).json(payload);
}

/** GET /risk/recent — last scored decisions (demo / ops). */
export async function listRecentRisk(_req: Request, res: Response): Promise<void> {
  const payload: ApiSuccess<{ assessments: ReturnType<typeof riskService.recent> }> = {
    ok: true,
    data: { assessments: riskService.recent(20) },
  };
  res.status(200).json(payload);
}
