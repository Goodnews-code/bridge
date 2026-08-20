/**
 * Backend adapter around the standalone Bridge ML package.
 * HTTP concerns (client IP) stay here; scoring lives in bridge-ML.
 */
import { RiskService } from "bridge-ml";
import { logger } from "../../utils/logger.js";

export type {
  IpRiskBucket,
  RiskAssessment,
  RiskCurrency,
  RiskDecision,
  RiskFeatures,
  RiskInput,
} from "bridge-ml";

export {
  MODEL_ID,
  WEIGHTS,
  RiskService,
  countryFromIpStub,
  ipRiskBucketFor,
  sigmoid,
} from "bridge-ml";

export const riskService = new RiskService({
  logger: (message, meta) => logger.info(message, meta),
});

/** Best-effort client IP from Express request headers / socket. */
export function clientIpFromRequest(req: {
  headers: Record<string, unknown>;
  ip?: string | undefined;
  socket?: { remoteAddress?: string | undefined } | undefined;
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(",")[0]!.trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp.trim();
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}
