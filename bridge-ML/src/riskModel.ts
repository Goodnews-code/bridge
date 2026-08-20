import type {
  IpRiskBucket,
  RiskAssessment,
  RiskCurrency,
  RiskDecision,
  RiskFeatures,
  RiskInput,
} from "./types.js";

/**
 * Lightweight logistic risk model for FX checkout requests.
 *
 * Weights come from sklearn LogisticRegression trained on synthetic sandbox
 * labels (see python/generate_data.py + python/train.py). Not production
 * Wema fraud data. IP→country mapping is a deterministic mock bucket.
 */
import { TRAINED_MODEL_ID, TRAINED_WEIGHTS } from "./trainedWeights.js";

export const MODEL_ID = TRAINED_MODEL_ID;

export const WEIGHTS = TRAINED_WEIGHTS;

const VELOCITY_WINDOW_MS = 10 * 60 * 1000;
const HIGH_VALUE_USD = 500;
const VERY_HIGH_VALUE_USD = 2500;

const TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.66,
  NGN: 1 / 1500,
};

const SUSPICIOUS_MERCHANT =
  /test|xxx|crypto.?mix|gambling|dark.?web|anonymous|wallet.?drain/i;

/** Mock “elevated” IP prefixes for demos (not a real blocklist). */
const HIGH_RISK_IP_PREFIXES = ["185.220.", "45.9.", "194.26.", "23.129."];
const MEDIUM_RISK_IP_PREFIXES = ["102.89.", "105.112.", "41.203."];

type VelocityBucket = number[];

export type RiskLogger = (message: string, meta?: Record<string, unknown>) => void;

export class RiskService {
  private readonly velocity = new Map<string, VelocityBucket>();
  private readonly knownDevices = new Set<string>();
  private readonly history: RiskAssessment[] = [];
  private readonly log: RiskLogger;

  constructor(options?: { logger?: RiskLogger }) {
    this.log = options?.logger ?? (() => undefined);
  }

  score(input: RiskInput, now: Date = new Date()): RiskAssessment {
    const deviceId = (input.deviceId || "device_unknown").slice(0, 80);
    const ip = normalizeIp(input.ip) || "127.0.0.1";
    const country = (input.country || countryFromIpStub(ip)).toUpperCase();
    const ipRiskBucket = ipRiskBucketFor(ip, country);
    const deviceStatus: "new" | "returning" = this.knownDevices.has(deviceId)
      ? "returning"
      : "new";

    const features = this.extractFeatures(input, {
      now,
      deviceStatus,
      ipRiskBucket,
      country,
    });

    const logit =
      WEIGHTS.bias +
      WEIGHTS.logAmount * features.logAmount +
      WEIGHTS.velocity10m * features.velocity10m +
      WEIGHTS.highValue * features.highValue +
      WEIGHTS.veryHighValue * features.veryHighValue +
      WEIGHTS.suspiciousMerchant * features.suspiciousMerchant +
      WEIGHTS.offHours * features.offHours +
      WEIGHTS.newDevice * features.newDevice +
      WEIGHTS.ipRisk * features.ipRisk +
      WEIGHTS.nonNgContext * features.nonNgContext;

    const score = round4(sigmoid(logit));
    const decision = this.decide(score);
    const reasons = this.explain(features, decision, score, {
      country,
      ipRiskBucket,
      deviceStatus,
    });

    // Mark device as seen after scoring so the first request stays "new".
    this.knownDevices.add(deviceId);

    const assessment: RiskAssessment = {
      score,
      decision,
      reasons,
      model: MODEL_ID,
      features,
      context: {
        deviceId,
        deviceStatus,
        ip,
        country,
        ipRiskBucket,
      },
      scoredAt: now.toISOString(),
    };

    this.history.unshift(assessment);
    if (this.history.length > 100) this.history.length = 100;

    this.log("Risk scored", {
      decision: assessment.decision,
      score: assessment.score,
      amount: input.amount,
      currency: input.currency,
      merchantName: input.merchantName,
      deviceStatus,
      country,
      ipRiskBucket,
      model: MODEL_ID,
    });

    return assessment;
  }

  recent(limit = 20): RiskAssessment[] {
    return this.history.slice(0, limit);
  }

  private extractFeatures(
    input: RiskInput,
    ctx: {
      now: Date;
      deviceStatus: "new" | "returning";
      ipRiskBucket: IpRiskBucket;
      country: string;
    },
  ): RiskFeatures {
    const amountUsd = toUsd(input.amount, input.currency);
    const key = input.userId || input.deviceId || "user_default";
    const velocity10m = this.touchVelocity(key, ctx.now);
    const hour = ctx.now.getUTCHours();
    const merchant = input.merchantName || "";

    return {
      amountUsd: round4(amountUsd),
      logAmount: round4(Math.log1p(amountUsd)),
      velocity10m,
      highValue: amountUsd >= HIGH_VALUE_USD ? 1 : 0,
      veryHighValue: amountUsd >= VERY_HIGH_VALUE_USD ? 1 : 0,
      suspiciousMerchant: SUSPICIOUS_MERCHANT.test(merchant) ? 1 : 0,
      offHours: hour < 5 || hour > 22 ? 1 : 0,
      newDevice: ctx.deviceStatus === "new" ? 1 : 0,
      ipRisk: ctx.ipRiskBucket === "high" ? 1 : ctx.ipRiskBucket === "medium" ? 0.45 : 0,
      nonNgContext: ctx.country === "NG" ? 0 : 1,
    };
  }

  private touchVelocity(userId: string, now: Date): number {
    const cutoff = now.getTime() - VELOCITY_WINDOW_MS;
    const prev = (this.velocity.get(userId) || []).filter((t) => t >= cutoff);
    prev.push(now.getTime());
    this.velocity.set(userId, prev);
    return prev.length;
  }

  private decide(score: number): RiskDecision {
    if (score >= 0.78) return "deny";
    if (score >= 0.45) return "review";
    return "allow";
  }

  private explain(
    features: RiskFeatures,
    decision: RiskDecision,
    score: number,
    ctx: {
      country: string;
      ipRiskBucket: IpRiskBucket;
      deviceStatus: "new" | "returning";
    },
  ): string[] {
    const reasons: string[] = [];
    if (features.veryHighValue) reasons.push("Very high notional FX amount");
    else if (features.highValue) reasons.push("Elevated FX amount");
    if (features.velocity10m >= 5) {
      reasons.push(`High quote velocity (${features.velocity10m} in 10m)`);
    } else if (features.velocity10m >= 3) {
      reasons.push("Elevated quote velocity");
    }
    if (features.suspiciousMerchant) {
      reasons.push("Merchant name matched elevated-risk pattern");
    }
    if (features.offHours) {
      reasons.push("Request outside typical business hours (UTC)");
    }
    if (features.newDevice) {
      reasons.push("First-seen device fingerprint");
    }
    if (ctx.ipRiskBucket === "high") {
      reasons.push(`IP risk bucket high (${ctx.country})`);
    } else if (ctx.ipRiskBucket === "medium") {
      reasons.push(`IP risk bucket medium (${ctx.country})`);
    }
    if (features.nonNgContext) {
      reasons.push(`Client country stub ${ctx.country} (non-NG)`);
    }
    if (reasons.length === 0) {
      reasons.push(
        decision === "allow"
          ? "Routine FX checkout profile"
          : `Model score ${score.toFixed(2)}`,
      );
    }
    return reasons;
  }
}

function toUsd(amount: number, currency: RiskCurrency): number {
  return amount * (TO_USD[currency] ?? 1);
}

function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const cleaned = ip.trim().replace(/^::ffff:/, "");
  if (!cleaned || cleaned === "::1") return "127.0.0.1";
  return cleaned.slice(0, 64);
}

/**
 * Deterministic mock GeoIP: private/local → NG (demo default),
 * otherwise a coarse bucket from the first octet.
 */
export function countryFromIpStub(ip: string): string {
  if (
    ip === "127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.")
  ) {
    return "NG";
  }
  const first = Number(ip.split(".")[0] || "0");
  if (first >= 41 && first <= 105) return "NG";
  if (first >= 180) return "RU";
  if (first >= 140) return "CN";
  if (first >= 80) return "DE";
  return "US";
}

export function ipRiskBucketFor(ip: string, country: string): IpRiskBucket {
  if (HIGH_RISK_IP_PREFIXES.some((p) => ip.startsWith(p))) return "high";
  if (MEDIUM_RISK_IP_PREFIXES.some((p) => ip.startsWith(p))) return "medium";
  if (country === "NG" || ip === "127.0.0.1") return "low";
  if (country === "RU" || country === "CN") return "high";
  return "medium";
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Shared singleton for demos / single-process backends. */
export const riskService = new RiskService();
