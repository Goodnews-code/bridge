const params = new URLSearchParams(location.search);
const amount = Number(params.get("amount") || "12.99");
const currency = (params.get("currency") || "USD").toUpperCase();
const merchant = params.get("merchant") || "Foreign merchant";
let quoteId = params.get("quoteId") || "";

const quotePanel = document.getElementById("quote-panel");
const payPanel = document.getElementById("pay-panel");
const pipeline = document.getElementById("pipeline");
const sessionIdEl = document.getElementById("session-id");
const payAmountEl = document.getElementById("pay-amount");
const nairaEl = document.getElementById("pay-nuban");
const bankEl = document.getElementById("pay-bank");
const accountNameEl = document.getElementById("pay-account-name");
const referenceEl = document.getElementById("pay-reference");
const simulateBtn = document.getElementById("simulate");

let quote = null;
let transaction = null;
let funding = null;

boot();

async function boot() {
  try {
    if (!quoteId) {
      quote = await send("GET_QUOTE", {
        amount,
        currency,
        merchant,
        sourceUrl: location.href,
      });
      if (quote.error) throw Object.assign(new Error(quote.error), quote);
      quoteId = quote.quoteId;
    }

    try {
      await openTransaction(quoteId);
    } catch (error) {
      // Locked overlay quote may have expired — mint a fresh one.
      quote = await send("GET_QUOTE", {
        amount,
        currency,
        merchant,
        sourceUrl: location.href,
      });
      if (quote.error) throw Object.assign(new Error(quote.error), quote);
      quoteId = quote.quoteId;
      await openTransaction(quoteId);
    }

    renderQuoteFromTransaction();
    renderFunding();
    payPanel.hidden = false;
    pipeline.hidden = false;
    setStep("quoted", "done");
    setStep("awaiting", "active");
  } catch (error) {
    if (error.code === "RISK_BLOCKED") {
      const reasons =
        error.details && Array.isArray(error.details.reasons)
          ? error.details.reasons.join(" · ")
          : "";
      quotePanel.innerHTML = `<p class="muted">Blocked by Bridge ML risk controls. ${escapeHtml(
        error.message || ""
      )}${reasons ? ` ${escapeHtml(reasons)}` : ""}</p>`;
      return;
    }
    quotePanel.innerHTML = `<p class="muted">Could not reach Bridge backend. Start it on localhost:4000. ${escapeHtml(error.message || "")}</p>`;
  }
}

async function openTransaction(id) {
  const created = await send("CREATE_TRANSACTION", {
    quoteId: id,
    merchantName: merchant,
    sourceUrl: location.href,
  });
  transaction = created.transaction;
  funding = created.fundingInstructions;
  const priorRisk = quote && quote.risk ? quote.risk : null;
  quote = {
    quoteId: id,
    sourceAmount: transaction.merchantAmount,
    sourceCurrency: transaction.merchantCurrency,
    midNgn: transaction.merchantAmount * transaction.exchangeRate,
    fee: transaction.amountToTransferNGN - transaction.merchantAmount * transaction.exchangeRate,
    spreadPercent: transaction.spreadPercent,
    totalNgn: transaction.amountToTransferNGN,
    rate: transaction.amountToTransferNGN / transaction.merchantAmount,
    exchangeRate: transaction.exchangeRate,
    risk: priorRisk,
  };
}

function renderQuoteFromTransaction() {
  const feeLabel = quote.spreadPercent != null ? `${quote.spreadPercent}%` : "fee";
  const riskLine =
    quote.risk && quote.risk.decision
      ? `<p class="muted">Risk ${escapeHtml(quote.risk.decision)} (${Number(quote.risk.score).toFixed(2)})${
          quote.risk.model ? ` · ${escapeHtml(quote.risk.model)}` : ""
        }</p>`
      : "";
  quotePanel.innerHTML = `
    <p class="muted">${escapeHtml(merchant)}</p>
    <div class="totals">
      <div><span>Foreign amount</span><span>${formatFx(quote.sourceAmount, quote.sourceCurrency)}</span></div>
      <div><span>Mid-market</span><span>${formatNaira(quote.midNgn)}</span></div>
      <div><span>Spread (${feeLabel})</span><span>${formatNaira(Math.max(0, quote.fee))}</span></div>
      <div><span>You pay</span><strong>${formatNaira(quote.totalNgn)}</strong></div>
    </div>
    ${riskLine}
  `;
}

function renderFunding() {
  sessionIdEl.textContent = transaction.id;
  payAmountEl.textContent = formatNaira(
    funding && funding.amount != null ? funding.amount : quote.totalNgn
  );
  if (nairaEl) nairaEl.textContent = funding.accountNumber || "—";
  if (bankEl) bankEl.textContent = funding.bank || "—";
  if (accountNameEl) accountNameEl.textContent = funding.accountName || "—";
  if (referenceEl) referenceEl.textContent = funding.reference || "—";
}

simulateBtn.addEventListener("click", async () => {
  if (!transaction) return;
  simulateBtn.disabled = true;
  simulateBtn.textContent = "Confirming transfer…";

  try {
    await send("CONFIRM_PAYMENT", { transactionId: transaction.id });
    setStep("awaiting", "done");
    setStep("received", "active");
    simulateBtn.textContent = "Settling with merchant…";

    const finalTx = await pollUntilDone(transaction.id);
    if (finalTx.simplifiedStatus === "failed") {
      throw new Error(`Payment failed (${finalTx.status})`);
    }

    setStep("settled", "done");
    simulateBtn.textContent = "Returning to merchant…";

    window.setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "SETTLEMENT_COMPLETE",
        payload: {
          sessionId: finalTx.id,
          merchant,
          amount,
          currency,
          totalNgn: finalTx.amountToTransferNGN || quote.totalNgn,
          status: "SETTLED",
          at: Date.now(),
        },
      });
    }, 450);
  } catch (error) {
    simulateBtn.disabled = false;
    simulateBtn.textContent = "I have paid this Naira amount";
    quotePanel.insertAdjacentHTML(
      "beforeend",
      `<p class="muted">${escapeHtml(error.message || "Payment failed")}</p>`
    );
  }
});

async function pollUntilDone(transactionId) {
  const maxAttempts = 40;
  for (let i = 0; i < maxAttempts; i += 1) {
    const tx = await send("GET_PAYMENT_STATUS", { transactionId });
    applyStatus(tx.status, tx.simplifiedStatus);
    if (tx.simplifiedStatus === "successful" || tx.simplifiedStatus === "failed") {
      return tx;
    }
    await wait(500);
  }
  throw new Error("Timed out waiting for settlement");
}

function applyStatus(status, simplified) {
  if (status === "TRANSFER_CONFIRMED") {
    setStep("received", "done");
    setStep("converting", "active");
  } else if (status === "CARD_CREATING" || status === "CARD_FUNDED") {
    setStep("received", "done");
    setStep("converting", "done");
    setStep("paying", "active");
  } else if (status === "PAYMENT_PROCESSING") {
    setStep("converting", "done");
    setStep("paying", "active");
  } else if (status === "PAYMENT_SUCCESSFUL" || simplified === "successful") {
    setStep("paying", "done");
    setStep("settled", "done");
  } else if (simplified === "processing") {
    setStep("received", "done");
    setStep("converting", "active");
  }
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

function send(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from extension"));
        return;
      }
      if (response.error) {
        reject(
          Object.assign(new Error(response.error), {
            code: response.code || null,
            details: response.details || null,
          })
        );
        return;
      }
      resolve(response);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
