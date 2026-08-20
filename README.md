# Bridge

**Pay a foreign checkout in Naira — no Grey, no personal virtual dollar card.**

When a Nigerian hits a USD / EUR / GBP checkout, the Chrome extension quotes the bill in ₦, they transfer from a bank they already have, and the backend settles the merchant from a **pooled bank-side rail**. The user never holds a dollar card.

Hackathon: **Hackaholics 7.0** (Lagos). Sandbox prototype — mock adapters, no real money. Repo: [github.com/Goodnews-code/bridge](https://github.com/Goodnews-code/bridge)

Product narrative (why Wema, settlement honesty): [Bridge.md](./Bridge.md).

---

## Packages

| Folder | Job | Docs |
|---|---|---|
| [`bridge-extension/`](./bridge-extension/) | Detect checkout, overlay, Naira pay UI | [README](./bridge-extension/README.md) |
| [`bridge-backend/`](./bridge-backend/) | Quotes, NGN collection, mock FX settlement | [README](./bridge-backend/README.md) |
| [`bridge-ML/`](./bridge-ML/) | Logistic risk scorer (train + TypeScript runtime) | [README](./bridge-ML/README.md) |
| [`bridge-web/`](./bridge-web/) | Install landing + public demo page | `index.html`, `demo.html` |

The extension never sees FX keys, card PANs, or webhook secrets.

---

## Quick start

Need **Chrome**, **Node.js 20+**, and **npm**. Two processes: API on `:4000`, then the unpacked extension.

```powershell
cd bridge-backend
copy .env.example .env
npm install
npm run dev
```

Confirm [http://localhost:4000/health](http://localhost:4000/health) is `ok`. `API_KEY` in `.env` must match `bridge-extension/js/config.js`.

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → select `bridge-extension` (must show version **0.2.5**; **Reload** if an older copy is loaded) → pin Bridge → **Open demo checkout** → Pay in Naira → **I have paid this Naira amount**.

You should return to the demo store with **Payment successful**. For `file://` pages, enable **Allow access to file URLs** on the extension card.

`.env.example` sets `SIMULATE_TRANSFERS=true` so confirm completes offline.

---

## How the pieces connect

```
Merchant / demo page
  → content script (detect total + pay button)
  → service worker  POST /api/v1/payment-quotes
  → overlay “Pay ₦X?”
  → service worker  POST /api/v1/transactions
  → checkout.html?txn=…  (funding instructions)
  → POST /transactions/:id/confirm  (sandbox fires a signed webhook)
  → poll GET /transactions/:id  until successful
  → back to merchant + receipt
```

Static demo book: **$20 × ₦1,500 + 2% spread = ₦30,600**. NGN amounts pass through with no spread. Settlement uses a pooled platform card (not a consumer Grey card).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Overlay never appears | Reload the extension. `file://` → allow file URLs. Page needs a pay button and a supported-currency total |
| Popup: backend offline | API not running — `npm run dev` in `bridge-backend`, then open `/health` |
| Quote 401 | `config.js` key ≠ `.env` `API_KEY`; reload the extension |
| “No transaction reference” | Reload extension and start again from Pay in Naira |
| Stuck on Confirming | `SIMULATE_TRANSFERS=true` in `.env`, restart the API |
| Old overlay | Reload until the card shows **0.2.5** |

---

## Where details live

Do not duplicate these here — open the package README:

- Install / zip / detection / permissions → [bridge-extension/README.md](./bridge-extension/README.md)
- Env vars, API, providers, webhooks, state machine → [bridge-backend/README.md](./bridge-backend/README.md)
- Train / export the risk model → [bridge-ML/README.md](./bridge-ML/README.md)
