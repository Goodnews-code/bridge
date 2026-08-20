export type RiskDecision = "allow" | "review" | "deny";
export type IpRiskBucket = "low" | "medium" | "high";

/** Currencies the risk model understands for USD-notional conversion. */
export type RiskCurrency = "NGN" | "USD" | "GBP" | "EUR" | "JPY" | "CAD" | "AUD" | string;

export interface RiskFeatures {
  amountUsd: number;
  logAmount: number;
  velocity10m: number;
  highValue: number;
  veryHighValue: number;
  suspiciousMerchant: number;
  offHours: number;
  newDevice: number;
  ipRisk: number;
  nonNgContext: number;
}

export interface RiskAssessment {
  score: number;
  decision: RiskDecision;
  reasons: string[];
  model: string;
  features: RiskFeatures;
  context: {
    deviceId: string;
    deviceStatus: "new" | "returning";
    ip: string;
    country: string;
    ipRiskBucket: IpRiskBucket;
  };
  scoredAt: string;
}

export interface RiskInput {
  amount: number;
  currency: RiskCurrency;
  merchantName?: string;
  userId?: string;
  deviceId?: string;
  sourceUrl?: string;
  /** Client IP (from proxy headers or socket). */
  ip?: string;
  /** Optional override for demos; otherwise derived from IP stub. */
  country?: string;
}
