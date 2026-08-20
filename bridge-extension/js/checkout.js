// Bridge checkout page. Reads the transaction id from the URL, pulls the real
// funding instructions the service worker stored (GET_TRANSACTION), and — once
// the user says they've paid — records the claim (CONFIRM_TRANSFER) and polls
// the backend (GET_STATUS) until settlement. No FX, no NUBAN, and no timers are
// hard-coded here: every figure comes from the backend.
const params = new URLSearchParams(location.search);
const txnId = params.get("txn");

const quotePanel = document.getElementById("quote-panel");
const payPanel = document.getElementById("pay-panel");
const pipeline = document.getElementById("pipeline");
const sessionIdEl = document.getElementById("session-id");
const payAmountEl = document.getElementById("pay-amount");
const accountNameEl = document.getElementById("account-name");
const accountNumberEl = document.getElementById("account-number");
const bankEl = document.getElementById("bank");
const referenceEl = document.getElementById("reference");
const errorEl = document.getElementById("checkout-error");
const payBtn = document.getElementById("simulate");

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60000;

let state = null; // { transaction, fundingInstructions, merchant, amount, currency }
let polling = false;

init();

async function init() {
  if (!txnId) {
    quotePanel.innerHTML = `<p class="muted">No transaction reference. Start again from the merchant page.</p>`;
    return;
  }

  const res = await sendMessage({ type: "GET_TRANSACTION", payload: { transactionId: txnId } });
  if (!res || !res.ok) {
    quotePanel.innerHTML = `<p class="muted">Could not load this checkout${
      res && res.error ? ` — ${escapeHtml(res.error)}` : ""
    }. Start again from the merchant page.</p>`;
    return;
  }

  state = res;
  renderDetails();
  payPanel.hidden = false;
  pipeline.hidden = false;
  setStep("quoted", "done");
  setStep("awaiting", "active");

  payBtn.addEventListener("click", onIHavePaid);
}

function renderDetails() {
  const tx = state.transaction;
  const fi = state.fundingInstructions;

  // A Naira checkout settles 1:1 with no spread — show only the amount, not the
  // FX rate / fee rows (which would read "Rate ₦1 / NGN", "Fee (0%) ₦0").
  const isPassThrough = tx.exchangeRate === 1 && tx.spreadPercent === 0;

  const rows = [];
  if (!isPassThrough) {
    const base = tx.merchantAmount * tx.exchangeRate;
    const feeNgn = Math.max(0, tx.amountToTransferNGN - base);
    rows.push(
      `<div><span>Foreign amount</span><span>${formatFx(tx.merchantAmount, tx.merchantCurrency)}</span></div>`,
      `<div><span>Rate</span><span>₦${Math.round(tx.exchangeRate).toLocaleString("en-NG")} / ${escapeHtml(tx.merchantCurrency)}</span></div>`,
      `<div><span>Fee (${escapeHtml(String(tx.spreadPercent))}%)</span><span>${formatNaira(feeNgn)}</span></div>`
    );
  }
  rows.push(`<div><span>You pay</span><strong>${formatNaira(tx.amountToTransferNGN)}</strong></div>`);

  quotePanel.innerHTML = `
    <p class="muted">${escapeHtml(state.merchant)}</p>
    <div class="totals">
      ${rows.join("\n      ")}
    </div>
  `;

  accountNameEl.textContent = fi.accountName;
  accountNumberEl.textContent = fi.accountNumber;
  bankEl.textContent = fi.bank;
  referenceEl.textContent = fi.reference;
  payAmountEl.textContent = formatNaira(fi.amount);
  sessionIdEl.textContent = tx.id;
}

async function onIHavePaid() {
  if (polling) return;
  hideError();
  payBtn.disabled = true;
  payBtn.textContent = "Confirming…";

  const confirm = await sendMessage({
    type: "CONFIRM_TRANSFER",
    payload: { transactionId: txnId },
  });

  if (!confirm || !confirm.ok) {
    payBtn.disabled = false;
    payBtn.textContent = "I have paid this Naira amount";
    showError(confirm && confirm.error ? confirm.error : "Could not confirm right now. Try again.");
    return;
  }

  setStep("awaiting", "done");
  payBtn.textContent = "Processing…";
  pollStatus();
}

function pollStatus() {
  polling = true;
  const startedAt = Date.now();

  const tick = async () => {
    const res = await sendMessage({ type: "GET_STATUS", payload: { transactionId: txnId } });

    if (res && res.ok) {
      applyStatus(res);
      if (res.simplifiedStatus === "successful") return onSettled();
      if (res.simplifiedStatus === "failed") return onFailed();
    }

    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      polling = false;
      payBtn.textContent = "Still verifying…";
      showError(
        "This is taking longer than expected. Your transfer is still being verified — you can safely leave this open."
      );
      return;
    }

    window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  tick();
}

// Map the transaction's status onto the visual pipeline. simplifiedStatus is the
// contract; the internal status (when present) lets us light up finer steps.
function applyStatus(res) {
  const internal = res.status || "";
  const simple = res.simplifiedStatus;

  if (simple === "pending") {
    setStep("awaiting", "active");
    return;
  }

  if (simple === "processing") {
    setStep("awaiting", "done");
    setStep("received", "done");
    if (internal === "CARD_FUNDED" || internal === "PAYMENT_PROCESSING") {
      setStep("converting", "done");
      setStep("paying", "active");
    } else {
      setStep("converting", "active");
    }
    return;
  }

  if (simple === "successful") {
    ["awaiting", "received", "converting", "paying"].forEach((step) => setStep(step, "done"));
    setStep("settled", "done");
  }
}

function onSettled() {
  polling = false;
  setStep("settled", "done");
  payBtn.textContent = "Returning to merchant…";

  const tx = state.transaction;
  window.setTimeout(() => {
    chrome.runtime.sendMessage({
      type: "SETTLEMENT_COMPLETE",
      payload: {
        sessionId: tx.id,
        merchant: state.merchant,
        amount: tx.merchantAmount,
        currency: tx.merchantCurrency,
        totalNgn: tx.amountToTransferNGN,
        status: "SETTLED",
        at: Date.now(),
      },
    });
  }, 600);
}

function onFailed() {
  polling = false;
  payBtn.disabled = false;
  payBtn.textContent = "I have paid this Naira amount";
  showError("The payment could not be completed. No Naira was captured — you can try again.");
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response));
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

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function hideError() {
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function formatFx(value, code) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value);
  } catch (_error) {
    return `${code} ${value}`;
  }
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
