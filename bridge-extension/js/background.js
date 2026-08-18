const FEE_RATE = 0.015;
const FALLBACK_USDNGN = 1550;
const QUOTE_TTL_MS = 5 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true, sessions: [] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_QUOTE") {
    buildQuote(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "OPEN_CHECKOUT") {
    const originTabId = sender.tab && sender.tab.id;
    const originUrl = sender.tab && sender.tab.url;
    if (!originTabId || !originUrl) {
      sendResponse({ ok: false, error: "Missing origin tab" });
      return false;
    }

    const params = new URLSearchParams({
      amount: String(message.payload.amount),
      currency: message.payload.currency || "USD",
      merchant: message.payload.merchant || "Foreign merchant",
    });

    chrome.storage.session.set(
      {
        [`origin:${originTabId}`]: {
          originUrl,
          detection: message.payload,
        },
      },
      () => {
        chrome.tabs.update(originTabId, {
          url: chrome.runtime.getURL(`pages/checkout.html?${params.toString()}`),
        });
        sendResponse({ ok: true });
      }
    );
    return true;
  }

  if (message.type === "SETTLEMENT_COMPLETE") {
    const tabId = sender.tab && sender.tab.id;
    completeSettlement(tabId, message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "SAVE_SESSION") {
    chrome.storage.local.get({ sessions: [] }, ({ sessions }) => {
      const next = [message.payload, ...sessions].slice(0, 20);
      chrome.storage.local.set({ sessions: next }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "CLAIM_RECEIPT") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse(null);
      return false;
    }
    const key = `receipt:${tabId}`;
    chrome.storage.session.get(key, (data) => {
      const receipt = data[key] || null;
      if (!receipt) {
        sendResponse(null);
        return;
      }
      chrome.storage.session.remove(key, () => sendResponse(receipt));
    });
    return true;
  }

  return false;
});

async function completeSettlement(tabId, payload) {
  if (!tabId) return;

  const originKey = `origin:${tabId}`;
  const stored = await chrome.storage.session.get(originKey);
  const origin = stored[originKey];

  await chrome.storage.local.get({ sessions: [] }).then(({ sessions }) => {
    return chrome.storage.local.set({
      sessions: [payload, ...sessions].slice(0, 20),
    });
  });

  if (!origin || !origin.originUrl) return;

  await chrome.storage.session.set({ [`receipt:${tabId}`]: payload });
  await chrome.storage.session.remove(originKey);
  await chrome.tabs.update(tabId, { url: origin.originUrl, active: true });
}

async function buildQuote({ amount, currency }) {
  const sourceAmount = Number(amount);
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const code = (currency || "USD").toUpperCase();
  const usdNgn = await fetchUsdNgn();
  const sourceToUsd = code === "USD" ? 1 : await fetchCrossToUsd(code);
  const midNgn = sourceAmount * sourceToUsd * usdNgn;
  const fee = midNgn * FEE_RATE;
  const totalNgn = midNgn + fee;
  const rate = totalNgn / sourceAmount;

  return {
    sourceAmount,
    sourceCurrency: code,
    usdNgn,
    midNgn,
    fee,
    feeRate: FEE_RATE,
    totalNgn,
    rate,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
}

async function fetchUsdNgn() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await response.json();
    if (data.result === "success" && data.rates && data.rates.NGN) {
      return Number(data.rates.NGN);
    }
  } catch (_error) {
    /* fall through */
  }
  return FALLBACK_USDNGN;
}

async function fetchCrossToUsd(code) {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${code}`);
    const data = await response.json();
    if (data.result === "success" && data.rates && data.rates.USD) {
      return Number(data.rates.USD);
    }
  } catch (_error) {
    /* fall through */
  }
  return 1;
}
