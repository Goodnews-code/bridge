# Bridge

Pay a foreign (USD / EUR / GBP) checkout in **Naira**. You do not need Grey or a personal virtual dollar card.

Chrome cannot install this from a website in one click. Load the unpacked folder from this repo.

## Install the extension

1. Clone or download this repo  
   [https://github.com/Goodnews-code/bridge](https://github.com/Goodnews-code/bridge)
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `bridge-extension` folder (the one that contains `manifest.json`)
6. Pin **Bridge** in the Chrome toolbar

If Chrome already had an older copy, click **Reload** on the Bridge card.

## Try it

1. Click the Bridge icon → **Open demo checkout**  
   or open `bridge-extension/pages/demo-store.html` in Chrome
2. On the fake USD checkout, click **Pay in Naira**
3. Confirm on the Bridge screen. The demo page should return as **Payment successful**

If you open a local `file://` page and the overlay does not appear: `chrome://extensions` → Bridge → **Allow access to file URLs**.

## Folders

| Folder | What it is |
|---|---|
| `bridge-extension/` | Chrome extension — **Load unpacked** this folder |
| `bridge-backend/` | Express API (quotes, transfers, risk gate via `bridge-ml`) |
| `bridge-ML/` | Standalone FX risk model (`bridge-risk-logit-sklearn-v1`) |
| `bridge-web/` | Landing page and public demo checkout |

## How the pieces connect

```
Extension (overlay / checkout)
  → POST /api/v1/payment-quotes  (+ deviceId, merchant, sourceUrl)
    → bridge-backend risk gate
      → bridge-ml logistic scorer (allow | review | deny)
    → NGN quote (+ risk payload) OR 403 RISK_BLOCKED
  → overlay shows score / model; deny shows blocked UI
```

Popup status line hits `GET /health`, which reports the loaded ML model id.

## Permissions

- `storage` — remember on/off and demo sessions
- `tabs` — return you to the merchant page after pay
- `http://localhost:4000/*` — Bridge backend (quotes + settlement)

Bridge does not read card numbers.

## Backend (required for Pay in Naira)

1. In `bridge-backend`:
   ```powershell
   copy .env.example .env
   npm install
   npm run dev
   ```
2. Confirm `http://localhost:4000/health` responds.
3. Reload the Bridge extension on `chrome://extensions` (version **0.2.3**).
4. Open demo checkout → Pay in Naira → confirm transfer.

The extension sends `x-api-key` from `bridge-extension/js/config.js` (must match `API_KEY` in `.env`).

### Risk / ML gate

Every quote runs `bridge-risk-logit-v1` (logistic score on amount, velocity, merchant pattern, hour, **new vs returning device**, **mock IP/country risk bucket**). Response includes `risk: { score, decision, reasons, context }`. `deny` returns `403 RISK_BLOCKED` when `RISK_BLOCK_ON_DENY=true`. FX math stays deterministic — ML only gates whether to open a session.
