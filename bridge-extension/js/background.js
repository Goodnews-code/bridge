importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true, sessions: [] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_QUOTE") {
    createBackendQuote(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse(toErrorPayload(error)));
    return true;
  }

  if (message.type === "CHECK_BACKEND") {
    checkBackendHealth()
      .then(sendResponse)
      .catch((error) => sendResponse(toErrorPayload(error)));
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
    if (message.payload.quoteId) params.set("quoteId", message.payload.quoteId);

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

  if (message.type === "CREATE_TRANSACTION") {
    createBackendTransaction(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse(toErrorPayload(error)));
    return true;
  }

  if (message.type === "CONFIRM_PAYMENT") {
    confirmBackendPayment(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse(toErrorPayload(error)));
    return true;
  }

  if (message.type === "GET_PAYMENT_STATUS") {
    getBackendPaymentStatus(message.payload)
      .then(sendResponse)
      .catch((error) => sendResponse(toErrorPayload(error)));
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

function toErrorPayload(error) {
  return {
    error: error.message || "Request failed",
    code: error.code || null,
    details: error.details || null,
  };
}

async function checkBackendHealth() {
  const response = await fetch(`${BRIDGE_API_BASE}/health`);
  if (!response.ok) {
    throw Object.assign(new Error(`Health check failed (${response.status})`), {
      code: "BACKEND_DOWN",
    });
  }
  const body = await response.json();
  return body.data || body;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${BRIDGE_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BRIDGE_API_KEY,
      ...(options.headers || {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }

  if (!response.ok || !body || body.ok === false) {
    const errBody = body && body.error ? body.error : null;
    const message =
      (errBody && errBody.message) || `Backend error (${response.status})`;
    const error = new Error(message);
    error.code = (errBody && errBody.code) || `HTTP_${response.status}`;
    error.details = (errBody && errBody.details) || null;
    throw error;
  }

  return body.data;
}

function mapQuote(data) {
  const sourceAmount = Number(data.originalAmount);
  const totalNgn = Number(data.amountToTransferNGN);
  const midNgn = Number(data.baseAmountNGN);
  const fee = Number(data.spreadAmountNGN);
  const spreadPercent = Number(data.spreadPercent);
  return {
    quoteId: data.quoteId,
    sourceAmount,
    sourceCurrency: data.currency,
    midNgn,
    fee,
    feeRate: spreadPercent / 100,
    spreadPercent,
    totalNgn,
    rate: sourceAmount > 0 ? totalNgn / sourceAmount : Number(data.exchangeRate),
    exchangeRate: Number(data.exchangeRate),
    expiresAt: data.expiresAt,
    risk: data.risk || null,
  };
}

async function createBackendQuote({ amount, currency, merchant, sourceUrl }) {
  const sourceAmount = Number(amount);
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error("Invalid amount");
  }

  const deviceId = await getOrCreateDeviceId();

  const data = await apiRequest("/api/v1/payment-quotes", {
    method: "POST",
    headers: {
      "Idempotency-Key": `quote-${sourceAmount}-${currency}-${Date.now()}`,
    },
    body: JSON.stringify({
      amount: sourceAmount,
      currency: (currency || "USD").toUpperCase(),
      deviceId,
      ...(merchant ? { merchantName: merchant } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    }),
  });

  return mapQuote(data);
}

function getOrCreateDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ bridgeDeviceId: null }, ({ bridgeDeviceId }) => {
      if (bridgeDeviceId && typeof bridgeDeviceId === "string") {
        resolve(bridgeDeviceId);
        return;
      }
      const id = `dev_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      chrome.storage.local.set({ bridgeDeviceId: id }, () => resolve(id));
    });
  });
}

async function createBackendTransaction({ quoteId, merchantName, sourceUrl }) {
  if (!quoteId) throw new Error("Missing quoteId");

  const data = await apiRequest("/api/v1/transactions", {
    method: "POST",
    body: JSON.stringify({
      quoteId,
      merchantName: merchantName || "Foreign merchant",
      ...(sourceUrl ? { sourceUrl } : {}),
    }),
  });

  return {
    transaction: data.transaction,
    fundingInstructions: data.fundingInstructions,
  };
}

async function confirmBackendPayment({ transactionId }) {
  if (!transactionId) throw new Error("Missing transactionId");
  return apiRequest(`/api/v1/transactions/${encodeURIComponent(transactionId)}/confirm`, {
    method: "POST",
  });
}

async function getBackendPaymentStatus({ transactionId }) {
  if (!transactionId) throw new Error("Missing transactionId");
  return apiRequest(`/api/v1/transactions/${encodeURIComponent(transactionId)}`);
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

  if (!origin || !origin.originUrl) return;

  await chrome.storage.session.set({ [`receipt:${tabId}`]: payload });
  await chrome.storage.session.remove(originKey);
  await chrome.tabs.update(tabId, { url: origin.originUrl, active: true });
}
