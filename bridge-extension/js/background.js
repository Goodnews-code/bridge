// Bridge service worker — the extension's single point of contact with the
// backend. All backend fetches live here: because the worker holds
// host_permissions for the API origin, its cross-origin requests bypass CORS
// (no preflight). Content scripts and extension pages never touch the network
// or the API key — they talk to this worker via chrome.runtime messages, and
// chrome.storage.session stays worker-owned.
importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true, sessions: [] });
});

/**
 * Call the Bridge backend and normalize the result.
 *   success → { ok: true,  status, data }
 *   failure → { ok: false, status, code, message }   (HTTP error or network)
 * Unwraps the backend's { ok, data } / { ok, error } envelope so callers only
 * deal with data/code.
 */
async function api(path, { method = "GET", body } = {}) {
  const headers = { "x-api-key": BRIDGE_API_KEY };
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BRIDGE_API_BASE}${path}`, init);
  } catch (_error) {
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: `Cannot reach the Bridge backend at ${BRIDGE_API_BASE}. Is it running?`,
    };
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch (_error) {
    /* some 2xx responses may carry no JSON body */
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: payload && "data" in payload ? payload.data : null };
  }

  const error = (payload && payload.error) || {};
  return {
    ok: false,
    status: res.status,
    code: error.code || "REQUEST_FAILED",
    message: error.message || `Request failed (${res.status}).`,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_QUOTE") {
    getQuote(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === "OPEN_CHECKOUT") {
    const originTabId = sender.tab && sender.tab.id;
    const originUrl = sender.tab && sender.tab.url;
    if (!originTabId) {
      sendResponse({ ok: false, error: "Missing origin tab" });
      return false;
    }
    openCheckout(originTabId, originUrl, message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "GET_TRANSACTION") {
    const id = message.payload && message.payload.transactionId;
    if (!id) {
      sendResponse({ ok: false, error: "Missing transaction id" });
      return false;
    }
    const key = `txn:${id}`;
    chrome.storage.session.get(key, (data) => {
      const stored = data[key];
      if (!stored) {
        sendResponse({ ok: false, error: "Unknown transaction" });
        return;
      }
      sendResponse({ ok: true, ...stored });
    });
    return true;
  }

  if (message.type === "CONFIRM_TRANSFER") {
    const id = message.payload && message.payload.transactionId;
    if (!id) {
      sendResponse({ ok: false, error: "Missing transaction id" });
      return false;
    }
    api(`/api/v1/transactions/${encodeURIComponent(id)}/confirm`, { method: "POST" }).then(
      (result) =>
        sendResponse(
          result.ok
            ? { ok: true, data: result.data }
            : { ok: false, error: result.message, code: result.code }
        )
    );
    return true;
  }

  if (message.type === "GET_STATUS") {
    const id = message.payload && message.payload.transactionId;
    if (!id) {
      sendResponse({ ok: false, error: "Missing transaction id" });
      return false;
    }
    api(`/api/v1/transactions/${encodeURIComponent(id)}`, { method: "GET" }).then((result) =>
      sendResponse(
        result.ok
          ? {
              ok: true,
              simplifiedStatus: result.data.simplifiedStatus,
              status: result.data.status,
              transaction: result.data,
            }
          : { ok: false, error: result.message, code: result.code }
      )
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

/**
 * GET_QUOTE → POST /payment-quotes. Returns the backend quote view on success,
 * or { error } (matching the existing consumer check) on failure.
 */
async function getQuote({ amount, currency, merchant } = {}) {
  const result = await api("/api/v1/payment-quotes", {
    method: "POST",
    body: {
      amount: Number(amount),
      currency: (currency || "USD").toUpperCase(),
      ...(merchant ? { merchantName: merchant } : {}),
    },
  });
  if (!result.ok) return { error: result.message, code: result.code };
  return result.data;
}

/**
 * OPEN_CHECKOUT → create a transaction from the live quote, then hand the tab
 * off to the checkout page. If the quote expired between offer and click
 * (409 QUOTE_EXPIRED), re-quote once from the detection carried in the payload
 * and retry. Stores the funding instructions in session storage for the
 * checkout page to read, and remembers the origin URL for the return trip.
 */
async function openCheckout(tabId, originUrl, payload = {}) {
  const { amount, currency, merchant, quoteId, sourceUrl } = payload;
  const merchantName = merchant || "Foreign merchant";

  let create = await createTransaction(quoteId, merchantName, sourceUrl);

  if (!create.ok && create.code === "QUOTE_EXPIRED") {
    const requote = await api("/api/v1/payment-quotes", {
      method: "POST",
      body: { amount: Number(amount), currency: (currency || "USD").toUpperCase(), merchantName },
    });
    if (requote.ok) {
      create = await createTransaction(requote.data.quoteId, merchantName, sourceUrl);
    }
  }

  if (!create.ok) {
    return { ok: false, error: create.message, code: create.code };
  }

  const { transaction, fundingInstructions } = create.data;

  await chrome.storage.session.set({
    [`txn:${transaction.id}`]: {
      transaction,
      fundingInstructions,
      merchant: merchantName,
      amount: transaction.merchantAmount,
      currency: transaction.merchantCurrency,
    },
    [`origin:${tabId}`]: { originUrl, detection: payload },
  });

  await chrome.tabs.update(tabId, {
    url: chrome.runtime.getURL(`pages/checkout.html?txn=${encodeURIComponent(transaction.id)}`),
  });

  return { ok: true, transactionId: transaction.id };
}

function createTransaction(quoteId, merchantName, sourceUrl) {
  if (!quoteId) {
    return Promise.resolve({ ok: false, code: "NO_QUOTE", message: "Missing quote id." });
  }
  return api("/api/v1/transactions", {
    method: "POST",
    body: {
      quoteId,
      merchantName,
      ...(isHttpUrl(sourceUrl) ? { sourceUrl } : {}),
    },
  });
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

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

  if (payload && payload.sessionId) {
    await chrome.storage.session.remove(`txn:${payload.sessionId}`);
  }

  if (!origin || !origin.originUrl) return;

  await chrome.storage.session.set({ [`receipt:${tabId}`]: payload });
  await chrome.storage.session.remove(originKey);
  await chrome.tabs.update(tabId, { url: origin.originUrl, active: true });
}
