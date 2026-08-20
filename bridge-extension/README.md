# Bridge extension

Chrome MV3 client for Bridge. **Load unpacked this folder** (the one with `manifest.json`).

Full-stack demo (API + extension + sample checkout): **[root README](../README.md)**. This file is only this package — layout, detection, worker messages, permissions, and how to zip it.

---

## Layout

```
bridge-extension/
  manifest.json
  pages/     popup, checkout, demo store, overlay
  css/       tokens, popup, checkout, overlay, paid
  js/        service worker, content, overlay UI, checkout
  icons/
```

| Path | Job |
|---|---|
| `js/config.js` | `BRIDGE_API_BASE` + `BRIDGE_API_KEY` (must match backend `.env` `API_KEY`) |
| `js/background.js` | Only process that talks to the API; owns `chrome.storage.session` |
| `js/content.js` | Detects checkout pages, requests a quote, mounts overlay |
| `js/overlay-ui.js` | Offer + risk-blocked UI (`pages/overlay.html`) |
| `js/checkout.js` | Naira transfer screen; polls settlement |
| `pages/popup.html` | Toolbar: enable/disable, demo, backend health |
| `pages/demo-store.html` | Fake USD $12.99 checkout |

After changing `config.js` or `manifest.json`, **Reload** the extension on `chrome://extensions`.

---

## Detection

`content.js` runs on `http://*/*`, `https://*/*`, and `file://*/*`. It offers Pay in Naira only when all of these are true:

1. Checkout context — known hosts (Stripe, PayPal, Paddle, Lemon Squeezy, Paystack, …), a checkout-like path, or strong “pay / order total” wording
2. A pay / subscribe / place-order control exists
3. A total in **USD, EUR, GBP, JPY, CAD, AUD, or NGN** can be parsed (labelled “total” preferred, else the largest money figure)

Ordinary product pages stay silent. Detection watches the DOM for ~12s (SPAs). A down backend is retried until that deadline; `RISK_BLOCKED` stops and shows the blocked overlay.

The worker is the only HTTP client (host permissions skip CORS). Pages send `chrome.runtime` messages; they never hold the API key.

---

## Worker messages

| Type | Backend / storage |
|---|---|
| `GET_QUOTE` | `POST /api/v1/payment-quotes` (idempotency key + persistent `deviceId`) |
| `OPEN_CHECKOUT` | `POST /api/v1/transactions`; on `409 QUOTE_EXPIRED` re-quote once; open `checkout.html?txn=` |
| `GET_TRANSACTION` | Funding instructions from `chrome.storage.session` |
| `CONFIRM_TRANSFER` | `POST /api/v1/transactions/:id/confirm` |
| `GET_STATUS` | `GET /api/v1/transactions/:id` |
| `SETTLEMENT_COMPLETE` | Restore merchant tab, stash receipt |
| `CLAIM_RECEIPT` | Merchant page reads the receipt once |
| `CHECK_BACKEND` | `GET /health` |

API shapes and error codes: [bridge-backend/README.md](../bridge-backend/README.md).

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | On/off, recent sessions, stable `deviceId` |
| `tabs` | Open checkout, return to the merchant URL |
| `http://localhost:4000/*`, `http://127.0.0.1:4000/*` | Quotes and settlement |

Does **not** read card numbers or fill Stripe/PayPal iframes. Pay in Naira **redirects** to our checkout.

---

## Zip for the landing page

Chrome cannot one-click install from a website (Chrome Web Store only). For Hackaholics:

1. Zip **this folder** so `manifest.json` is at the **root of the zip**
2. Put the zip next to `bridge-web/index.html`
3. Deploy `bridge-web`; people download, unzip, Load unpacked
