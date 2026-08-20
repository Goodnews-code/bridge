import { Router, type Request, type Response } from "express";
import { env } from "../config/env.js";
import type { ApiSuccess } from "../types/http.js";
import { quoteRoutes } from "./quoteRoutes.js";
import { transactionRoutes } from "./transactionRoutes.js";
import { webhookRoutes } from "./webhookRoutes.js";

/**
 * Root router. Mounts the versioned API surface under /api/v1 and exposes an
 * unauthenticated liveness probe at /health.
 */
export const apiRouter: Router = Router();

apiRouter.get("/health", (_req: Request, res: Response) => {
  const payload: ApiSuccess<{
    status: "ok";
    service: string;
    environment: string;
    time: string;
  }> = {
    ok: true,
    data: {
      status: "ok",
      service: "paron-backend",
      environment: env.NODE_ENV,
      time: new Date().toISOString(),
    },
  };
  res.status(200).json(payload);
});

apiRouter.use("/api/v1/payment-quotes", quoteRoutes);
apiRouter.use("/api/v1/transactions", transactionRoutes);
apiRouter.use("/api/v1/webhooks", webhookRoutes);
