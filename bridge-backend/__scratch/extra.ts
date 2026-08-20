/**
 * Supplementary verification: card-provider webhook path, log redaction,
 * and FX live-provider wiring. Run: node --import tsx __scratch/extra.ts
 */
process.env.NODE_ENV = "development";
process.env.API_KEY = "bridge_test_key";
process.env.CURRENCY_PROVIDER = "static";
process.env.PAYMENT_PROVIDER_SECRET = "whsec_test_secret";
process.env.CARD_PROVIDER_WEBHOOK_SECRET = "whsec_card_test";
process.env.SIMULATE_TRANSFERS = "true";
process.env.LOG_LEVEL = "debug";

const { createApp } = await import("../src/app.js");
const { inject } = await import("./inject.ts");
const { sign } = await import("../src/utils/hmac.js");
const { _internal } = await import("../src/utils/logger.js");

const API = "bridge_test_key";
const app = createApp();
let passed = 0, failed = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Build a transaction and drive it to PAYMENT_PROCESSING is hard to freeze;
// instead we test the card webhook against a fresh transaction in a state where
// the failed-auth event is a no-op (acknowledged), plus signature enforcement.
console.log("\n[C1] Card-provider webhook signature enforcement");
{
  const body = JSON.stringify({ id: "cardevt_1", event: "card.authorization.failed", data: { transactionId: "txn_whatever" } });
  const bad = await inject(app, {
    method: "POST", path: "/api/v1/webhooks/card-provider",
    headers: { "x-webhook-signature": "sha256=bad" }, body,
  });
  check("card webhook bad sig → 401", bad.statusCode === 401, bad.statusCode);
}

console.log("\n[C2] Card-provider webhook valid sig, unknown tx → 404");
{
  const body = JSON.stringify({ id: "cardevt_2", event: "card.authorization.succeeded", data: { transactionId: "txn_missing" } });
  const sig = sign(body, "whsec_card_test");
  const res = await inject(app, {
    method: "POST", path: "/api/v1/webhooks/card-provider",
    headers: { "x-webhook-signature": sig }, body,
  });
  check("card webhook unknown tx → 404", res.statusCode === 404, res.statusCode + " " + res.rawBody);
}

console.log("\n[C3] Card-provider webhook acknowledges lifecycle event on a real tx");
{
  // Create a successful transaction first.
  const q = await inject(app, { method: "POST", path: "/api/v1/payment-quotes", headers: { "x-api-key": API }, body: { amount: 20, currency: "USD" } });
  const qid = q.json<{ data: any }>().data.quoteId;
  const t = await inject(app, { method: "POST", path: "/api/v1/transactions", headers: { "x-api-key": API }, body: { quoteId: qid, merchantName: "CardTest" } });
  const txId = t.json<{ data: any }>().data.transaction.id;
  await inject(app, { method: "POST", path: `/api/v1/transactions/${txId}/confirm`, headers: { "x-api-key": API } });
  await sleep(150);

  const body = JSON.stringify({ id: "cardevt_3", event: "card.closed", data: { transactionId: txId } });
  const sig = sign(body, "whsec_card_test");
  const res = await inject(app, {
    method: "POST", path: "/api/v1/webhooks/card-provider",
    headers: { "x-webhook-signature": sig }, body,
  });
  const d = res.json<{ data: any }>().data;
  check("card lifecycle event → 200", res.statusCode === 200, res.statusCode);
  check("acknowledged, tx unchanged (PAYMENT_SUCCESSFUL)", d.status === "PAYMENT_SUCCESSFUL" && d.note === "acknowledged", d);
}

console.log("\n[C4] Log redaction strips PAN / CVV / secrets");
{
  const dirty = {
    pan: "4111111111111111",
    cvv: "123",
    apiKey: "sk_live_supersecret",
    nested: { card_number: "5500 0000 0000 0004", note: "charged card 4111 1111 1111 1111 ok" },
    safe: "hello",
  };
  const clean = _internal.redact(dirty) as any;
  check("pan redacted", clean.pan === "[REDACTED]", clean.pan);
  check("cvv redacted", clean.cvv === "[REDACTED]", clean.cvv);
  check("apiKey redacted", clean.apiKey === "[REDACTED]", clean.apiKey);
  check("nested card_number redacted", clean.nested.card_number === "[REDACTED]", clean.nested.card_number);
  check("PAN in free text redacted", !/4111\s?1111\s?1111\s?1111/.test(clean.nested.note), clean.nested.note);
  check("safe field preserved", clean.safe === "hello", clean.safe);
}

console.log("\n[C5] FX provider selection (static fallback when no key)");
{
  const { currencyProvider } = await import("../src/providers/currency/index.js");
  const rate = await currencyProvider.getRate("USD", "NGN");
  check("static provider selected", currencyProvider.name === "static", currencyProvider.name);
  check("USD→NGN rate = 1500", rate === 1500, rate);
}

console.log(`\n──────────────\nRESULT: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
