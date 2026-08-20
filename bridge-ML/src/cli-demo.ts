/**
 * Quick local demo: `npm run demo` from bridge-ML.
 * Scores a routine checkout vs a high-risk pattern.
 */
import { RiskService } from "./riskModel.js";

const risk = new RiskService({
  logger: (msg, meta) => console.log(msg, meta ?? ""),
});

const routine = risk.score({
  amount: 42,
  currency: "USD",
  merchantName: "Stripe Demo Store",
  deviceId: "device_demo_returning",
  ip: "127.0.0.1",
});

// Mark device as known, then score again as returning.
risk.score({
  amount: 10,
  currency: "USD",
  deviceId: "device_demo_returning",
  ip: "127.0.0.1",
});

const elevated = risk.score({
  amount: 3200,
  currency: "USD",
  merchantName: "Anonymous Crypto Mix",
  deviceId: "device_brand_new",
  ip: "185.220.101.1",
});

console.log("\nRoutine:", {
  decision: routine.decision,
  score: routine.score,
  reasons: routine.reasons,
});

console.log("Elevated:", {
  decision: elevated.decision,
  score: elevated.score,
  reasons: elevated.reasons,
});
