# Bridge Backend

Payment-orchestration API for the Chrome extension: FX quotes, NGN funding
verification, restricted virtual-card issuing/funding, merchant authorization.

Full-stack demo (extension + this API): **[root README](../README.md)**. Client
layout, detection, and worker messages: **[bridge-extension/README.md](../bridge-extension/README.md)**.
This file is env, routes, providers, and settlement internals only.

The extension sends amount + currency and polls status. It never sees FX rates,
provider secrets, card PANs, or webhooks.

> **MVP status:** runs fully offline in a sandbox. FX uses a real provider when a
> key is present and a bundled static table otherwise. Card issuing, NGN
> collection, and merchant authorization are **clearly-separated mock adapters**
> behind swappable interfaces — no real money moves.

---

## Table of contents

1. [Core flow](#core-flow)
2. [Project structure](#project-structure)
3. [Key files](#key-files)
4. [Environment variables](#environment-variables)
5. [Running it](#running-it)
6. [API reference](#api-reference) (with curl)
7. [Provider setup & swapping](#provider-setup--swapping)
8. [Currency-conversion flow](#currency-conversion-flow)
9. [Transaction state machine](#transaction-state-machine)
10. [Virtual-card flow](#virtual-card-flow)
11. [Webhook flow](#webhook-flow)
12. [Chrome-extension integration](#chrome-extension-integration)
13. [Sandbox testing walkthrough](#sandbox-testing-walkthrough)
14. [Security model](#security-model)
15. [Production considerations](#production-considerations)

---

## Core flow

```
Extension                    Backend                         Providers
   │  amount + currency         │                                │
   ├───────────────────────────▶  POST /payment-quotes           │
   │                            │   convert → +spread             │
   │                            ├────────────────────────────────▶ FX rate
   │  quote (amountToTransfer)  │◀────────────────────────────────┤
   │◀───────────────────────────┤                                │
   │  create tx                 │                                │
   ├───────────────────────────▶  POST /transactions             │
   │  NGN funding instructions  │   (AWAITING_TRANSFER)           │
   │◀───────────────────────────┤                                │
   │                            │                                │
   │  user transfers NGN ───────┼────────────────────────────────▶ collection acct
   │                            │◀── webhook (HMAC signed) ───────┤
   │                            │   verify sig + amount           │
   │                            │   TRANSFER_CONFIRMED            │
   │                            │   ┌─ create restricted card ───▶ card issuer
   │                            │   ├─ fund card ────────────────▶ card issuer
   │                            │   └─ authorize at merchant ────▶ merchant adapter
   │                            │   PAYMENT_SUCCESSFUL           │
   │  GET /transactions/:id ────▶  { simplifiedStatus }          │
   │◀───────────────────────────┤                                │
```

**Canonical example:** `$20 × ₦1,500 = ₦30,000` base, `+2% spread = ₦600`,
**`amountToTransferNGN = ₦30,600`**. An NGN amount passes through unchanged (no
conversion, no spread).

---

## Project structure

```
src/
├── app.ts                      # build Express app: middleware chain + routes + error handler
├── server.ts                   # start listener, graceful shutdown, crash handlers
├── config/
│   └── env.ts                  # dotenv + Zod-validated typed env (exits on invalid config)
├── types/
│   ├── money.ts                # Currency, supported-currency list, settlement currency (NGN)
│   ├── quote.ts                # internal Quote shape
│   ├── transaction.ts          # Transaction model + status union + simplified status
│   └── http.ts                 # RawBodyRequest, AuthedRequest, ApiSuccess/ApiError envelopes
├── utils/
│   ├── errors.ts               # AppError hierarchy (typed status + code)
│   ├── logger.ts               # structured JSON logger with PAN/CVV/secret redaction
│   ├── money.ts                # roundMoney, convertToNaira, computeSpread, addSpread
│   ├── id.ts                   # prefixed ids (quote_, txn_) + transfer references
│   ├── hmac.ts                 # HMAC-SHA256 sign + constant-time verify
│   ├── ttlCache.ts             # in-memory TTL cache (idempotency + event dedup)
│   └── asyncHandler.ts         # forward async errors to the error handler
├── middleware/
│   ├── requestId.ts            # attach/echo x-request-id
│   ├── auth.ts                 # x-api-key, constant-time compare → attach auth context
│   ├── validate.ts             # Zod body/params/query validation factory
│   ├── idempotency.ts          # Idempotency-Key replay for POSTs
│   ├── rateLimit.ts            # general / quote / webhook limiters
│   ├── notFound.ts             # 404 → NotFoundError
│   └── errorHandler.ts         # central handler: AppError → status+code, redact internals
├── store/
│   ├── types.ts                # QuoteStore, TransactionStore interfaces (swap for a DB later)
│   └── memoryStore.ts          # in-memory implementations (singletons)
├── providers/
│   ├── currency/               # CurrencyProvider: exchangerate-api (real) + static fallback
│   ├── cards/                  # CardProvider: mock issuer (restricted, single-use cards)
│   └── payments/
│       ├── collection/         # CollectionProvider: NGN account + HMAC-signed webhooks (mock)
│       └── merchant/           # MerchantPaymentAdapter: card authorization at checkout (mock)
├── services/
│   ├── currency/currencyService.ts       # convert + spread → build quote
│   ├── payments/quoteService.ts          # create/get quotes, TTL expiry
│   ├── payments/paymentOrchestrator.ts   # post-confirm pipeline (card → fund → authorize)
│   ├── cards/cardService.ts              # build restricted card config from a tx
│   ├── transfers/transferService.ts      # verify webhook, match amount, trigger orchestrator
│   ├── transfers/transferSimulator.ts    # DEV-ONLY: fire a signed webhook after confirm
│   └── transactions/
│       ├── stateMachine.ts               # allowed transitions + simplified-status mapping
│       └── transactionService.ts         # store CRUD + guarded status transitions
├── controllers/
│   ├── quoteController.ts       # POST /payment-quotes
│   ├── transactionController.ts # POST /transactions, GET /:id, POST /:id/confirm
│   └── webhookController.ts     # extract raw body + signature, dispatch to handlers
├── webhooks/
│   ├── paymentProviderWebhook.ts # inbound-transfer events → TransferService
│   └── cardProviderWebhook.ts    # card lifecycle/authorization events (reconciliation)
└── routes/
    ├── index.ts                # GET /health + mount /api/v1 subrouters
    ├── quoteRoutes.ts
    ├── transactionRoutes.ts
    └── webhookRoutes.ts
```

**Dependency direction (no cycles):** `routes → controllers → services →
providers`. `TransferService` verifies a transfer then **calls**
`PaymentOrchestrator`; the orchestrator reads/writes via `TransactionService`,
which imports neither. Business logic lives in services — **route handlers are
thin**.

---

## Key files

| Concern | File |
| --- | --- |
| Boot & validate config | [src/config/env.ts](src/config/env.ts) |
| FX + spread math | [src/services/currency/currencyService.ts](src/services/currency/currencyService.ts), [src/utils/money.ts](src/utils/money.ts) |
| Real FX provider | [src/providers/currency/exchangeRateApi.ts](src/providers/currency/exchangeRateApi.ts) |
| Offline FX fallback | [src/providers/currency/staticRate.ts](src/providers/currency/staticRate.ts) |
| Transfer verification | [src/services/transfers/transferService.ts](src/services/transfers/transferService.ts) |
| Card issuing/funding | [src/services/cards/cardService.ts](src/services/cards/cardService.ts), [src/providers/cards/mockCardProvider.ts](src/providers/cards/mockCardProvider.ts) |
| Post-confirm pipeline | [src/services/payments/paymentOrchestrator.ts](src/services/payments/paymentOrchestrator.ts) |
| State machine | [src/services/transactions/stateMachine.ts](src/services/transactions/stateMachine.ts) |
| HMAC sign/verify | [src/utils/hmac.ts](src/utils/hmac.ts) |
| Log redaction | [src/utils/logger.ts](src/utils/logger.ts) |

---

## Environment variables

Copy [.env.example](.env.example) to `.env` and adjust. `config/env.ts` validates
everything with Zod and **exits on boot** if the config is invalid or unsafe.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP listen port |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `API_KEY` | *(required)* | Shared key the extension sends as `x-api-key` |
| `ALLOWED_ORIGINS` | `*` | CORS allow-list, comma-separated. Supports `*` and one wildcard (e.g. `chrome-extension://*`) |
| `CURRENCY_PROVIDER` | `static` | `exchangerate-api` (real) or `static` (offline) |
| `CURRENCY_PROVIDER_API_KEY` | *(empty)* | Key for exchangerate-api. **Empty → static fallback** |
| `CURRENCY_SPREAD_PERCENT` | `2` | Spread added on FX conversion (0–100) |
| `QUOTE_EXPIRY_MINUTES` | `5` | Quote validity window |
| `CARD_PROVIDER` | `mock` | Card issuer selector |
| `CARD_PROVIDER_API_KEY` | *(empty)* | Card issuer key (unused by mock) |
| `CARD_PROVIDER_WEBHOOK_SECRET` | `whsec_card_dev` | HMAC secret for card webhooks |
| `PAYMENT_PROVIDER` | `mock` | NGN collection provider selector |
| `PAYMENT_PROVIDER_SECRET` | `whsec_dev` | HMAC secret for collection webhooks |
| `COLLECTION_ACCOUNT_NAME` | `BRIDGE PAYMENTS (SANDBOX)` | Name shown on funding instructions |
| `SIMULATE_TRANSFERS` | `false` | **Dev only.** Auto-fire a signed webhook after `/confirm`. Refuses to start if `true` in production |

> `.env` is git-ignored and **must never be committed**. Only `.env.example`
> (no secrets) is tracked.

---

## Running it

```bash
npm install
cp .env.example .env      # leave CURRENCY_PROVIDER_API_KEY empty for offline mode
npm run dev               # tsx watch, hot reload
```

| Script | Action |
| --- | --- |
| `npm run dev` | Run with hot reload (`tsx watch src/server.ts`) |
| `npm run typecheck` | `tsc --noEmit` — strict ESM type check |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled `dist/server.js` |

Requires Node.js ≥ 20. The project is strict ESM (`"type": "module"`,
`module: nodenext`) — all relative imports use explicit `.js` extensions.

---

## API reference

Base URL: `http://localhost:4000`. All `/api/v1` endpoints (except webhooks)
require the `x-api-key` header. Every response uses a consistent envelope:

```jsonc
// success
{ "ok": true, "data": { /* ... */ } }
// error
{ "ok": false, "error": { "code": "QUOTE_EXPIRED", "message": "…", "details": {} } }
```

`x-request-id` is echoed on every response for log correlation.

### `GET /health` — liveness (no auth)

```bash
curl -s http://localhost:4000/health
```
```json
{ "ok": true, "data": { "status": "ok", "service": "bridge-backend", "environment": "development", "time": "2026-08-19T04:00:00.000Z" } }
```

### `POST /api/v1/payment-quotes` — create a quote

Body: `{ amount: number, currency: string, merchantName?: string }`.
Honors an optional `Idempotency-Key` header. Rate-limited to 30/min.

```bash
curl -s -X POST http://localhost:4000/api/v1/payment-quotes \
  -H "x-api-key: paron_dev_key_change_me" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-quote-1" \
  -d '{ "amount": 20, "currency": "USD", "merchantName": "Acme Store" }'
```
```json
{
  "ok": true,
  "data": {
    "quoteId": "quote_…",
    "originalAmount": 20,
    "currency": "USD",
    "exchangeRate": 1500,
    "baseAmountNGN": 30000,
    "spreadPercent": 2,
    "spreadAmountNGN": 600,
    "amountToTransferNGN": 30600,
    "merchantName": "Acme Store",
    "createdAt": "…",
    "expiresAt": "…"
  }
}
```

NGN passthrough (`{ "amount": 5000, "currency": "NGN" }`) returns
`exchangeRate: 1`, `spreadAmountNGN: 0`, `amountToTransferNGN: 5000`.

### `POST /api/v1/transactions` — create a transaction from a live quote

Body: `{ quoteId: string, merchantName: string, sourceUrl?: string }`. Rejects an
expired quote with `409 QUOTE_EXPIRED`. Idempotency-Key supported.

```bash
curl -s -X POST http://localhost:4000/api/v1/transactions \
  -H "x-api-key: paron_dev_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{ "quoteId": "quote_…", "merchantName": "Acme Store" }'
```
```json
{
  "ok": true,
  "data": {
    "transaction": {
      "id": "txn_…",
      "status": "AWAITING_TRANSFER",
      "simplifiedStatus": "pending",
      "amountToTransferNGN": 30600,
      "merchantName": "Acme Store",
      "merchantAmount": 20,
      "merchantCurrency": "USD",
      "exchangeRate": 1500,
      "cardProvider": "mock",
      "provider": "mock",
      "createdAt": "…", "updatedAt": "…", "expiresAt": "…"
    },
    "fundingInstructions": {
      "accountName": "BRIDGE PAYMENTS (SANDBOX)",
      "accountNumber": "…",
      "bank": "Bridge Sandbox Bank",
      "reference": "BRIDGE-…",
      "amount": 30600,
      "currency": "NGN",
      "sandbox": true
    }
  }
}
```

### `GET /api/v1/transactions/:id` — poll status

```bash
curl -s http://localhost:4000/api/v1/transactions/txn_… \
  -H "x-api-key: paron_dev_key_change_me"
```

Returns the transaction view including `status` (internal) and
`simplifiedStatus` (`pending|processing|successful|failed`). Never returns card
credentials — only a `cardReference` token once a card exists.

### `POST /api/v1/transactions/:id/confirm` — record the user's "I've transferred" claim

**This does not fund the payment.** Funding happens only when the verified
provider webhook arrives. In dev (`SIMULATE_TRANSFERS=true`) it schedules a
correctly-signed webhook so the real verification path runs offline. Returns
`202`.

```bash
curl -s -X POST http://localhost:4000/api/v1/transactions/txn_…/confirm \
  -H "x-api-key: paron_dev_key_change_me"
```

### `POST /api/v1/webhooks/payment-provider` — inbound NGN transfer (provider → backend)

No API key; authenticated by HMAC signature over the **raw body**. Send the
signature in `x-bridge-signature` (or `x-webhook-signature`). See
[Webhook flow](#webhook-flow) for a signed curl example. Returns `200` for
verified events (including accepted-but-ignored duplicates); `401` on a bad
signature; `400` on amount/currency mismatch.

### `POST /api/v1/webhooks/card-provider` — card lifecycle (issuer → backend)

HMAC-verified with `CARD_PROVIDER_WEBHOOK_SECRET`. A reconciliation seam for
asynchronous issuers: an `card.authorization.failed` event while a tx is
`PAYMENT_PROCESSING` moves it to `PAYMENT_FAILED`; other events are acknowledged.

### Error codes

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` / `INVALID_CURRENCY` | Bad request body / unsupported currency |
| 400 | `TRANSFER_VERIFICATION_FAILED` | Webhook amount/currency mismatch |
| 401 | `UNAUTHENTICATED` | Missing/invalid `x-api-key` |
| 401 | `INVALID_WEBHOOK_SIGNATURE` | Bad webhook HMAC |
| 404 | `NOT_FOUND` | Unknown transaction/route |
| 409 | `QUOTE_EXPIRED` | Quote past its expiry |
| 409 | `INVALID_STATE_TRANSITION` | Illegal status change |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 502 | `CARD_CREATION_FAILED` / `CARD_FUNDING_FAILED` / `PAYMENT_PROCESSING_FAILED` | Provider step failed |
| 503 | `PROVIDER_UNAVAILABLE` | Upstream provider unreachable |
| 500 | `INTERNAL_ERROR` | Unexpected error (details hidden in production) |

---

## Provider setup & swapping

Every external dependency sits behind an interface, selected by env at boot. To
swap a provider you implement its interface and register it in the provider's
`index.ts` factory — **no service or controller changes.**

| Provider | Interface | Mock / real | Selector |
| --- | --- | --- | --- |
| FX rate | `CurrencyProvider` | `exchangerate-api` (real) + `static` (offline) | `CURRENCY_PROVIDER` |
| Card issuing | `CardProvider` | `mock` | `CARD_PROVIDER` |
| NGN collection | `CollectionProvider` | `mock` | `PAYMENT_PROVIDER` |
| Merchant payment | `MerchantPaymentAdapter` | `mock` | (wired in adapter index) |

### FX: exchangerate-api

1. Get a free key at <https://www.exchangerate-api.com>.
2. Set `CURRENCY_PROVIDER=exchangerate-api` and `CURRENCY_PROVIDER_API_KEY=…`.
3. The backend calls `GET /v6/{KEY}/pair/{FROM}/NGN` and reads `conversion_rate`;
   the spread is still applied on top. If the key is empty it **automatically
   falls back** to the static table (USD 1500, GBP 1900, EUR 1650, …) so the app
   always runs.

### Real card / collection / merchant providers

Implement the relevant interface (e.g. a `PaystackCollectionProvider`
`implements CollectionProvider`) against the real API, keep the HMAC
`verifySignature`/`parseEvent` shape, and swap it into the factory. Because the
mocks use the same HMAC-signed webhook scheme, the verification path you tested
offline is the one that runs in production.

---

## Currency-conversion flow

Implemented in [currencyService.ts](src/services/currency/currencyService.ts):

1. **Normalize + validate** the currency (must be supported) and amount
   (positive, finite). Unsupported → `INVALID_CURRENCY`.
2. **Rate:** NGN → `1` (no conversion). Otherwise fetch `from → NGN` from the
   `CurrencyProvider`. *The extension never computes the rate.*
3. **Base NGN** = `amount × rate`, rounded to 2dp.
4. **Spread** = `base × CURRENCY_SPREAD_PERCENT%` — applied **only on
   conversion**. NGN passthrough has no spread.
5. **`amountToTransferNGN`** = base + spread.
6. Persist the quote with `createdAt`/`expiresAt` (`QUOTE_EXPIRY_MINUTES`).

Worked: `20 USD × 1500 = 30000` → `+2% = 600` → **`30600`**.

---

## Transaction state machine

Single source of truth in
[stateMachine.ts](src/services/transactions/stateMachine.ts). Every transition is
guarded — an illegal move throws `INVALID_STATE_TRANSITION`, and only
`TransactionService` applies transitions (appending an audit event each time).

```
CREATED → QUOTE_CREATED → AWAITING_TRANSFER → TRANSFER_CONFIRMED
   → CARD_CREATING → CARD_FUNDED → PAYMENT_PROCESSING → PAYMENT_SUCCESSFUL
```

Failure / terminal states: `QUOTE_EXPIRED`, `TRANSFER_FAILED`,
`CARD_CREATION_FAILED`, `CARD_FUNDING_FAILED`, `PAYMENT_FAILED`,
`REFUND_PENDING → REFUNDED`.

The internal status is mapped to the extension's four-value union via
`toSimplifiedStatus`:

| Internal | Simplified |
| --- | --- |
| CREATED, QUOTE_CREATED, AWAITING_TRANSFER | `pending` |
| TRANSFER_CONFIRMED, CARD_CREATING, CARD_FUNDED, PAYMENT_PROCESSING | `processing` |
| PAYMENT_SUCCESSFUL | `successful` |
| any failure state | `failed` |

---

## Virtual-card flow

Driven by [paymentOrchestrator.ts](src/services/payments/paymentOrchestrator.ts)
once a transfer is verified:

1. `CARD_CREATING` → **create a restricted card** via `CardService`: single-use,
   spend limit = exact `amountToTransferNGN`, currency NGN, merchant-locked where
   supported.
2. Persist only the opaque `cardReference` on the transaction.
3. **Fund** the card with the exact NGN amount → `CARD_FUNDED`.
4. `PAYMENT_PROCESSING` → **authorize** the card at the merchant via
   `MerchantPaymentAdapter`. On success → `PAYMENT_SUCCESSFUL` (records
   `merchantAuthorizationId`); on decline → `PAYMENT_FAILED`.

**No raw PAN/CVV is ever stored, returned, or logged** — only provider token
references. Card creation/funding failures map to `CARD_CREATION_FAILED` /
`CARD_FUNDING_FAILED`.

---

## Webhook flow

Funding is confirmed **only** by a verified provider webhook — never by the
user's `/confirm` claim.

1. `express.json({ verify })` captures the exact **raw body bytes** on every
   request (needed for a correct HMAC).
2. The webhook controller pulls the raw body + signature header and hands them to
   the handler.
3. `TransferService`:
   - **Verify HMAC** (constant-time) → else `401 INVALID_WEBHOOK_SIGNATURE`.
   - **Parse + validate** the event (Zod).
   - **Dedupe** by event id (TTL cache) — replays are safe no-ops.
   - Match the `reference` to a transaction; require it be `AWAITING_TRANSFER`.
   - **Verify amount + currency** (NGN, within tolerance) → else
     `400 TRANSFER_VERIFICATION_FAILED`.
   - Transition to `TRANSFER_CONFIRMED` and trigger the orchestrator.

**Signed webhook example** (matches the mock provider's scheme —
`sign = HMAC_SHA256(rawBody, PAYMENT_PROVIDER_SECRET)`):

```bash
SECRET="whsec_dev_change_me"
REF="BRIDGE-…"            # from the transaction's fundingInstructions.reference
BODY='{"event":"charge.success","data":{"id":"evt_1","reference":"'"$REF"'","amount":30600,"currency":"NGN","status":"success"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -s -X POST http://localhost:4000/api/v1/webhooks/payment-provider \
  -H "Content-Type: application/json" \
  -H "x-bridge-signature: $SIG" \
  -d "$BODY"
```

---

## Chrome-extension integration

Client: `../bridge-extension` (vanilla JS, no build). The service worker is the
only HTTP client; `js/config.js` `BRIDGE_API_KEY` **must equal** `.env` `API_KEY`.

Message map, detection, and Load unpacked: [bridge-extension/README.md](../bridge-extension/README.md).
Checkout polls `GET /transactions/:id` and drives the UI from `simplifiedStatus`
(`pending | processing | successful | failed`).

---

## Sandbox testing walkthrough

With `SIMULATE_TRANSFERS=true` and no FX key (offline), the whole flow runs
locally:

```bash
# 1. quote  ($20 → ₦30,600)
curl -s -X POST http://localhost:4000/api/v1/payment-quotes \
  -H "x-api-key: paron_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"amount":20,"currency":"USD"}'

# 2. transaction (returns id + NGN funding instructions, status AWAITING_TRANSFER)
curl -s -X POST http://localhost:4000/api/v1/transactions \
  -H "x-api-key: paron_dev_key_change_me" -H "Content-Type: application/json" \
  -d '{"quoteId":"<quoteId>","merchantName":"Acme Store"}'

# 3. confirm → auto-fires a correctly-signed webhook → full pipeline runs
curl -s -X POST http://localhost:4000/api/v1/transactions/<txnId>/confirm \
  -H "x-api-key: paron_dev_key_change_me"

# 4. poll until PAYMENT_SUCCESSFUL
curl -s http://localhost:4000/api/v1/transactions/<txnId> \
  -H "x-api-key: paron_dev_key_change_me"
```

### Automated in-process checks

The sandbox forbids binding a TCP port, so the suite drives the **real Express
app** in-process (full middleware chain, no socket):

```bash
node --import tsx __scratch/e2e.ts     # 41 checks: FX math, full pipeline, auth,
                                       # signature, idempotency, expiry, mismatch
node --import tsx __scratch/extra.ts   # 12 checks: card webhook, log redaction, FX selection
```

Both suites pass (`RESULT: … 0 failed`). They cover: the canonical FX example and
NGN passthrough, invalid-currency rejection, the end-to-end path to
`PAYMENT_SUCCESSFUL`, missing/invalid API key, bad webhook signature (tx
untouched), amount mismatch, duplicate-webhook no-op, expired-quote rejection,
unknown-transaction 404, Idempotency-Key replay, and PAN/CVV/secret redaction in
logs.

> `__scratch/` is git-ignored scaffolding, not part of the shipped service.

---

## Security model

- **No sensitive logic in the browser.** FX, spread, funding verification, card
  issuing, and merchant payment are all server-side.
- **Secrets stay server-side.** The extension holds only the client API key.
  Provider keys/secrets live in `.env` (git-ignored) and are never returned.
- **Funding is verified, not trusted.** A user's `/confirm` never funds anything;
  only a HMAC-verified, amount-matched provider webhook does.
- **No card data at rest or in logs.** Only opaque `cardReference` tokens are
  stored. The logger redacts PAN/CVV/secrets by key name **and** by value pattern
  (long digit runs), as defence-in-depth.
- **Constant-time comparisons** for the API key and webhook signatures.
- **Hardening:** `helmet` headers, CORS allow-list, per-route rate limits,
  request-size cap, Zod validation on every input, centralized error handling
  that never leaks internals in production.
- **No merchant browser-automation** with stored credentials — the final
  payment is an explicit, swappable card-authorization adapter.

---

## Production considerations

- **Persistence:** swap the in-memory `QuoteStore`/`TransactionStore`
  ([store/types.ts](src/store/types.ts)) for a real DB (Postgres/Prisma) — no
  service changes. Move idempotency + webhook-dedup caches to Redis.
- **Real providers:** implement `CardProvider`, `CollectionProvider`, and
  `MerchantPaymentAdapter` against live APIs and register them in their
  factories. Keep the HMAC webhook contract.
- **Secrets management:** load secrets from a vault/KMS rather than `.env`;
  rotate the API key and webhook secrets; issue per-client keys (or JWT) instead
  of one shared key.
- **PCI scope:** never let a PAN/CVV touch this service — use the issuer's
  tokenized/hosted card retrieval so full card details go provider → client
  out-of-band.
- **Refunds & reconciliation:** implement the `REFUND_PENDING → REFUNDED` path
  and a reconciliation job against provider settlement reports; the
  card-provider webhook is the seam for asynchronous authorization results.
- **Observability:** ship the structured logs to a collector, add metrics/traces
  keyed by `x-request-id`, and alert on failure-state transitions.
- **Delivery:** run behind a TLS-terminating proxy (`trust proxy` is already
  set), add per-endpoint quotas, and gate deploys on `npm run typecheck` +
  `npm run build`.
```
