/**
 * End-to-end verification of the PARON backend, run entirely in-process
 * (the sandbox forbids TCP binding). Drives the real Express app via inject().
 *
 * Run: node --import tsx __scratch/e2e.ts
 */

// Env MUST be set before app/config is imported. config/env.ts reads
// process.env at module-load, so we set here and dynamic-import below.
process.env.NODE_ENV = "development";
process.env.PORT = "4999";
process.env.API_KEY = "paron_test_key";
process.env.CURRENCY_PROVIDER = "static";
process.env.CURRENCY_PROVIDER_API_KEY = "";
process.env.CURRENCY_SPREAD_PERCENT = "2";
process.env.QUOTE_EXPIRY_MINUTES = "5";
process.env.PAYMENT_PROVIDER_SECRET = "whsec_test_secret";
process.env.CARD_PROVIDER_WEBHOOK_SECRET = "whsec_card_test";
process.env.SIMULATE_TRANSFERS = "true";
process.env.LOG_LEVEL = "warn"; // keep e2e output readable

const { createApp } = await import("../src/app.js");
const { inject } = await import("./inject.ts");
const { collectionProvider } = await import("../src/providers/payments/collection/index.js");
const { quoteStore } = await import("../src/store/memoryStore.js");

const API = "paron_test_key";
const app = createApp();

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
console.log("\n[1] Health check (no auth)");
{
  const res = await inject(app, { method: "GET", path: "/health" });
  const body = res.json<{ ok: boolean; data: { status: string } }>();
  check("GET /health → 200", res.statusCode === 200, res.statusCode);
  check("health status ok", body.ok === true && body.data.status === "ok", body);
}

// ---------------------------------------------------------------------------
console.log("\n[2] Auth enforcement");
{
  const res = await inject(app, {
    method: "POST",
    path: "/api/v1/payment-quotes",
    body: { amount: 20, currency: "USD" },
  });
  const body = res.json<{ ok: boolean; error?: { code: string } }>();
  check("no x-api-key → 401", res.statusCode === 401, res.statusCode);
  check("error code UNAUTHENTICATED", body.error?.code === "UNAUTHENTICATED", body);
}

// ---------------------------------------------------------------------------
console.log("\n[3] FX quote — canonical $20 example");
let usdQuoteId = "";
{
  const res = await inject(app, {
    method: "POST",
    path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API },
    body: { amount: 20, currency: "USD", merchantName: "Acme Store" },
  });
  const body = res.json<{ ok: boolean; data: any }>();
  const d = body.data ?? {};
  usdQuoteId = d.quoteId ?? "";
  check("POST /payment-quotes → 201", res.statusCode === 201, res.statusCode);
  check("exchangeRate = 1500", d.exchangeRate === 1500, d.exchangeRate);
  check("baseAmountNGN = 30000", d.baseAmountNGN === 30000, d.baseAmountNGN);
  check("spreadPercent = 2", d.spreadPercent === 2, d.spreadPercent);
  check("spreadAmountNGN = 600", d.spreadAmountNGN === 600, d.spreadAmountNGN);
  check("amountToTransferNGN = 30600", d.amountToTransferNGN === 30600, d.amountToTransferNGN);
  check("expiresAt in future", new Date(d.expiresAt).getTime() > Date.now(), d.expiresAt);
}

// ---------------------------------------------------------------------------
console.log("\n[4] NGN passthrough quote");
{
  const res = await inject(app, {
    method: "POST",
    path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API },
    body: { amount: 5000, currency: "NGN" },
  });
  const d = res.json<{ data: any }>().data ?? {};
  check("NGN quote → 201", res.statusCode === 201, res.statusCode);
  check("NGN exchangeRate = 1", d.exchangeRate === 1, d.exchangeRate);
  check("NGN amountToTransferNGN = 5000 (no spread on passthrough)", d.amountToTransferNGN === 5000, d.amountToTransferNGN);
  check("NGN spreadAmountNGN = 0", d.spreadAmountNGN === 0, d.spreadAmountNGN);
}

// ---------------------------------------------------------------------------
console.log("\n[5] Invalid currency rejected");
{
  const res = await inject(app, {
    method: "POST",
    path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API },
    body: { amount: 20, currency: "XYZ" },
  });
  check("bad currency → 400", res.statusCode === 400, res.statusCode);
}

// ---------------------------------------------------------------------------
console.log("\n[6] Create transaction from live quote");
let txnId = "";
let txnAmount = 0;
let txnReference = "";
{
  const res = await inject(app, {
    method: "POST",
    path: "/api/v1/transactions",
    headers: { "x-api-key": API },
    body: { quoteId: usdQuoteId, merchantName: "Acme Store" },
  });
  const d = res.json<{ data: any }>().data ?? {};
  txnId = d.transaction?.id ?? "";
  txnAmount = d.transaction?.amountToTransferNGN ?? 0;
  txnReference = d.fundingInstructions?.reference ?? "";
  check("POST /transactions → 201", res.statusCode === 201, res.statusCode);
  check("status AWAITING_TRANSFER", d.transaction?.status === "AWAITING_TRANSFER", d.transaction?.status);
  check("simplifiedStatus pending", d.transaction?.simplifiedStatus === "pending", d.transaction?.simplifiedStatus);
  check("funding instructions present", !!d.fundingInstructions?.accountNumber, d.fundingInstructions);
  check("funding sandbox = true", d.fundingInstructions?.sandbox === true, d.fundingInstructions?.sandbox);
  check("funding amount = 30600", d.fundingInstructions?.amount === 30600, d.fundingInstructions?.amount);
  check("no card credentials leaked", !("pan" in d.transaction) && !("cvv" in d.transaction), Object.keys(d.transaction ?? {}));
}

// ---------------------------------------------------------------------------
console.log("\n[7] Confirm → simulated webhook → PAYMENT_SUCCESSFUL");
{
  const res = await inject(app, {
    method: "POST",
    path: `/api/v1/transactions/${txnId}/confirm`,
    headers: { "x-api-key": API },
  });
  const d = res.json<{ data: any }>().data ?? {};
  check("POST /confirm → 202", res.statusCode === 202, res.statusCode);
  check("confirm simulated = true", d.simulated === true, d.simulated);

  // Poll until the simulated webhook completes the pipeline.
  let finalStatus = "";
  let trail: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    await sleep(25);
    const poll = await inject(app, {
      method: "GET",
      path: `/api/v1/transactions/${txnId}`,
      headers: { "x-api-key": API },
    });
    const pd = poll.json<{ data: any }>().data ?? {};
    finalStatus = pd.status;
    trail = (pd as any).events ? (pd as any).events.map((e: any) => e.to) : trail;
    if (finalStatus === "PAYMENT_SUCCESSFUL" || finalStatus?.includes("FAILED")) break;
  }
  check("reaches PAYMENT_SUCCESSFUL", finalStatus === "PAYMENT_SUCCESSFUL", finalStatus);

  // Fetch the full record to inspect state trail + references.
  const full = await inject(app, {
    method: "GET",
    path: `/api/v1/transactions/${txnId}`,
    headers: { "x-api-key": API },
  });
  const fd = full.json<{ data: any }>().data ?? {};
  check("simplifiedStatus successful", fd.simplifiedStatus === "successful", fd.simplifiedStatus);
  check("cardReference recorded", typeof fd.cardReference === "string" && fd.cardReference.length > 0, fd.cardReference);
}

// ---------------------------------------------------------------------------
console.log("\n[8] Webhook signature verification");
{
  // A fresh transaction to receive a direct (non-simulated) webhook.
  const q = await inject(app, {
    method: "POST",
    path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API },
    body: { amount: 20, currency: "USD" },
  });
  const qid = q.json<{ data: any }>().data.quoteId;
  const t = await inject(app, {
    method: "POST",
    path: "/api/v1/transactions",
    headers: { "x-api-key": API },
    body: { quoteId: qid, merchantName: "Beta Store" },
  });
  const td = t.json<{ data: any }>().data;
  const ref = td.fundingInstructions.reference;

  const payload = JSON.stringify({
    event: "charge.success",
    data: { id: `evt_${ref}`, reference: ref, amount: td.transaction.amountToTransferNGN, currency: "NGN", status: "success" },
  });
  const goodSig = collectionProvider.signPayload(payload);

  // 8a: bad signature → 401, tx untouched.
  const bad = await inject(app, {
    method: "POST",
    path: "/api/v1/webhooks/payment-provider",
    headers: { "x-paron-signature": "sha256=deadbeef" },
    body: payload,
  });
  check("bad signature → 401", bad.statusCode === 401, bad.statusCode);

  const afterBad = await inject(app, {
    method: "GET",
    path: `/api/v1/transactions/${td.transaction.id}`,
    headers: { "x-api-key": API },
  });
  check("tx untouched after bad sig", afterBad.json<{ data: any }>().data.status === "AWAITING_TRANSFER");

  // 8b: valid signature → 200 → drives to PAYMENT_SUCCESSFUL.
  const good = await inject(app, {
    method: "POST",
    path: "/api/v1/webhooks/payment-provider",
    headers: { "x-paron-signature": goodSig },
    body: payload,
  });
  check("valid signature → 200", good.statusCode === 200, good.statusCode);
  check("webhook handled = true", good.json<{ data: any }>().data.handled === true, good.rawBody);

  await sleep(100);
  const afterGood = await inject(app, {
    method: "GET",
    path: `/api/v1/transactions/${td.transaction.id}`,
    headers: { "x-api-key": API },
  });
  check("tx now PAYMENT_SUCCESSFUL", afterGood.json<{ data: any }>().data.status === "PAYMENT_SUCCESSFUL", afterGood.json<{ data: any }>().data.status);

  // 8c: idempotency — replay the same webhook → no-op, still successful.
  const replay = await inject(app, {
    method: "POST",
    path: "/api/v1/webhooks/payment-provider",
    headers: { "x-paron-signature": goodSig },
    body: payload,
  });
  const replayData = replay.json<{ data: any }>().data;
  check("replay → 200 no-op", replay.statusCode === 200 && replayData.handled === false, replayData);
  check("replay note duplicate_event", replayData.note === "duplicate_event", replayData.note);
}

// ---------------------------------------------------------------------------
console.log("\n[9] Amount mismatch rejected");
{
  const q = await inject(app, {
    method: "POST", path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API }, body: { amount: 20, currency: "USD" },
  });
  const qid = q.json<{ data: any }>().data.quoteId;
  const t = await inject(app, {
    method: "POST", path: "/api/v1/transactions",
    headers: { "x-api-key": API }, body: { quoteId: qid, merchantName: "Gamma" },
  });
  const ref = t.json<{ data: any }>().data.fundingInstructions.reference;
  const payload = JSON.stringify({
    event: "charge.success",
    data: { id: `evt_mm_${ref}`, reference: ref, amount: 999, currency: "NGN", status: "success" },
  });
  const sig = collectionProvider.signPayload(payload);
  const res = await inject(app, {
    method: "POST", path: "/api/v1/webhooks/payment-provider",
    headers: { "x-paron-signature": sig }, body: payload,
  });
  check("amount mismatch → 400", res.statusCode === 400, res.statusCode + " " + res.rawBody);
}

// ---------------------------------------------------------------------------
console.log("\n[10] Expired quote rejected on transaction creation");
{
  const q = await inject(app, {
    method: "POST", path: "/api/v1/payment-quotes",
    headers: { "x-api-key": API }, body: { amount: 20, currency: "USD" },
  });
  const qid = q.json<{ data: any }>().data.quoteId;

  // Force expiry by rewinding the stored quote's expiresAt into the past.
  const stored = await quoteStore.findById(qid);
  if (stored) {
    await quoteStore.save({ ...stored, expiresAt: new Date(Date.now() - 60_000).toISOString() });
  }

  const res = await inject(app, {
    method: "POST", path: "/api/v1/transactions",
    headers: { "x-api-key": API }, body: { quoteId: qid, merchantName: "Delta" },
  });
  const body = res.json<{ error?: { code: string } }>();
  check("expired quote → 409", res.statusCode === 409, res.statusCode);
  check("error code QUOTE_EXPIRED", body.error?.code === "QUOTE_EXPIRED", body.error);
}

// ---------------------------------------------------------------------------
console.log("\n[11] Unknown transaction → 404");
{
  const res = await inject(app, {
    method: "GET", path: "/api/v1/transactions/txn_does_not_exist",
    headers: { "x-api-key": API },
  });
  check("unknown tx → 404", res.statusCode === 404, res.statusCode);
}

// ---------------------------------------------------------------------------
console.log("\n[12] Idempotency-Key replays quote response");
{
  const headers = { "x-api-key": API, "idempotency-key": "test-key-123" };
  const first = await inject(app, {
    method: "POST", path: "/api/v1/payment-quotes",
    headers, body: { amount: 20, currency: "USD" },
  });
  const second = await inject(app, {
    method: "POST", path: "/api/v1/payment-quotes",
    headers, body: { amount: 20, currency: "USD" },
  });
  const q1 = first.json<{ data: any }>().data.quoteId;
  const q2 = second.json<{ data: any }>().data.quoteId;
  check("idempotent replay same quoteId", q1 === q2, { q1, q2 });
  check("replay header set", second.headers["idempotent-replayed"] === "true", second.headers["idempotent-replayed"]);
}

// ---------------------------------------------------------------------------
console.log(`\n──────────────\nRESULT: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
