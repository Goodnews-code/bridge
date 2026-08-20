function bridgeFormatNaira(amount) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function bridgeEnsurePaidStyles() {
  if (document.getElementById("bridge-paid-css")) return;
  const link = document.createElement("link");
  link.id = "bridge-paid-css";
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("css/paid.css");
  document.documentElement.appendChild(link);
}

function bridgeShowPaid(payload) {
  bridgeEnsurePaidStyles();

  const payPanel = document.getElementById("nd-pay-panel");
  const paidPanel = document.getElementById("nd-paid-panel");
  const receiptEl = document.getElementById("nd-receipt");
  const nairaEl = document.getElementById("nd-paid-naira");
  const sessionEl = document.getElementById("nd-paid-session");

  if (payPanel) payPanel.hidden = true;
  if (paidPanel) paidPanel.hidden = false;
  if (nairaEl && payload.totalNgn) nairaEl.textContent = bridgeFormatNaira(payload.totalNgn);
  if (sessionEl && payload.sessionId) sessionEl.textContent = payload.sessionId;
  if (receiptEl && payload.sessionId) {
    receiptEl.textContent = `${payload.sessionId} · ${bridgeFormatNaira(payload.totalNgn || 0)}`;
  }

  document.querySelectorAll("button, input[type='submit']").forEach((node) => {
    const label = `${node.textContent || ""} ${node.value || ""}`;
    if (/pay|subscribe|checkout|complete order/i.test(label)) {
      node.disabled = true;
      if (node.tagName === "BUTTON") node.textContent = "Paid";
      if (node.tagName === "INPUT") node.value = "Paid";
    }
  });

  if (document.getElementById("bridge-paid-banner")) return;

  const banner = document.createElement("div");
  banner.id = "bridge-paid-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `
    <strong>Payment made</strong>
    <span>Bridge settled this checkout${payload.totalNgn ? ` · ${bridgeFormatNaira(payload.totalNgn)}` : ""}.</span>
  `;
  document.documentElement.appendChild(banner);
  document.body.classList.add("bridge-paid");
}
