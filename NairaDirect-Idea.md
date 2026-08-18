# Bridge

**Pay any foreign checkout in Naira from Chrome — no Grey, no virtual dollar card, no extra app account.**

**Hackathon:** Hackaholics 7.0 — Lagos (Yaba Tech)  
**Working name:** Bridge *(replace anytime)*  
**One-line pitch:** When a Nigerian hits a dollar checkout, a Wema Chrome extension converts the bill to Naira, they pay from their existing bank account, and Wema settles the merchant in FX in the background.

**Status:** v0 prototype exists in `nairadirect-extension/` (Chrome Load unpacked) and `nairadirect-web/` (install landing). Settlement is still simulated.

---

## 1. The idea in plain language

Today, if a Nigerian wants to pay for something priced in dollars — ChatGPT, Canva, a SaaS subscription, a course, Apple, AWS — they usually have to:

1. Download Grey / GreenNext / Pstock (or similar).
2. Create an account and complete KYC.
3. Wait for a **virtual dollar card**.
4. Fund that card.
5. Then pay the foreign site with the card.

That is extra apps, extra KYC, extra fees, and a card they did not want — they only wanted to complete one payment.

**Bridge is the Remita pattern applied to foreign checkouts.**

On Remita, you do not need a Remita wallet to pay a biller. You get a reference, pay from your bank, Remita settles the merchant.

On Bridge:

- You install a **Chrome extension**.
- You do **not** open Grey. You do **not** get a personal virtual USD card.
- When a payment page appears, the extension offers: *Pay this in Naira via Wema?*
- If yes: show the amount in ₦, user pays ₦ from an existing Wema/ALAT (or any Nigerian bank) account.
- In the background, **the platform / Wema** converts NGN → FX and pays the merchant.

The user never holds a dollar card. The **bank’s treasury** does the FX leg.

---

## 2. Problem

### Who is stuck

| Person | What they want | What they are forced to do |
|---|---|---|
| Student / professional | Pay ChatGPT, Notion, Coursera, Adobe | Open Grey, wait for a virtual card, fund USD |
| Freelancer / SME | Pay foreign tools, ads, domains, SaaS | Same card apps, or ask someone abroad to pay |
| Occasional payer | One $12 subscription, once | Full app onboarding for a single checkout |

### Why the current market is painful

Apps like **Grey, GreenNext, Pstock** solve FX access by issuing a **personal virtual card**. That model assumes:

- the user wants a reusable dollar card;
- they will complete a second KYC;
- they will keep a USD balance.

Most people in this flow only wanted **one checkout**. The card is a workaround, not the product they asked for.

### Why this is a Wema problem (not just a Chrome idea)

Wema is a licensed bank and an FX participant. Fintech card apps sit *around* the bank. Bridge sits *inside* the bank:

- NGN collection on Wema rails (ALAT, transfer, USSD, NGN card).
- FX conversion at a disclosed rate + fee.
- Settlement from a **Wema FX / nostro / pooled merchant-pay facility** — not a consumer virtual card.

That is the “why Wema should care” line: **own the FX checkout, not lose it to Grey.**

---

## 3. What we are *not* building

Say these out loud so the idea stays honest.

- **Not** a consumer virtual USD/GBP/EUR card (that is Grey).
- **Not** “no account anywhere.” The user still has a **bank account**. They skip the *FX-app* account and the *virtual card*.
- **Not** a full browser bank. Day 1 is **checkout interception + Naira pay + FX settle**.
- **Not** silent card-field injection into Stripe/PayPal iframes (PCI + blocked by the gateway).
- **Not** claiming we can pay *every* site on the internet on Day 1. We support **detected, allow-listed checkout types**, then expand.

---

## 4. Product shape

### Primary surface: Chrome extension

After install:

1. User is browsing normally.
2. Extension **detects a foreign payment context** (Stripe Checkout, PayPal, Paddle, Lemon Squeezy, “Pay $X”, etc.).
3. Prompt: *This looks like a $12.99 payment. Pay ₦19,850 with Bridge?*
4. **No** → they continue with whatever card/PayPal they already had.
5. **Yes** → leave the merchant card form; open **Bridge checkout** (extension popup or hosted Wema page).

### Bridge checkout (the actual product)

- Foreign amount + currency (e.g. USD 12.99)
- Live FX quote (NGN)
- Fee line (spread / service fee)
- **Total to debit in Naira**
- Pay with: Wema/ALAT, other-bank transfer (NIP), USSD (demo), NGN debit card
- Status: *Awaiting Naira → Converting → Paying merchant → Done*
- Receipt: NGN debit + FX rate + merchant / order reference

### Who the “account” belongs to

| Layer | Account? |
|---|---|
| Grey / virtual card app | Yes — user account + card |
| Bridge consumer | **No extra app.** Bank account they already have. Optional: remember last NUBAN for quotes |
| Bridge / Wema (backend) | **Yes** — pooled FX wallet, settlement card or SWIFT facility, ledger |

The Remita analogy holds for the **payer**. The **operator** (Wema) still has the heavy infrastructure. That is correct.

---

## 5. End-to-end user journey

```
User on foreign site (e.g. ChatGPT / Canva / a SaaS)
        │
        ▼
Payment page loads (Stripe / PayPal / “Pay $12.99”)
        │
        ▼
Chrome extension detects checkout
        │
        ├── User dismisses → original payment continues
        │
        └── User accepts “Pay in Naira”
                    │
                    ▼
           Quote engine
           $12.99 × rate + fee = ₦19,850
                    │
                    ▼
           User pays ₦19,850
           (ALAT / transfer / NGN card)
                    │
                    ▼
           Webhook: NGN received
                    │
                    ▼
           FX + settlement worker
           Wema converts NGN → USD
           Pays merchant from pooled FX rail
                    │
                    ▼
           User sees “Paid” + receipt
           Merchant sees a successful payment
```

---

## 6. System architecture (logical)

Four moving parts. The extension is only the front door.

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  ┌──────────────┐    ┌───────────────────────────────┐  │
│  │ Merchant     │    │ Bridge Chrome extension  │  │
│  │ checkout     │◄──►│ • content script (detect)     │  │
│  │ Stripe/PayPal│    │ • overlay prompt              │  │
│  └──────────────┘    │ • popup / tab for ₦ checkout  │  │
│                      └──────────────┬────────────────┘  │
└─────────────────────────────────────┼───────────────────┘
                                      │ HTTPS
                                      ▼
                       ┌──────────────────────────────┐
                       │  Bridge API             │
                       │  quote · session · pay ·     │
                       │  webhook · status            │
                       └──────┬───────────┬───────────┘
                              │           │
              ┌───────────────▼──┐   ┌────▼─────────────┐
              │  Wema / ALAT     │   │  FX + settlement │
              │  NGN collection  │   │  treasury rail   │
              │  transfer/USSD/  │   │  pooled USD pay  │
              │  NGN card        │   │  ledger + audit  │
              └──────────────────┘   └──────────────────┘
```

### Components

| Component | Job |
|---|---|
| **Content script** | Runs on the page. Looks for payment gateways / amounts / currency. Does **not** read card numbers. |
| **Background worker** | Extension service worker. Talks to API, holds session id, opens checkout tab. |
| **Overlay / prompt** | “Pay in Naira?” Yes / No. Non-blocking. |
| **Checkout UI** | Quote, pay, status. Can be extension popup for demo; hosted `pay.bridge.ng` for real PCI/NGN card. |
| **Quote service** | Amount + currency → NGN total. Rate from Wema FX (hackathon: CBN + spread or a fixed demo book). |
| **Collection service** | Create a Naira payment instruction (virtual NUBAN, ALAT pay, transfer reference). Confirm via webhook. |
| **Ledger** | Every session: foreign amount, rate, fee, NGN in, USD out, status, merchant hint. |
| **Settlement worker** | After NGN is confirmed: convert, pay merchant, mark complete, store evidence. |
| **Admin / ops (later)** | Failed settlements, refunds, rate disputes. Not Day 1 UI unless you have spare time. |

---

## 7. Pipeline in detail (the thing to implement later)

### Stage A — Detect

Content script on allow-listed hosts / patterns:

- URL: `checkout.stripe.com`, `paypal.com`, `pay.paddle.com`, `*.lemonsqueezy.com`, etc.
- DOM hints: `$`, `USD`, `Pay now`, Stripe Elements mount (visible chrome, **not** iframe card fields).
- Extract: `amount`, `currency`, `merchant_name` if visible, `page_url`.

**If uncertain, do not force.** Offer a manual “Pay this page in Naira” from the extension icon.

Output: `DetectionEvent { amount, currency, merchant, confidence }`.

### Stage B — Offer

If `currency != NGN` and confidence ≥ threshold:

- Show overlay with **indicative** ₦ amount (cached rate is enough).
- Buttons: **Pay in Naira** / **Not now**.

### Stage C — Quote (lock)

`POST /v1/quotes`

```json
{
  "source_amount": 12.99,
  "source_currency": "USD",
  "merchant": "ChatGPT",
  "page_url": "https://checkout.stripe.com/..."
}
```

Response: quote id, NGN total, rate, fee, **expires_at** (e.g. 5 minutes).  
A locked quote is what the user pays. Do not reprice after they click pay.

### Stage D — Collect Naira

`POST /v1/sessions` with `quote_id` → create **Payment Session**.

Collection options (pick one for the hackathon demo, list the rest as Wema path):

1. **Dedicated virtual NUBAN** for this session (best Remita analogue).
2. **ALAT in-app / redirect** if Wema API exists.
3. **Paystack/Flutterwave NGN card** (ironic but fine for a prototype; story is still “user pays Naira”).
4. **Simulated pay** button for judges if banking APIs are not issued in time.

Webhook: `payment.received` → session `NGN_RECEIVED`.

### Stage E — Settle FX to merchant *(the hard stage)*

User-facing story: “we pay the third party; you never get a virtual card.”

Operator reality: **someone** must still deliver USD/EUR to the merchant. Options:

| Option | How it works | Hackathon? | Production? |
|---|---|---|---|
| **A. Pooled platform card** | Wema/Bridge holds **one** corporate FX card. Settlement worker pays the merchant as the platform. User never sees a card. | Demo with a sandbox card or a recorded success | Yes — still a card, but not *the user’s* card |
| **B. Merchant-of-record** | Bridge is the billed buyer; you provision access separately. Ugly for SaaS logins. | No | Rare |
| **C. Wema FX + SWIFT/card acquiring** | Debit NGN, sell FX, pay via bank FX rails / partner acquirer | Slide + mock | The real Wema product |
| **D. Merchant plugin** | Site adds “Pay with Bridge” like PayPal. Cleanest long-term, not a pure extension. | Optional fake merchant page | Phase 2 |
| **E. Manual ops** | Ops pays from a Grey/Wema FX desk after NGN lands | Emergency only | Not a product |

**Honest architecture for the pitch:** the *user* has no virtual card. The *bank* uses a **pooled FX settlement facility** (corporate card or FX payment rail). That is still a different product from Grey.

**Hackathon settlement:** do not promise live Stripe completion unless you have a sandbox. Demo path:

1. Mock merchant page with a $ checkout.
2. Extension offers Bridge.
3. User pays ₦ (real NUBAN *or* mock confirm).
4. Dashboard shows: Converted → **Merchant paid (sandbox)** → receipt.

Judges need to see the **pipeline states**, not a live OpenAI charge.

### Stage F — Confirm

Session `SETTLED`. Extension / email / in-page: paid. Store rate, NGN, FX, timestamps for disputes.

---

## 8. Data flow (session lifecycle)

```
DETECTED
  → QUOTED (rate locked)
    → AWAITING_NGN
      → NGN_RECEIVED
        → FX_CONVERTING
          → MERCHANT_PAYING
            → SETTLED
            → FAILED_SETTLEMENT (refund / retry)
      → EXPIRED / CANCELLED
```

Every state change is an append-only ledger row. Banks care about this more than the overlay.

---

## 9. How this plugs into Wema

Do not say “the bank.” Name the seats.

```
Chrome checkout
    → Bridge quote API
        → Wema FX rate / treasury book
        → Wema NGN collection (ALAT / NIP / NUBAN)
        → Wema FX conversion (authorized dealer)
        → Pooled FX settlement (corporate card or payment rail)
        → Ledger + receipt (audit, CBN reporting later)
```

| Wema capability | Role |
|---|---|
| ALAT / NUBAN / NIP | Collect Naira without a new “Grey” app |
| FX desk / authorized dealer | Legal NGN→USD (this is the moat vs card apps) |
| Cards / acquiring partners | Pooled settlement, not consumer virtual cards |
| ALAT Business / SME | Same flow for a business paying foreign SaaS |

---

## 10. Chrome extension internals (when you build)

Manifest V3:

| Piece | Role |
|---|---|
| `manifest.json` | Permissions: `activeTab`, host patterns for known checkouts, `storage` |
| Content script | Detect + overlay. No card data. |
| Service worker | API calls, quote cache, open checkout tab |
| Popup | Manual trigger + last session status |
| Hosted checkout page | Actual pay UI (safer than stuffing NGN card PAN in the extension) |

**Do not** scrape PAN/CVV from Stripe iframes. That is PCI and will get you killed in a bank hackathon.

---

## 11. Risks (say them before judges do)

| Risk | Why it matters | How we answer |
|---|---|---|
| **Settlement** | Without a pooled FX rail, “we pay the merchant” is theatre | Pitch Wema treasury; demo sandbox states |
| **Stripe/PayPal iframes** | Extension cannot complete their card form | We **redirect** to our ₦ checkout; we do not fill their card fields |
| **Merchant must get paid** | If we only take ₦ and never pay USD, it is fraud | Ledger + settlement worker; never mark SETTLED without a pay attempt |
| **FX regulation** | CBN rules on invisible trade, IMT, documentation | Product is bank-operated FX checkout, not a BDC in a browser |
| **KYC** | “No account” ≠ anonymous | Payer is an existing bank customer; Wema KYC already done. Extension is not a new identity store |
| **Chargebacks / SaaS login** | Paying from a pooled card may not attach to the user’s Stripe customer | Phase 1: checkouts where pay-by-link / email receipt is enough; document the gap |
| **Scope** | Detecting “any payment gateway on the web” is infinite | Allow-list 2–3 demo checkouts for the hackathon |

The **SaaS login** gap is real: if ChatGPT expects *their* card on *their* Stripe customer, a pooled card paid from another session may not upgrade *that* login. For the hackathon, use a **demo merchant** you control, or a “pay invoice / pay link” flow where the payer email matches.

---

## 12. Hackathon cut vs later product

### Build in 3 days (if we proceed)

- Chrome extension: detect 1–2 **demo** checkout pages + manual icon click
- Overlay: Yes / No
- Quote API + locked rate
- Naira checkout page (mock pay **or** one real transfer reference)
- Status pipeline UI: NGN received → converting → settled
- README + live URL + Loom (Technical Guide rules still apply)

### Do not build in 3 days

- Real Grey-killer covering all of Stripe
- Consumer virtual cards
- Instagram-level scraping of random sites
- Full CBN reporting pack
- Production FX dealing

---

## 13. Competitive frame (one slide)

| | Grey / GreenNext / Pstock | Remita | **Bridge** |
|---|---|---|---|
| User installs | App + KYC + virtual card | Nothing extra for payer | Chrome extension |
| User holds USD card | Yes | No | **No** |
| Pays in | USD via card | NGN | **NGN** |
| Who settles merchant | Card network | Remita + banks | **Wema FX + pooled rail** |
| Best for | Repeat dollar spend | Local billers | **Foreign checkout, occasional or repeat, no card app** |

---

## 14. Open points for the team to add

Add anything we did not capture:

1. **Exact name** of the product.
2. **Which foreign sites** are in-scope for the live demo (must be pages you control, or public pay-links).
3. **How NGN is collected** on Wednesday (mock vs real Wema/NUBAN vs Paystack NGN).
4. **Settlement story for judges** — sandbox pooled card vs “Wema FX desk” animation vs both.
5. **Wema API access** (if any keys / sandbox were given on Day 1).
6. **Fees** — flat ₦, % of USD, or FX spread only.
7. **Repeat users** — remember nothing vs remember NUBAN only.

---

## 15. Recommendation

The idea is **stronger for Wema than VeriTrust** if you stay honest about settlement:

- Real problem: Nigerians should not need a virtual dollar card for a checkout.
- Real tech: extension + quote + NGN pay + FX worker.
- Real Wema plug-in: collection + authorized FX + pooled settlement.

The idea **fails** if you tell judges “we pay Stripe with no FX instrument at all.” The instrument exists; it is **the bank’s**, not the user’s.

Next lock before any code: **demo merchant page + NGN collection method + how SETTLED is shown.**
