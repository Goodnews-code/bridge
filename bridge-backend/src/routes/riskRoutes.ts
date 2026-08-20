import { Router } from "express";
import {
  listRecentRisk,
  scoreRisk,
  scoreRiskSchema,
} from "../controllers/riskController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const riskRoutes: Router = Router();

riskRoutes.post(
  "/score",
  authenticate,
  validate({ body: scoreRiskSchema }),
  asyncHandler(scoreRisk),
);

riskRoutes.get("/recent", authenticate, asyncHandler(listRecentRisk));
