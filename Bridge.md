# Bridge

Hackaholics 7.0 (Lagos). Pay a foreign checkout in Naira from Chrome. No Grey, no personal virtual dollar card.

How to run the prototype: [README.md](./README.md).

## The idea

To pay ChatGPT, Canva, or any dollar checkout, most people in Nigeria open Grey (or similar), do extra KYC, wait for a virtual USD card, fund it, then pay. They only wanted to finish one checkout.

Remita already does this for local billers: you get a reference, pay from your bank, Remita settles the merchant. You do not need a Remita wallet.

Bridge is that pattern for foreign sites. Install the extension. On a dollar payment page it asks if you want to pay in Naira. You transfer ₦ from a Wema/ALAT (or other Nigerian bank) account. Wema converts and pays the merchant. You never hold a dollar card. The bank’s FX desk does.

## Why Wema

Grey sits around the bank and issues the user a card. Wema is a licensed FX dealer. Collection (ALAT, NIP, NUBAN), conversion, and settlement can all stay inside the bank. The checkout is the thing to own, not lose to Grey.

The user still has a bank account. They skip the extra fintech app and the virtual card.

## Not this

- Not a consumer virtual USD card (that is Grey).
- Not filling Stripe/PayPal card fields (PCI, and the iframe will block it). Redirect to our Naira checkout.
- Not every site on the internet on day one. Detect known checkouts, then expand.

## What the user sees

Browsing as usual. Extension spots a foreign checkout (Stripe, PayPal, Paddle, etc.). Overlay: this looks like $12.99, pay ₦X with Bridge? No: original payment continues. Yes: Bridge checkout with locked quote, Naira total, transfer details, then status (awaiting Naira → converting → paying merchant → done) and a receipt.

Grey user: extra account + card. Bridge user: bank account they already have. Bridge/Wema: pooled FX wallet / corporate card / SWIFT. The heavy kit is on the operator, not the payer.

## Settlement (say this to judges)

Someone still has to deliver USD to the merchant. That someone is the bank, not the user.

Hackathon: sandbox pooled card and pipeline states. Do not claim a live Stripe charge unless you have a sandbox. Demo a merchant page you control, take ₦ (mock or real transfer), show converted → merchant paid.

Do not mark settled if the pay attempt never ran. If ChatGPT expects *their* card on *their* customer, a pooled card may not upgrade that login. Use a demo merchant or a pay-link where the receipt is enough.

## vs Grey vs Remita

| | Grey / GreenNext | Remita | Bridge |
|---|---|---|---|
| User installs | App + KYC + virtual card | Nothing extra for the payer | Chrome extension |
| User holds USD card | Yes | No | No |
| Pays in | USD via card | NGN | NGN |
| Who settles | Card network | Remita + banks | Wema FX + pooled rail |
| Best for | Repeat dollar spend | Local billers | Foreign checkout without a card app |

## Risks

- Stripe/PayPal iframes: we redirect, we do not fill their form.
- FX is bank-operated checkout, not a BDC in a browser. Payer already has Wema KYC.
- Detecting every gateway on the web is infinite. Demo 1–2 pages you control.
