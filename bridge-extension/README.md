# Bridge — install and go live

Chrome **cannot** one-click install from a website the way an Android APK can. Google only allows that from the **Chrome Web Store**. For Hackaholics we ship a zip + Load unpacked (minutes), then optionally submit the Store (days).

## Install on this laptop (now)

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder  
   `bridge-extension`  
   (the folder that contains `manifest.json`)
5. Click **Reload** on Bridge if it was already installed (version `0.1.8`)
6. Pin Bridge
7. Click the extension icon → **Open demo checkout**  
   Pay in Naira → confirm payment. The same page should return showing **Payment successful**.

If you open a local HTML file (`file://`) and the overlay does not appear, on `chrome://extensions` → Bridge → enable **Allow access to file URLs**.

## Folder layout

```
bridge-extension/
  manifest.json
  pages/     HTML only (popup, checkout, demo store, overlay)
  css/       styles only (tokens, popup, checkout, overlay, paid)
  js/        scripts only (background, content, popup, checkout)
  icons/
```

| Path | Job |
|---|---|
| `manifest.json` | Chrome registration |
| `js/background.js` | FX quote, navigate to checkout, save sessions |
| `js/content.js` | Detects checkout pages |
| `js/overlay-ui.js` | Loads `pages/overlay.html` + `css/overlay.css` |
| `pages/popup.html` | Toolbar popup |
| `pages/checkout.html` | Naira pay screen |
| `pages/demo-store.html` | Fake USD checkout |

## Make it downloadable for anyone (today)

1. Zip `bridge-extension` (manifest.json at the **inside** of the zip folder).
2. Put the zip next to `bridge-web/index.html`.
3. Deploy `nairadirect-web` to Vercel / Netlify / GitHub Pages.
4. Share that URL. People download the zip, unzip, Load unpacked.

## Permissions we asked for

- `storage` — remember on/off and demo sessions
- `https://open.er-api.com/*` — live USD→NGN rate
- Content script on http/https — to see checkout pages

We do **not** read card numbers.
