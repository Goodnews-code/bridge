const params = new URLSearchParams(location.search);
const amount = Number(params.get("amount") || "12.99");
const currency = (params.get("currency") || "USD").toUpperCase();
const merchant = params.get("merchant") || "Foreign merchant";

const quotePanel = document.getElementById("quote-panel");
const payPanel = document.getElementById("pay-panel");
const pipeline = document.getElementById("pipeline");
const sessionIdEl = document.getElementById("session-id");
const payAmountEl = document.getElementById("pay-amount");
const simulateBtn = document.getElementById("simulate");

const sessionId = `ND-${Date.now().toString(36).toUpperCase()}`;
sessionIdEl.textContent = sessionId;

let quote = null;

chrome.runtime.sendMessage(
  { type: "GET_QUOTE", payload: { amount, currency } },
  (response) => {
    if (!response || response.error) {
      quotePanel.innerHTML = `<p class="muted">Could not fetch FX rate. ${response && response.error ? response.error : ""}</p>`;
      return;
    }
    quote = response;
    renderQuote();
    payPanel.hidden = false;
    pipeline.hidden = false;
    setStep("quoted", "done");
    setStep("awaiting", "active");
  }
);

function renderQuote() {
  quotePanel.innerHTML = `
    <p class="muted">${escapeHtml(merchant)}</p>
    <div class="totals">
      <div><span>Foreign amount</span><span>${formatFx(quote.sourceAmount, quote.sourceCurrency)}</span></div>
      <div><span>Mid-market</span><span>${formatNaira(quote.midNgn)}</span></div>
      <div><span>Fee (1.5%)</span><span>${formatNaira(quote.fee)}</span></div>
      <div><span>You pay</span><strong>${formatNaira(quote.totalNgn)}</strong></div>
    </div>
  `;
  payAmountEl.textContent = formatNaira(quote.totalNgn);
}

simulateBtn.addEventListener("click", async () => {
  simulateBtn.disabled = true;
  simulateBtn.textContent = "Processing…";
  setStep("awaiting", "done");
  await advance("received", 700);
  await advance("converting", 1100);
  await advance("paying", 1100);
  setStep("settled", "done");
  simulateBtn.textContent = "Returning to merchant…";

  window.setTimeout(() => {
    chrome.runtime.sendMessage({
      type: "SETTLEMENT_COMPLETE",
      payload: {
        sessionId,
        merchant,
        amount,
        currency,
        totalNgn: quote.totalNgn,
        status: "SETTLED",
        at: Date.now(),
      },
    });
  }, 450);
});

function advance(step, delay) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      setStep(step, "done");
      const order = ["quoted", "awaiting", "received", "converting", "paying", "settled"];
      const next = order[order.indexOf(step) + 1];
      if (next && next !== "settled") setStep(next, "active");
      resolve();
    }, delay);
  });
}

function setStep(name, state) {
  pipeline.querySelectorAll("li").forEach((item) => {
    if (item.dataset.step === name) {
      item.classList.remove("active", "done");
      item.classList.add(state);
    } else if (state === "active" && item.classList.contains("active")) {
      item.classList.remove("active");
    }
  });
}

function formatFx(value, code) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
}

function formatNaira(value) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
