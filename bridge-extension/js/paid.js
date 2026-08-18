function nairaDirectFormatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function nairaDirectEnsurePaidStyles() {
  if (document.getElementById("nairadirect-paid-css")) return;
  const link = document.createElement("link");
  link.id = "nairadirect-paid-css";
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("css/paid.css");
  document.documentElement.appendChild(link);
}

function nairaDirectShowPaid(payload) {
  nairaDirectEnsurePaidStyles();

  const payPanel = document.getElementById("nd-pay-panel");
  const paidPanel = document.getElementById("nd-paid-panel");
  const receiptEl = document.getElementById("nd-receipt");
  const nairaEl = document.getElementById("nd-paid-naira");
  const sessionEl = document.getElementById("nd-paid-session");

  if (payPanel) payPanel.hidden = true;
  if (paidPanel) paidPanel.hidden = false;
  if (nairaEl && payload.totalNgn) nairaEl.textContent = nairaDirectFormatNaira(payload.totalNgn);
  if (sessionEl && payload.sessionId) sessionEl.textContent = payload.sessionId;
  if (receiptEl && payload.sessionId) {
    receiptEl.textContent = `${payload.sessionId} · ${nairaDirectFormatNaira(payload.totalNgn || 0)}`;
  }

  document.querySelectorAll("button, input[type='submit']").forEach((node) => {
    const label = `${node.textContent || ""} ${node.value || ""}`;
    if (/pay|subscribe|checkout|complete order/i.test(label)) {
      node.disabled = true;
      if (node.tagName === "BUTTON") node.textContent = "Paid";
      if (node.tagName === "INPUT") node.value = "Paid";
    }
  });

  if (document.getElementById("nairadirect-paid-banner")) return;

  const banner = document.createElement("div");
  banner.id = "nairadirect-paid-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <strong>Payment made</strong>
    <span>Bridge settled this checkout${payload.totalNgn ? ` · ${nairaDirectFormatNaira(payload.totalNgn)}` : ""}.</span>
  `;
  document.documentElement.appendChild(banner);
  document.body.classList.add("nairadirect-paid");
}
