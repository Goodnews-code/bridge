import { currencyService } from "../src/services/currency/currencyService.js";
import { quoteService } from "../src/services/payments/quoteService.js";
import { transactionService } from "../src/services/transactions/transactionService.js";
import { transferService } from "../src/services/transfers/transferService.js";
import { collectionProvider } from "../src/providers/payments/collection/index.js";

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// 1. FX math — the canonical $20 example.
const quote = await currencyService.buildQuote({ amount: 20, currency: "USD" });
assert(quote.exchangeRate === 1500, `USD rate 1500 (got ${quote.exchangeRate})`);
assert(quote.baseNairaAmount === 30000, `base 30000 (got ${quote.baseNairaAmount})`);
assert(quote.spreadAmount === 600, `spread 600 (got ${quote.spreadAmount})`);
assert(quote.finalNairaAmount === 30600, `final 30600 (got ${quote.finalNairaAmount})`);

// 2. NGN passthrough.
const ngn = await currencyService.buildQuote({ amount: 5000, currency: "NGN" });
assert(ngn.exchangeRate === 1, "NGN rate 1");
assert(ngn.baseNairaAmount === 5000, "NGN base 5000");
assert(ngn.finalNairaAmount === 5100, `NGN final 5100 w/ 2% (got ${ngn.finalNairaAmount})`);

// 3. Full pipeline: quote -> tx -> signed webhook -> SUCCESSFUL.
const liveQuote = await quoteService.createQuote({ amount: 20, currency: "USD" });
const tx = await transactionService.createFromQuote({
  userId: "user_test",
  quote: liveQuote,
  merchantName: "Acme Store",
  sourceUrl: "https://acme.example/checkout",
});
assert(tx.status === "AWAITING_TRANSFER", `tx AWAITING_TRANSFER (got ${tx.status})`);
assert(tx.amountToTransferNGN === 30600, "tx amount 30600");

// Build a provider-signed webhook exactly as the simulator will.
const payload = JSON.stringify({
  event: "charge.success",
  data: {
    id: "prov_tx_1",
    reference: tx.transferReference,
    amount: tx.amountToTransferNGN,
    currency: "NGN",
    status: "success",
  },
});
const sig = collectionProvider.signPayload(payload);
const raw = Buffer.from(payload, "utf8");

const result = await transferService.handleWebhook(raw, sig);
assert(result.status === "PAYMENT_SUCCESSFUL", `pipeline SUCCESSFUL (got ${result.status})`);

const finalTx = await transactionService.getById(tx.id);
assert(finalTx.status === "PAYMENT_SUCCESSFUL", "final tx SUCCESSFUL");
assert(!!finalTx.cardReference, "card reference set");
assert(finalTx.providerTransactionId === "prov_tx_1", "provider tx id recorded");
console.log("state trail:", finalTx.events.map((e) => e.to).join(" -> "));

// 4. Idempotency: replay same webhook -> no-op.
const replay = await transferService.handleWebhook(raw, sig);
assert(replay.handled === false && replay.note === "duplicate_event", "replay deduped");

// 5. Bad signature -> throws.
let threw = false;
try {
  await transferService.handleWebhook(raw, "sha256=deadbeef");
} catch {
  threw = true;
}
assert(threw, "bad signature rejected");

// 6. Amount mismatch -> TRANSFER not confirmed.
const q2 = await quoteService.createQuote({ amount: 10, currency: "USD" });
const tx2 = await transactionService.createFromQuote({
  userId: "user_test",
  quote: q2,
  merchantName: "Acme",
});
const badPayload = JSON.stringify({
  event: "charge.success",
  data: { id: "p2", reference: tx2.transferReference, amount: 999, currency: "NGN", status: "success" },
});
let mismatchThrew = false;
try {
  await transferService.handleWebhook(Buffer.from(badPayload), collectionProvider.signPayload(badPayload));
} catch {
  mismatchThrew = true;
}
assert(mismatchThrew, "amount mismatch rejected");
const tx2After = await transactionService.getById(tx2.id);
assert(tx2After.status === "AWAITING_TRANSFER", "tx2 unchanged after mismatch");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL LOGIC CHECKS PASSED");
