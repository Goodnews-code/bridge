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
| `bridge-web/` | Landing page and public demo checkout |

## Permissions

- `storage` — remember on/off and demo sessions
- `tabs` — return you to the merchant page after pay
- `https://open.er-api.com/*` — live USD→NGN quote

Bridge does not read card numbers.
